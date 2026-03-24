from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from backend.app.core.errors import unprocessable_entity

MIN_FOREGROUND_PIXELS = 512


@dataclass(slots=True)
class PreparedContour:
    mask: np.ndarray
    bbox: tuple[int, int, int, int]


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    flood = mask.copy()
    height, width = mask.shape[:2]
    flood_fill_mask = np.zeros((height + 2, width + 2), dtype=np.uint8)
    cv2.floodFill(flood, flood_fill_mask, (0, 0), 255)
    inverse = cv2.bitwise_not(flood)
    return cv2.bitwise_or(mask, inverse)


def _largest_component(mask: np.ndarray) -> np.ndarray:
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if component_count <= 1:
        raise unprocessable_entity("The primary object contour could not be isolated.")

    component_index = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    largest = np.where(labels == component_index, 255, 0).astype(np.uint8)
    if int(np.count_nonzero(largest)) < MIN_FOREGROUND_PIXELS:
        raise unprocessable_entity("The detected object was too small to build a stable outline.")
    return largest


def _smooth_mask(mask: np.ndarray, smoothness: int) -> np.ndarray:
    kernel_size = 3 + smoothness * 2
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    if smoothness > 0:
        blurred = cv2.GaussianBlur(closed, (0, 0), sigmaX=0.8 + smoothness * 0.7)
        _, closed = cv2.threshold(blurred, 127, 255, cv2.THRESH_BINARY)
    return closed


def prepare_primary_contour(mask: np.ndarray, mask_threshold: int, smoothness: int) -> PreparedContour:
    _, thresholded = cv2.threshold(mask, mask_threshold, 255, cv2.THRESH_BINARY)
    largest = _largest_component(thresholded)
    filled = _fill_holes(largest)
    smoothed = _smooth_mask(filled, smoothness)

    contours, _ = cv2.findContours(smoothed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise unprocessable_entity("The extracted object mask did not yield a valid outer contour.")

    contour = max(contours, key=cv2.contourArea)

    final_mask = np.zeros_like(smoothed)
    cv2.drawContours(final_mask, [contour], contourIdx=-1, color=255, thickness=cv2.FILLED)

    x, y, width, height = cv2.boundingRect(contour)
    if width <= 0 or height <= 0:
        raise unprocessable_entity("The extracted object contour was empty.")

    return PreparedContour(mask=final_mask, bbox=(x, y, width, height))
