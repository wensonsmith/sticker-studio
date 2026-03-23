import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";
import { getBackgroundRemovalConfig } from "@/lib/stickerize/config";
import { unprocessableEntity, unsupportedMediaType } from "@/lib/stickerize/errors";

const MAX_SOURCE_EDGE = 1600;
const NORMALIZED_IMAGE_MIME = "image/png";

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

function mapBackgroundRemovalError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message.startsWith("Unsupported format:")) {
      throw unsupportedMediaType("The image could not be decoded by the background removal engine.");
    }

    if (error.message.includes("Resource metadata not found") || error.message.includes("Resource /models/")) {
      throw unprocessableEntity("The background removal model assets are unavailable or incomplete.");
    }
  }

  throw error;
}

export async function removeImageBackground(input: Buffer) {
  const normalizedInput = await normalizeSourceImage(input);

  try {
    const normalizedBytes = Uint8Array.from(normalizedInput);
    const normalizedBlob = new Blob([normalizedBytes], { type: NORMALIZED_IMAGE_MIME });
    const result = await removeBackground(normalizedBlob, getBackgroundRemovalConfig());
    return Buffer.from(await result.arrayBuffer());
  } catch (error) {
    mapBackgroundRemovalError(error);
  }
}
