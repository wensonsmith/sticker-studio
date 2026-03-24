from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import cv2
import numpy as np
from PIL import Image, ImageFilter

from backend.app.core.errors import unprocessable_entity

PADDING_RATIO = 0.05


@dataclass(slots=True)
class ComposeOptions:
    outline_px: int
    size: int
    output_format: str


def _bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int]:
    points = cv2.findNonZero(mask)
    if points is None:
        raise unprocessable_entity("The final contour mask was empty.")
    x, y, width, height = cv2.boundingRect(points)
    return x, y, width, height


def compose_sticker(source_image: Image.Image, mask: np.ndarray, options: ComposeOptions) -> bytes:
    rgba_source = source_image.convert("RGBA")
    base_mask = mask.astype(np.uint8)
    if int(np.count_nonzero(base_mask)) == 0:
        raise unprocessable_entity("The final contour mask was empty.")

    outline_mask = np.zeros_like(base_mask)
    if options.outline_px > 0:
        kernel_size = options.outline_px * 2 + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        dilated = cv2.dilate(base_mask, kernel, iterations=1)
        outline_mask = cv2.subtract(dilated, base_mask)

    combined_mask = np.maximum(base_mask, outline_mask)
    x, y, width, height = _bbox_from_mask(combined_mask)

    cropped_source = rgba_source.crop((x, y, x + width, y + height))
    cropped_foreground_mask = Image.fromarray(base_mask[y:y + height, x:x + width], mode="L")
    cropped_outline_mask = Image.fromarray(outline_mask[y:y + height, x:x + width], mode="L")

    inner_size = max(1, int(round(options.size * (1.0 - PADDING_RATIO * 2.0))))
    scale = min(inner_size / width, inner_size / height)
    target_width = max(1, int(round(width * scale)))
    target_height = max(1, int(round(height * scale)))
    offset_x = int(round((options.size - target_width) / 2))
    offset_y = int(round((options.size - target_height) / 2))

    foreground_image = cropped_source.resize((target_width, target_height), Image.Resampling.LANCZOS)
    foreground_alpha = cropped_foreground_mask.resize((target_width, target_height), Image.Resampling.LANCZOS)
    foreground_alpha = foreground_alpha.filter(ImageFilter.GaussianBlur(radius=0.6))
    foreground_image.putalpha(foreground_alpha)

    canvas = Image.new("RGBA", (options.size, options.size), (0, 0, 0, 0))
    if options.outline_px > 0:
        outline_alpha = cropped_outline_mask.resize((target_width, target_height), Image.Resampling.LANCZOS)
        outline_alpha = outline_alpha.filter(ImageFilter.GaussianBlur(radius=0.8))
        outline_layer = Image.new("RGBA", (target_width, target_height), (255, 255, 255, 0))
        outline_layer.putalpha(outline_alpha)
        canvas.alpha_composite(outline_layer, (offset_x, offset_y))

    canvas.alpha_composite(foreground_image, (offset_x, offset_y))

    buffer = BytesIO()
    if options.output_format == "webp":
        canvas.save(buffer, format="WEBP", quality=90, lossless=True)
    else:
        canvas.save(buffer, format="PNG")
    return buffer.getvalue()
