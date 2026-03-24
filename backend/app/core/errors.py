class StickerizeError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def bad_request(message: str) -> StickerizeError:
    return StickerizeError(400, "bad_request", message)


def payload_too_large(message: str) -> StickerizeError:
    return StickerizeError(413, "payload_too_large", message)


def unsupported_media_type(message: str) -> StickerizeError:
    return StickerizeError(415, "unsupported_media_type", message)


def unprocessable_entity(message: str) -> StickerizeError:
    return StickerizeError(422, "unprocessable_entity", message)


def bad_gateway(message: str) -> StickerizeError:
    return StickerizeError(502, "bad_gateway", message)


def too_many_requests(message: str) -> StickerizeError:
    return StickerizeError(429, "too_many_requests", message)
