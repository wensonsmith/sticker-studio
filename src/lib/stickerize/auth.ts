import { isAuthorizedApiKey, isSameOriginBrowserRequest } from "@/lib/stickerize/config";
import { unauthorized } from "@/lib/stickerize/errors";

export function assertAuthorizedRequest(request: Request) {
  const candidate = request.headers.get("x-api-key");

  if (candidate && isAuthorizedApiKey(candidate)) {
    return;
  }

  if (!candidate && isSameOriginBrowserRequest(request)) {
    return;
  }

  throw unauthorized(`Provide a valid x-api-key header to call ${new URL(request.url).pathname} directly.`);
}
