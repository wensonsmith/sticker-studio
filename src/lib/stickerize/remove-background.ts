import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";
import { getBackgroundRemovalConfig } from "@/lib/stickerize/config";
import { unsupportedMediaType } from "@/lib/stickerize/errors";

const MAX_SOURCE_EDGE = 1600;

export async function normalizeSourceImage(input: Buffer) {
  try {
    return await sharp(input)
      .rotate()
      .resize({ width: MAX_SOURCE_EDGE, height: MAX_SOURCE_EDGE, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw unsupportedMediaType("The uploaded content could not be decoded as an image.");
  }
}

export async function removeImageBackground(input: Buffer) {
  const normalizedInput = await normalizeSourceImage(input);
  const blob = await removeBackground(normalizedInput, getBackgroundRemovalConfig());
  return Buffer.from(await blob.arrayBuffer());
}
