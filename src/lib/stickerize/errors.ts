export class StickerizeError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StickerizeError";
    this.status = status;
    this.code = code;
  }
}

export function isStickerizeError(error: unknown): error is StickerizeError {
  return error instanceof StickerizeError;
}

export function badRequest(message: string) {
  return new StickerizeError(400, "bad_request", message);
}

export function unauthorized(message = "A valid API key is required.") {
  return new StickerizeError(401, "unauthorized", message);
}

export function payloadTooLarge(message: string) {
  return new StickerizeError(413, "payload_too_large", message);
}

export function unsupportedMediaType(message: string) {
  return new StickerizeError(415, "unsupported_media_type", message);
}

export function unprocessableEntity(message: string) {
  return new StickerizeError(422, "unprocessable_entity", message);
}

export function badGateway(message: string) {
  return new StickerizeError(502, "bad_gateway", message);
}
