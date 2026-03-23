import { ALLOWED_OUTPUT_FORMATS, getDefaultOutputFormat, getDefaultOutlinePx, getDefaultSize, type OutputFormat } from "@/lib/stickerize/config";
import { badRequest, payloadTooLarge, unsupportedMediaType } from "@/lib/stickerize/errors";

export type StickerizeOptions = {
  outlinePx: number;
  size: number;
  format: OutputFormat;
};

export type ParsedInput =
  | ({ kind: "file"; buffer: Buffer; contentType: string; filename: string } & StickerizeOptions)
  | ({ kind: "url"; imageUrl: string } & StickerizeOptions);

const MAX_OUTLINE_PX = 32;
const MIN_SIZE = 256;
const MAX_SIZE = 1024;
const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseInteger(value: FormDataEntryValue | string | null | undefined, fallback: number, fieldName: string) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw badRequest(`${fieldName} must be an integer.`);
  }

  return parsed;
}

function parseFormat(value: FormDataEntryValue | string | null | undefined): OutputFormat {
  const fallback = getDefaultOutputFormat();
  if (value == null || value === "") {
    return fallback;
  }

  const normalized = String(value).toLowerCase();
  if (!ALLOWED_OUTPUT_FORMATS.includes(normalized as OutputFormat)) {
    throw badRequest(`format must be one of: ${ALLOWED_OUTPUT_FORMATS.join(", ")}.`);
  }

  return normalized as OutputFormat;
}

function validateOptions(options: StickerizeOptions) {
  if (options.outlinePx < 0 || options.outlinePx > MAX_OUTLINE_PX) {
    throw badRequest(`outlinePx must be between 0 and ${MAX_OUTLINE_PX}.`);
  }

  if (options.size < MIN_SIZE || options.size > MAX_SIZE) {
    throw badRequest(`size must be between ${MIN_SIZE} and ${MAX_SIZE}.`);
  }

  return options;
}

function buildOptions(data: { outlinePx?: FormDataEntryValue | string | null; size?: FormDataEntryValue | string | null; format?: FormDataEntryValue | string | null; }) {
  return validateOptions({
    outlinePx: parseInteger(data.outlinePx, getDefaultOutlinePx(), "outlinePx"),
    size: parseInteger(data.size, getDefaultSize(), "size"),
    format: parseFormat(data.format),
  });
}

export async function parseStickerizeRequest(request: Request, maxImageBytes: number): Promise<ParsedInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const imageUrl = String(formData.get("imageUrl") ?? "").trim();

    if (fileEntry && imageUrl) {
      throw badRequest("Provide either file or imageUrl, not both.");
    }

    if (!fileEntry && !imageUrl) {
      throw badRequest("Provide either file or imageUrl.");
    }

    const options = buildOptions({
      outlinePx: formData.get("outlinePx"),
      size: formData.get("size"),
      format: formData.get("format"),
    });

    if (imageUrl) {
      return { kind: "url", imageUrl, ...options };
    }

    if (!(fileEntry instanceof File)) {
      throw badRequest("file must be a valid uploaded file.");
    }

    if (fileEntry.size > maxImageBytes) {
      throw payloadTooLarge(`Uploaded files must be smaller than ${maxImageBytes} bytes.`);
    }

    if (!ALLOWED_UPLOAD_TYPES.has(fileEntry.type)) {
      throw unsupportedMediaType("Only PNG, JPEG, and WebP uploads are supported.");
    }

    return {
      kind: "file",
      buffer: Buffer.from(await fileEntry.arrayBuffer()),
      contentType: fileEntry.type,
      filename: fileEntry.name || "upload",
      ...options,
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { imageUrl?: string; outlinePx?: number; size?: number; format?: string };
    const imageUrl = body.imageUrl?.trim();
    if (!imageUrl) {
      throw badRequest("imageUrl is required for JSON requests.");
    }

    const options = buildOptions({
      outlinePx: body.outlinePx == null ? null : String(body.outlinePx),
      size: body.size == null ? null : String(body.size),
      format: body.format,
    });

    return { kind: "url", imageUrl, ...options };
  }

  throw badRequest("Send either multipart/form-data or application/json.");
}
