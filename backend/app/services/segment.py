from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from os import cpu_count
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from backend.app.core.config import Settings, get_settings
from backend.app.core.errors import unprocessable_entity

U2NET_MODELS = {"u2net", "u2netp"}
ISNET_MODELS = {"isnet-general-use"}
MODEL_ALIASES = {"isnet": "isnet-general-use", "birefnet_lite": "birefnet-lite"}


@dataclass(slots=True)
class SegmentResult:
    mask: np.ndarray
    width: int
    height: int


class BaseSegmenter:
    def __init__(self, settings: Settings, model_name: str, model_dir: Path) -> None:
        self.settings = settings
        self.model_name = model_name
        self.model_dir = model_dir
        self.session = None

    def _find_onnx_path(self) -> Path:
        candidates = sorted(self.model_dir.rglob("*.onnx"))
        if not candidates:
            raise unprocessable_entity("The configured segmentation model was not found on disk.")
        return candidates[0]

    def _build_session(self) -> ort.InferenceSession:
        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        session_options.intra_op_num_threads = max(1, min(cpu_count() or 1, 4))
        return ort.InferenceSession(
            str(self._find_onnx_path()),
            providers=["CPUExecutionProvider"],
            sess_options=session_options,
        )

    def load(self) -> None:
        raise NotImplementedError

    def predict_mask(self, image: Image.Image) -> SegmentResult:
        raise NotImplementedError


class BiRefNetSegmenter(BaseSegmenter):
    def __init__(self, settings: Settings, model_name: str, model_dir: Path) -> None:
        super().__init__(settings, model_name, model_dir)
        self.processor = None
        self.input_name = None
        self.output_name = None

    def load(self) -> None:
        if self.processor is not None and self.session is not None:
            return

        from transformers import AutoImageProcessor

        self.processor = AutoImageProcessor.from_pretrained(self.model_dir)
        self.session = self._build_session()
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def _build_feeds(self, processed: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
        assert self.input_name is not None

        feeds = {
            key: value.astype(np.float32) if hasattr(value, "astype") else value
            for key, value in processed.items()
        }

        if self.input_name in feeds:
            return {self.input_name: feeds[self.input_name]}

        if "pixel_values" in feeds:
            return {self.input_name: feeds["pixel_values"]}

        first_key = next(iter(feeds), None)
        if first_key is None:
            raise unprocessable_entity("The segmentation preprocessor did not return any model inputs.")

        return {self.input_name: feeds[first_key]}

    def predict_mask(self, image: Image.Image) -> SegmentResult:
        self.load()

        assert self.processor is not None
        assert self.session is not None
        assert self.input_name is not None
        assert self.output_name is not None

        rgb_image = image.convert("RGB")
        processed = self.processor(images=rgb_image, return_tensors="np")
        outputs = self.session.run([self.output_name], self._build_feeds(processed))[0]
        logits = np.asarray(outputs).squeeze()
        if logits.ndim == 3:
            logits = logits[0]

        probabilities = 1.0 / (1.0 + np.exp(-logits))
        mask = np.clip(probabilities * 255.0, 0, 255).astype(np.uint8)
        mask_image = Image.fromarray(mask, mode="L").resize(rgb_image.size, Image.Resampling.BILINEAR)
        return SegmentResult(mask=np.array(mask_image, dtype=np.uint8), width=rgb_image.width, height=rgb_image.height)


class U2NetSegmenter(BaseSegmenter):
    INPUT_SIZE = (320, 320)
    MEAN = (0.485, 0.456, 0.406)
    STD = (0.229, 0.224, 0.225)

    def __init__(self, settings: Settings, model_name: str, model_dir: Path) -> None:
        super().__init__(settings, model_name, model_dir)
        self.input_name = None

    def load(self) -> None:
        if self.session is not None:
            return

        self.session = self._build_session()
        self.input_name = self.session.get_inputs()[0].name

    def _normalize(self, image: Image.Image) -> dict[str, np.ndarray]:
        assert self.input_name is not None

        resized = image.convert("RGB").resize(self.INPUT_SIZE, Image.Resampling.LANCZOS)
        image_array = np.asarray(resized, dtype=np.float32)
        image_array = image_array / max(float(np.max(image_array)), 1e-6)

        normalized = np.empty_like(image_array, dtype=np.float32)
        normalized[:, :, 0] = (image_array[:, :, 0] - self.MEAN[0]) / self.STD[0]
        normalized[:, :, 1] = (image_array[:, :, 1] - self.MEAN[1]) / self.STD[1]
        normalized[:, :, 2] = (image_array[:, :, 2] - self.MEAN[2]) / self.STD[2]

        batched = normalized.transpose((2, 0, 1))[None, ...].astype(np.float32)
        return {self.input_name: batched}

    def predict_mask(self, image: Image.Image) -> SegmentResult:
        self.load()

        assert self.session is not None

        rgba_image = image.convert("RGBA")
        prediction = np.asarray(self.session.run(None, self._normalize(rgba_image))[0], dtype=np.float32)
        prediction = np.squeeze(prediction)

        if prediction.ndim == 3:
            prediction = prediction[0]

        prediction_min = float(np.min(prediction))
        prediction_max = float(np.max(prediction))
        if prediction_max <= prediction_min:
            raise unprocessable_entity("The segmentation model returned an empty foreground map.")

        normalized = (prediction - prediction_min) / (prediction_max - prediction_min)
        mask = np.clip(normalized * 255.0, 0, 255).astype(np.uint8)
        mask_image = Image.fromarray(mask, mode="L").resize(rgba_image.size, Image.Resampling.LANCZOS)
        return SegmentResult(mask=np.array(mask_image, dtype=np.uint8), width=rgba_image.width, height=rgba_image.height)


class IsNetSegmenter(U2NetSegmenter):
    INPUT_SIZE = (1024, 1024)
    MEAN = (0.5, 0.5, 0.5)
    STD = (1.0, 1.0, 1.0)


def resolve_model_dir(settings: Settings, model_name: str) -> Path:
    normalized_name = MODEL_ALIASES.get(model_name.strip().lower(), model_name.strip().lower())
    if normalized_name == settings.model_name.strip().lower():
        return Path(settings.model_dir)
    return Path(settings.model_dir).parent / normalized_name


@lru_cache(maxsize=4)
def get_segmenter(model_name: str | None = None) -> BaseSegmenter:
    settings = get_settings()
    resolved_name = MODEL_ALIASES.get((model_name or settings.model_name).strip().lower(), (model_name or settings.model_name).strip().lower())
    model_dir = resolve_model_dir(settings, resolved_name)

    if resolved_name in U2NET_MODELS:
        return U2NetSegmenter(settings, resolved_name, model_dir)
    if resolved_name in ISNET_MODELS:
        return IsNetSegmenter(settings, resolved_name, model_dir)
    return BiRefNetSegmenter(settings, resolved_name, model_dir)
