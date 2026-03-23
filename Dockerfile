FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN node scripts/prepare-model-assets.mjs
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV STICKIFY_MODEL_DIR=/app/.model-assets/background-removal

COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "run", "start"]
