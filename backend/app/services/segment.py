from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
from transformers import AutoImageProcessor

from backend.app.core.config import Settings, get_settings
from backend.app.core.errors import unprocessable_entity


@dataclass(slots=True)
class SegmentResult:
    mask: np.ndarray
    width: int
    height: int


class BiRefNetSegmenter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.model_dir = Path(settings.model_dir)
        self.processor = None
        self.session = None
        self.input_name = None
        self.output_name = None

    def _find_onnx_path(self) -> Path:
        candidates = sorted(self.model_dir.rglob("*.onnx"))
        if not candidates:
            raise unprocessable_entity("The configured segmentation model was not found on disk.")
        return candidates[0]

    def load(self) -> None:
        if self.processor is not None and self.session is not None:
            return

        self.processor = AutoImageProcessor.from_pretrained(self.model_dir)
        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_options.intra_op_num_threads = 0
        self.session = ort.InferenceSession(
            str(self._find_onnx_path()),
            providers=["CPUExecutionProvider"],
            sess_options=session_options,
        )
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


@lru_cache(maxsize=1)
def get_segmenter() -> BiRefNetSegmenter:
    return BiRefNetSegmenter(get_settings())
