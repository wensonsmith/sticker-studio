from dataclasses import dataclass

from backend.app.core.config import Settings
from backend.app.core.errors import bad_request, payload_too_large, unsupported_media_type

ALLOWED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
ALLOWED_OUTPUT_FORMATS = {"png", "webp"}
MAX_OUTPUT_SIZE = 1024
MIN_OUTPUT_SIZE = 256
MAX_OUTLINE_PX = 48
MAX_SMOOTHNESS = 4


@dataclass(slots=True)
class StickerizeInput:
    source_kind: str
    buffer: bytes | None
    image_url: str | None
    outline_px: int
    size: int
    output_format: str
    mask_threshold: int
    smoothness: int


def _parse_int(raw_value: object, field_name: str, default: int) -> int:
    if raw_value is None or raw_value == "":
        return default

    try:
        return int(str(raw_value))
    except (TypeError, ValueError) as error:
        raise bad_request(f"{field_name} must be an integer.") from error


def _normalize_common_fields(payload: dict[str, object], settings: Settings) -> tuple[int, int, str, int, int]:
    outline_px = _parse_int(payload.get("outlinePx"), "outlinePx", settings.default_outline_px)
    size = _parse_int(payload.get("size"), "size", settings.default_size)
    mask_threshold = _parse_int(payload.get("maskThreshold"), "maskThreshold", settings.default_mask_threshold)
    smoothness = _parse_int(payload.get("smoothness"), "smoothness", settings.default_smoothness)
    output_format = str(payload.get("format") or "png").strip().lower()

    if not 0 <= outline_px <= MAX_OUTLINE_PX:
        raise bad_request(f"outlinePx must be between 0 and {MAX_OUTLINE_PX}.")

    if not MIN_OUTPUT_SIZE <= size <= MAX_OUTPUT_SIZE:
        raise bad_request(f"size must be between {MIN_OUTPUT_SIZE} and {MAX_OUTPUT_SIZE}.")

    if output_format not in ALLOWED_OUTPUT_FORMATS:
        raise bad_request("format must be either 'png' or 'webp'.")

    if not 1 <= mask_threshold <= 254:
        raise bad_request("maskThreshold must be between 1 and 254.")

    if not 0 <= smoothness <= MAX_SMOOTHNESS:
        raise bad_request(f"smoothness must be between 0 and {MAX_SMOOTHNESS}.")

    return outline_px, size, output_format, mask_threshold, smoothness


async def parse_request_input(request, settings: Settings) -> StickerizeInput:
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        file_entry = form.get("file")
        if file_entry is None:
            raise bad_request("file is required for multipart requests.")

        if getattr(file_entry, "content_type", None) not in ALLOWED_IMAGE_MIME_TYPES:
            raise unsupported_media_type("Only PNG, JPEG, and WebP uploads are supported.")

        payload = {key: form.get(key) for key in ("outlinePx", "size", "format", "maskThreshold", "smoothness")}
        outline_px, size, output_format, mask_threshold, smoothness = _normalize_common_fields(payload, settings)

        buffer = await file_entry.read()
        if len(buffer) > settings.max_image_bytes:
            raise payload_too_large("The uploaded image exceeded the configured size limit.")

        return StickerizeInput(
            source_kind="upload",
            buffer=buffer,
            image_url=None,
            outline_px=outline_px,
            size=size,
            output_format=output_format,
            mask_threshold=mask_threshold,
            smoothness=smoothness,
        )

    if content_type.startswith("application/json"):
        payload = await request.json()
        if not isinstance(payload, dict):
            raise bad_request("JSON requests must use an object body.")

        image_url = str(payload.get("imageUrl") or "").strip()
        if not image_url:
            raise bad_request("imageUrl is required for JSON requests.")

        outline_px, size, output_format, mask_threshold, smoothness = _normalize_common_fields(payload, settings)
        return StickerizeInput(
            source_kind="url",
            buffer=None,
            image_url=image_url,
            outline_px=outline_px,
            size=size,
            output_format=output_format,
            mask_threshold=mask_threshold,
            smoothness=smoothness,
        )

    raise bad_request("Content-Type must be multipart/form-data or application/json.")
