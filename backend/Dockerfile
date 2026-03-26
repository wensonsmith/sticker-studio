# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS runner
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install --upgrade pip \
    && pip install -r backend/requirements.txt

COPY backend/scripts/download_model.py ./backend/scripts/download_model.py
ARG STICKIFY_PRELOAD_MODELS=u2netp,isnet-general-use,birefnet-lite
ENV STICKIFY_MODEL_DIR=/app/backend/.cache/models/u2netp
ENV STICKIFY_MODEL_NAME=u2netp
ENV STICKIFY_PRELOAD_MODELS=${STICKIFY_PRELOAD_MODELS}
ENV STICKIFY_MODEL_CACHE_DIR=/root/.cache/stickify-models
RUN --mount=type=cache,target=/root/.cache/huggingface \
    --mount=type=cache,target=/root/.cache/stickify-models \
    python backend/scripts/download_model.py

COPY backend ./backend

EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
