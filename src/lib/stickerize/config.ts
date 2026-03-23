import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_MAX_IMAGE_BYTES = 10_000_000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = "medium" as const;
const DEFAULT_OUTPUT_FORMAT = "png" as const;
const DEFAULT_OUTLINE_PX = 10;
const DEFAULT_SIZE = 512;

export const ALLOWED_OUTPUT_FORMATS = ["png", "webp"] as const;
export type OutputFormat = (typeof ALLOWED_OUTPUT_FORMATS)[number];

export type RuntimeSettings = {
  apiKey: string;
  maxImageBytes: number;
  fetchTimeoutMs: number;
  modelDir: string;
  modelPublicPath: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ?? "";
}

function getPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toDirectoryFileUrl(directory: string) {
  return pathToFileURL(path.resolve(directory)).href.replace(/\/?$/, "/");
}

function resolveRuntimePath(...segments: string[]) {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), ...segments);
}

export function getDefaultOutlinePx() {
  return DEFAULT_OUTLINE_PX;
}

export function getDefaultSize() {
  return DEFAULT_SIZE;
}

export function getDefaultOutputFormat(): OutputFormat {
  return DEFAULT_OUTPUT_FORMAT;
}

export function getSameOriginBaseUrl(request: Request) {
  return new URL(request.url).origin;
}

export function isSameOriginBrowserRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && origin === requestUrl.origin) {
    return true;
  }

  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === requestUrl.origin;
  } catch {
    return false;
  }
}

export function isAuthorizedApiKey(candidate: string | null) {
  const configured = getRequiredEnv("STICKIFY_API_KEY");
  if (!configured || !candidate) {
    return false;
  }

  const expected = Buffer.from(createHash("sha256").update(configured).digest("hex"));
  const actual = Buffer.from(createHash("sha256").update(candidate).digest("hex"));

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getModelDirectory() {
  const envDir = process.env.STICKIFY_MODEL_DIR?.trim();
  if (envDir) {
    return path.isAbsolute(envDir) ? envDir : resolveRuntimePath(envDir);
  }

  return resolveRuntimePath(".model-assets", "background-removal");
}

export function resolveModelAssetDirectory() {
  const preferredDir = getModelDirectory();
  if (existsSync(preferredDir)) {
    return preferredDir;
  }

  return resolveRuntimePath("node_modules", "@imgly", "background-removal-node", "dist");
}

export async function getRuntimeHealth() {
  const apiKey = getRequiredEnv("STICKIFY_API_KEY");
  const modelDir = resolveModelAssetDirectory();

  let modelDirReadable = false;
  try {
    await access(modelDir);
    modelDirReadable = true;
  } catch {
    modelDirReadable = false;
  }

  return {
    apiKeyConfigured: Boolean(apiKey),
    modelDir,
    modelDirReadable,
  };
}

export function getRuntimeSettings(): RuntimeSettings {
  const modelDir = resolveModelAssetDirectory();

  return {
    apiKey: getRequiredEnv("STICKIFY_API_KEY"),
    maxImageBytes: getPositiveInt(process.env.STICKIFY_MAX_IMAGE_BYTES, DEFAULT_MAX_IMAGE_BYTES),
    fetchTimeoutMs: getPositiveInt(process.env.STICKIFY_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS),
    modelDir,
    modelPublicPath: toDirectoryFileUrl(modelDir),
  };
}

export function getBackgroundRemovalConfig() {
  const settings = getRuntimeSettings();

  return {
    debug: process.env.NODE_ENV !== "production",
    model: DEFAULT_MODEL,
    output: {
      format: "image/png" as const,
      quality: 0.9,
    },
    proxyToWorker: false,
    publicPath: settings.modelPublicPath,
  };
}
