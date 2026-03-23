# Stickify Studio

Stickify Studio is a Next.js App Router app that turns product images into sticker-style cutouts with a clean white outline.

## What it does

- Upload a PNG, JPEG, or WebP image from the browser.
- Or send a public `https` image URL to the same API.
- Remove the background with `@imgly/background-removal-node`.
- Add an optional white outline and return a transparent PNG or WebP sticker.

## Local development

Install dependencies and start the Next.js dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create `.env.local` from `.env.example` and set at least:

```bash
STICKIFY_API_KEY=change-me
```

Optional knobs:

- `STICKIFY_MAX_IMAGE_BYTES`: Maximum upload or fetched image size. Default `10000000`.
- `STICKIFY_FETCH_TIMEOUT_MS`: Timeout for remote image fetches. Default `10000`.
- `STICKIFY_MODEL_DIR`: Local directory for background-removal model assets. Default `.model-assets/background-removal`.

## API

### `POST /api/stickerize`

Accepts either `multipart/form-data` or `application/json`.

Multipart fields:

- `file`: uploaded image
- `outlinePx`: optional, default `10`
- `size`: optional, default `512`
- `format`: optional, `png` or `webp`

JSON body:

```json
{
  "imageUrl": "https://example.com/product.jpg",
  "outlinePx": 10,
  "size": 512,
  "format": "png"
}
```

Authentication:

- External callers should send `x-api-key`.
- The built-in same-origin page can call the route without exposing the key in the browser.

Example:

```bash
curl -X POST "http://localhost:3000/api/stickerize" \
  -H "x-api-key: $STICKIFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/product.jpg","outlinePx":10,"size":512,"format":"png"}' \
  --output sticker.png
```

### `GET /api/healthz`

Returns a lightweight health payload without running inference.

## Model assets

The Node package ships the wasm and ONNX resources in `node_modules`, but Docker prepares a local copy in `.model-assets/background-removal` so production startup does not depend on a network fetch.

You can prepare that directory manually with:

```bash
npm run prepare:model-assets
```

## Docker

Build and run:

```bash
docker build -t stickify .
docker run --rm -p 3000:3000 \
  -e STICKIFY_API_KEY=change-me \
  stickify
```

Then open [http://localhost:3000](http://localhost:3000).
