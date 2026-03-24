from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from backend.app.core.errors import unsupported_media_type

ALLOWED_IMAGE_FORMATS = {"PNG", "JPEG", "WEBP"}


@dataclass(slots=True)
class DecodedImage:
    image: Image.Image
    source_format: str


def decode_image(buffer: bytes) -> DecodedImage:
    try:
        image = Image.open(BytesIO(buffer))
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise unsupported_media_type("The uploaded content could not be decoded as an image.") from error

    source_format = (image.format or "").upper()
    if source_format not in ALLOWED_IMAGE_FORMATS:
        raise unsupported_media_type("Only PNG, JPEG, and WebP images are supported.")

    return DecodedImage(image=image.convert("RGBA"), source_format=source_format)


def resize_longest_edge(image: Image.Image, max_edge: int) -> Image.Image:
    width, height = image.size
    longest_edge = max(width, height)
    if longest_edge <= max_edge:
        return image.copy()

    scale = max_edge / float(longest_edge)
    resized = image.resize(
        (max(1, round(width * scale)), max(1, round(height * scale))),
        Image.Resampling.LANCZOS,
    )
    return resized
