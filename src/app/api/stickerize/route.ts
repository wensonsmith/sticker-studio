import { assertAuthorizedRequest } from "@/lib/stickerize/auth";
import { composeSticker } from "@/lib/stickerize/compose";
import { getRuntimeSettings } from "@/lib/stickerize/config";
import { fetchRemoteImage } from "@/lib/stickerize/fetch-remote";
import { jsonErrorResponse } from "@/lib/stickerize/http";
import { parseStickerizeRequest } from "@/lib/stickerize/input";
import { removeImageBackground } from "@/lib/stickerize/remove-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertAuthorizedRequest(request);

    const settings = getRuntimeSettings();
    const input = await parseStickerizeRequest(request, settings.maxImageBytes);
    const sourceBuffer = input.kind === "url"
      ? (await fetchRemoteImage(input.imageUrl, { timeoutMs: settings.fetchTimeoutMs, maxBytes: settings.maxImageBytes })).buffer
      : input.buffer;

    const foreground = await removeImageBackground(sourceBuffer);
    const sticker = await composeSticker(foreground, {
      outlinePx: input.outlinePx,
      size: input.size,
      format: input.format,
    });

    const extension = input.format === "webp" ? "webp" : "png";
    const mimeType = input.format === "webp" ? "image/webp" : "image/png";

    return new Response(new Uint8Array(sticker), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="sticker.${extension}"`,
        "Content-Type": mimeType,
      },
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
