# Stickify Studio

Stickify Studio now uses a split architecture:

- `frontend`: a Next.js App Router interface for uploads, previews, and downloads
- `api`: a FastAPI service that fetches remote images safely, extracts the primary object contour, and returns a sticker image

## What changed

- Next.js is now UI-only and no longer serves `/api/stickerize`.
- FastAPI serves `POST /v1/stickerize` and `GET /healthz`.
- The default backend segmentation engine is `BiRefNet_lite-ONNX`, tuned for single-object contour extraction rather than matte-style background removal.

## Local frontend development

```bash
npm install
npm run dev
```

The UI expects the API to be reachable at `NEXT_PUBLIC_API_BASE_URL`.

## Local backend development

Use Python 3.13 or 3.11 for the FastAPI service. In this workspace, `uv` with Python 3.13 is the quickest path on Windows.

```bash
$env:UV_CACHE_DIR="D:\Administrator\Documents\Stickify\.uv-cache"
$env:HF_ENDPOINT="https://hf-mirror.com"
uv venv .venv --python 3.13
uv pip install --python .venv\Scripts\python.exe -r backend\requirements.txt
uv run --python .venv\Scripts\python.exe python -m backend.scripts.download_model
uv run --python .venv\Scripts\python.exe uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The default profile now uses `onnx-community/BiRefNet_lite-ONNX` and a smaller input edge to keep CPU latency reasonable.

## Environment variables

Copy `.env.example` and configure:

- `NEXT_PUBLIC_API_BASE_URL`: Browser-visible FastAPI base URL. Default `http://localhost:8000`.
- `STICKIFY_MAX_IMAGE_BYTES`: Maximum upload or fetched image size.
- `STICKIFY_FETCH_TIMEOUT_MS`: Remote image fetch timeout.
- `STICKIFY_MODEL_DIR`: Local directory containing the downloaded segmentation model.
- `STICKIFY_MODEL_NAME`: Hugging Face model repo to download. Default `onnx-community/BiRefNet_lite-ONNX`.
- `STICKIFY_RATE_LIMIT_PER_MINUTE`: Public API rate limit bucket size.

## API

### `POST /v1/stickerize`

Accepts either `multipart/form-data` or `application/json`.

Multipart fields:

- `file`
- `outlinePx`
- `size`
- `format`
- `maskThreshold`
- `smoothness`

JSON body:

```json
{
  "imageUrl": "https://example.com/product.jpg",
  "outlinePx": 10,
  "size": 512,
  "format": "png",
  "maskThreshold": 128,
  "smoothness": 2
}
```

Example:

```bash
curl -X POST "http://localhost:8000/v1/stickerize" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/product.jpg","outlinePx":10,"size":512,"format":"png","maskThreshold":128,"smoothness":2}' \
  --output sticker.png
```

### `GET /healthz`

Returns a lightweight readiness payload for the FastAPI service.

## Docker Compose

This machine does not currently have Docker installed, so compose files were added but not executed here.

When Docker is available:

```bash
docker compose up --build
```

Then open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- API health check: [http://localhost:8000/healthz](http://localhost:8000/healthz)
