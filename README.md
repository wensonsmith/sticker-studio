# Stickify Studio

Stickify Studio now uses a split architecture:

- `frontend`: a Next.js App Router interface for uploads, previews, and downloads
- `api`: a FastAPI service that fetches remote images safely, extracts the primary object contour, and returns a sticker image

## What changed

- Next.js is now UI-only and no longer serves `/api/stickerize`.
- FastAPI serves `POST /v1/stickerize` and `GET /healthz`.
- The default backend segmentation engine is now `u2netp`, a lightweight U2Net-family ONNX model tuned for quicker CPU contour extraction.
- The API can also switch to `isnet-general-use` per request when you want a cleaner primary contour.

## Local frontend development

```bash
npm install
npm run dev
```

The UI expects the API to be reachable at `NEXT_PUBLIC_API_BASE_URL`.

## Local backend development

Use Python 3.13 or 3.11 for the FastAPI service. In this workspace, `uv` with Python 3.13 is the quickest path on Windows.

```bash
uv venv .venv --python 3.13
uv pip install --python .venv\Scripts\python.exe -r backend\requirements.txt
uv run --python .venv\Scripts\python.exe python -m backend.scripts.download_model
uv run --python .venv\Scripts\python.exe uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The default profile now uses `u2netp` with a fixed `320x320` inference input to keep CPU latency reasonable. If you want to compare against the previous BiRefNet pipeline, set `STICKIFY_MODEL_NAME=onnx-community/BiRefNet_lite-ONNX` and point `STICKIFY_MODEL_DIR` at a Hugging Face snapshot directory.

## Environment variables

Copy `.env.example` and configure:

- `NEXT_PUBLIC_API_BASE_URL`: Browser-visible FastAPI base URL. Default `http://localhost:8000`.
- `STICKIFY_MAX_IMAGE_BYTES`: Maximum upload or fetched image size.
- `STICKIFY_FETCH_TIMEOUT_MS`: Remote image fetch timeout.
- `STICKIFY_MODEL_DIR`: Local directory containing the downloaded segmentation model.
- `STICKIFY_MODEL_NAME`: Default `u2netp`. Also supports `u2net` or a Hugging Face ONNX repo such as `onnx-community/BiRefNet_lite-ONNX`.
- `STICKIFY_RATE_LIMIT_PER_MINUTE`: Public API rate limit bucket size.

## API

### `POST /v1/stickerize`

Accepts either `multipart/form-data` or `application/json`.

Multipart fields:

- `file`
- `model`
- `outlinePx`
- `size`
- `format`
- `maskThreshold`
- `smoothness`

JSON body:

```json
{
  "imageUrl": "https://example.com/product.jpg",
  "model": "isnet-general-use",
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
  -d '{"imageUrl":"https://example.com/product.jpg","model":"isnet-general-use","outlinePx":10,"size":512,"format":"png","maskThreshold":128,"smoothness":2}' \
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

## Model downloads in Docker builds

The backend Docker image now preloads three segmentation models during build:

- `u2netp`
- `isnet-general-use`
- `birefnet-lite`

The default build argument is `STICKIFY_PRELOAD_MODELS=u2netp,isnet-general-use,birefnet-lite`.

Notes:

- The Dockerfile uses BuildKit cache mounts for pip packages, Hugging Face artifacts, and direct model downloads, so rebuilds should avoid downloading the same model files again when the builder cache is preserved.
- The Dockerfile copies the model download script before copying the rest of `backend/`, so ordinary backend code changes do not invalidate the model download layer.
- If your Dokploy server clears builder cache or builds on a fresh machine, the models will be downloaded again.

## Deploy with Dokploy

This repository includes a Dokploy-specific compose file at `docker-compose.dokploy.yml`.

Recommended setup:

1. Push this repository to GitHub, GitLab, or another Git provider Dokploy can access.
2. In Dokploy, create a new Docker Compose application from the repository.
3. Set the compose path to `docker-compose.dokploy.yml`.
4. Configure these environment variables in Dokploy before the first deploy:
   - `NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com`
   - `STICKIFY_CORS_ORIGINS=https://your-domain.com`
   - `STICKIFY_MODEL_NAME=u2netp`
   - `STICKIFY_MODEL_DIR=/app/backend/.cache/models/u2netp`
   - `STICKIFY_ALLOW_PRIVATE_REMOTE_HOSTS=false`
   - `STICKIFY_RATE_LIMIT_PER_MINUTE=30`
5. Deploy once the variables are saved.
6. Add two Dokploy domains:
   - `frontend` service on port `3000`, for example `https://stickify.your-domain.com`
   - `api` service on port `8000`, for example `https://api.your-domain.com`
7. Redeploy the stack after the domains are configured if `NEXT_PUBLIC_API_BASE_URL` changed, because the frontend reads it at build time.

Notes:

- `docker-compose.dokploy.yml` uses `expose` instead of fixed host port bindings so it will not fight with other apps on the same Dokploy server.
- The backend image downloads the default segmentation model during image build, so the first deploy can take noticeably longer than later restarts.
- If you use a Hugging Face ONNX model such as `onnx-community/BiRefNet_lite-ONNX`, set `STICKIFY_MODEL_DIR` to the corresponding snapshot directory inside the image or switch to a runtime volume strategy.
