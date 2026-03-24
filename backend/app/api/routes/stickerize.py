from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from backend.app.core.config import get_settings
from backend.app.core.errors import bad_request
from backend.app.services.compose import ComposeOptions, compose_sticker
from backend.app.services.contour import prepare_primary_contour
from backend.app.services.fetch_remote import fetch_remote_image
from backend.app.services.image_io import decode_image, resize_longest_edge
from backend.app.services.input import parse_request_input
from backend.app.services.segment import get_segmenter

router = APIRouter()
settings = get_settings()


@router.get("/healthz")
async def healthz() -> JSONResponse:
    model_dir = Path(settings.model_dir)
    segmenter = get_segmenter()
    model_loaded = segmenter.session is not None

    return JSONResponse(
        {
            "ok": model_dir.exists(),
            "version": settings.app_version,
            "checks": {
                "modelName": settings.model_name,
                "modelDir": str(model_dir),
                "modelDirExists": model_dir.exists(),
                "modelLoaded": model_loaded,
                "corsOrigins": settings.cors_origin_list,
            },
        },
        status_code=200 if model_dir.exists() else 503,
    )


@router.post("/v1/stickerize")
async def stickerize(request: Request) -> Response:
    parsed = await parse_request_input(request, settings)

    if parsed.source_kind == "upload":
        if parsed.buffer is None:
            raise bad_request("file is required for multipart requests.")
        source_bytes = parsed.buffer
    elif parsed.image_url:
        source_bytes = (await fetch_remote_image(parsed.image_url, settings)).buffer
    else:
        raise bad_request("imageUrl is required for JSON requests.")

    decoded = decode_image(source_bytes)
    normalized_image = resize_longest_edge(decoded.image, settings.max_source_edge)
    mask = get_segmenter().predict_mask(normalized_image)
    contour = prepare_primary_contour(mask.mask, parsed.mask_threshold, parsed.smoothness)
    sticker = compose_sticker(
        normalized_image,
        contour.mask,
        ComposeOptions(
            outline_px=parsed.outline_px,
            size=parsed.size,
            output_format=parsed.output_format,
        ),
    )

    extension = "webp" if parsed.output_format == "webp" else "png"
    media_type = "image/webp" if extension == "webp" else "image/png"
    return Response(
        content=sticker,
        media_type=media_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="sticker.{extension}"',
        },
    )
