import sharp, { type OverlayOptions } from "sharp";
import type { OutputFormat } from "@/lib/stickerize/config";
import { unprocessableEntity } from "@/lib/stickerize/errors";

export type ComposeStickerOptions = {
  outlinePx: number;
  size: number;
  format: OutputFormat;
};

type BoundingBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const FOREGROUND_ALPHA_THRESHOLD = 24;
const MIN_FOREGROUND_PIXELS = 512;
const PADDING_RATIO = 0.05;

function getIndex(x: number, y: number, width: number) {
  return y * width + x;
}

function createLargestComponentMask(alpha: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(alpha.length);
  let bestPixels: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = getIndex(x, y, width);
      if (visited[start] || alpha[start] <= FOREGROUND_ALPHA_THRESHOLD) {
        continue;
      }

      const stack = [start];
      const pixels: number[] = [];
      visited[start] = 1;

      while (stack.length > 0) {
        const index = stack.pop()!;
        pixels.push(index);
        const px = index % width;
        const py = Math.floor(index / width);

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) {
              continue;
            }

            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }

            const nextIndex = getIndex(nx, ny, width);
            if (visited[nextIndex] || alpha[nextIndex] <= FOREGROUND_ALPHA_THRESHOLD) {
              continue;
            }

            visited[nextIndex] = 1;
            stack.push(nextIndex);
          }
        }
      }

      if (pixels.length > bestPixels.length) {
        bestPixels = pixels;
      }
    }
  }

  if (bestPixels.length < MIN_FOREGROUND_PIXELS) {
    throw unprocessableEntity("The sticker subject could not be isolated clearly enough.");
  }

  const cleaned = new Uint8Array(alpha.length);
  for (const pixelIndex of bestPixels) {
    cleaned[pixelIndex] = 255;
  }

  return cleaned;
}

function getBoundingBox(mask: Uint8Array, width: number, height: number): BoundingBox {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[getIndex(x, y, width)] === 0) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    throw unprocessableEntity("The generated foreground mask was empty.");
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function alphaToRgba(alpha: Uint8Array) {
  const rgba = new Uint8ClampedArray(alpha.length * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = alpha[index];
  }
  return Buffer.from(rgba);
}

function applyMaskToForeground(rgba: Uint8Array, alpha: Uint8Array) {
  const result = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    result[offset] = rgba[offset];
    result[offset + 1] = rgba[offset + 1];
    result[offset + 2] = rgba[offset + 2];
    result[offset + 3] = alpha[index];
  }
  return Buffer.from(result);
}

function createOutlineMask(dilated: Uint8Array, cleaned: Uint8Array) {
  const outline = new Uint8Array(cleaned.length);
  for (let index = 0; index < cleaned.length; index += 1) {
    outline[index] = dilated[index] > 0 && cleaned[index] === 0 ? 255 : 0;
  }
  return outline;
}

type RawChannels = 1 | 2 | 3 | 4;

async function resizeOverlay(buffer: Buffer, bbox: BoundingBox, targetWidth: number, targetHeight: number, channels: RawChannels) {
  return sharp(buffer, {
    raw: {
      width: bbox.width,
      height: bbox.height,
      channels,
    },
  })
    .resize({ width: targetWidth, height: targetHeight, fit: "fill" })
    .png()
    .toBuffer();
}

export async function composeSticker(foregroundBuffer: Buffer, options: ComposeStickerOptions) {
  const { data, info } = await sharp(foregroundBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rawRgba = new Uint8Array(data);
  const alpha = new Uint8Array(info.width * info.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = rawRgba[index * 4 + 3];
  }

  const cleanedMask = createLargestComponentMask(alpha, info.width, info.height);
  const cleanedForeground = applyMaskToForeground(rawRgba, cleanedMask);
  const dilatedMask = options.outlinePx > 0
    ? await sharp(Buffer.from(cleanedMask), { raw: { width: info.width, height: info.height, channels: 1 } })
        .dilate(options.outlinePx)
        .raw()
        .toBuffer()
    : Buffer.from(cleanedMask);
  const outlineMask = options.outlinePx > 0 ? createOutlineMask(new Uint8Array(dilatedMask), cleanedMask) : new Uint8Array(cleanedMask.length);
  const combinedMask = new Uint8Array(cleanedMask.length);
  for (let index = 0; index < combinedMask.length; index += 1) {
    combinedMask[index] = Math.max(cleanedMask[index], outlineMask[index]);
  }

  const boundingBox = getBoundingBox(combinedMask, info.width, info.height);
  const innerSize = Math.max(1, Math.floor(options.size * (1 - PADDING_RATIO * 2)));
  const scale = Math.min(innerSize / boundingBox.width, innerSize / boundingBox.height);
  const targetWidth = Math.max(1, Math.round(boundingBox.width * scale));
  const targetHeight = Math.max(1, Math.round(boundingBox.height * scale));
  const left = Math.round((options.size - targetWidth) / 2);
  const top = Math.round((options.size - targetHeight) / 2);

  const croppedForeground = await resizeOverlay(
    await sharp(cleanedForeground, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: boundingBox.left, top: boundingBox.top, width: boundingBox.width, height: boundingBox.height })
      .raw()
      .toBuffer(),
    { left: 0, top: 0, width: boundingBox.width, height: boundingBox.height },
    targetWidth,
    targetHeight,
    4,
  );

  const overlays: OverlayOptions[] = [];
  if (options.outlinePx > 0) {
    const croppedOutline = await resizeOverlay(
      alphaToRgba(
        await sharp(Buffer.from(outlineMask), { raw: { width: info.width, height: info.height, channels: 1 } })
          .extract({ left: boundingBox.left, top: boundingBox.top, width: boundingBox.width, height: boundingBox.height })
          .raw()
          .toBuffer(),
      ),
      { left: 0, top: 0, width: boundingBox.width, height: boundingBox.height },
      targetWidth,
      targetHeight,
      4,
    );

    overlays.push({ input: croppedOutline, left, top });
  }

  overlays.push({ input: croppedForeground, left, top });

  const canvas = sharp({
    create: {
      width: options.size,
      height: options.size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(overlays);

  if (options.format === "webp") {
    return canvas.webp({ quality: 90 }).toBuffer();
  }

  return canvas.png().toBuffer();
}

