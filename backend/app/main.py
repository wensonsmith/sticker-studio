from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.routes.stickerize import router as stickerize_router
from backend.app.core.config import get_settings
from backend.app.core.errors import StickerizeError, too_many_requests
from backend.app.services.segment import get_segmenter

settings = get_settings()
rate_limit_buckets: dict[str, deque[float]] = defaultdict(deque)


app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next: Callable[[Request], Any]):
    client_ip = request.client.host if request.client else "unknown"
    window = rate_limit_buckets[client_ip]
    current_time = time.monotonic()

    while window and current_time - window[0] >= 60:
        window.popleft()

    if len(window) >= settings.rate_limit_per_minute:
        error = too_many_requests("The public API rate limit was exceeded. Please retry in a minute.")
        return JSONResponse(status_code=error.status_code, content={"error": {"code": error.code, "message": error.message}})

    window.append(current_time)
    return await call_next(request)


@app.exception_handler(StickerizeError)
async def handle_stickerize_error(_: Request, error: StickerizeError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"error": {"code": error.code, "message": error.message}})


@app.exception_handler(Exception)
async def handle_unexpected_error(_: Request, error: Exception) -> JSONResponse:
    print(error)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "Something went wrong while generating the sticker.",
            }
        },
    )


@app.on_event("startup")
async def warm_services() -> None:
    try:
        get_segmenter().load()
    except Exception as error:
        print(f"FastAPI startup warning: could not load segmentation model eagerly: {error}")


app.include_router(stickerize_router)
