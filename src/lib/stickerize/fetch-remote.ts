import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { badGateway, badRequest, payloadTooLarge, unsupportedMediaType } from "@/lib/stickerize/errors";

const MAX_REDIRECTS = 3;
const ALLOWED_REMOTE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.") || /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
}

async function assertSafeRemoteHost(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw badRequest("localhost URLs are not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
      throw badRequest("Private network IPs are not allowed.");
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  for (const record of records) {
    if ((record.family === 4 && isPrivateIpv4(record.address)) || (record.family === 6 && isPrivateIpv6(record.address))) {
      throw badRequest("Resolved private network IPs are not allowed.");
    }
  }
}

async function readLimitedBody(response: Response, maxBytes: number) {
  const body = response.body;
  if (!body) {
    throw badGateway("Remote image response was empty.");
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      throw payloadTooLarge(`Remote images must be smaller than ${maxBytes} bytes.`);
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function fetchRemoteImage(imageUrl: string, options: { timeoutMs: number; maxBytes: number; }) {
  let currentUrl = new URL(imageUrl);

  if (currentUrl.protocol !== "https:") {
    throw badRequest("Only https imageUrl values are allowed.");
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeRemoteHost(currentUrl.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/png,image/jpeg,image/webp",
          "User-Agent": "Stickify/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw badGateway("Remote image redirect did not include a location header.");
        }

        if (redirectCount === MAX_REDIRECTS) {
          throw badGateway("Remote image redirected too many times.");
        }

        currentUrl = new URL(location, currentUrl);
        if (currentUrl.protocol !== "https:") {
          throw badRequest("Redirected image URLs must remain on https.");
        }
        continue;
      }

      if (!response.ok) {
        throw badGateway(`Remote image server responded with ${response.status}.`);
      }

      const contentTypeHeader = response.headers.get("content-type") ?? "";
      const mimeType = contentTypeHeader.split(";")[0].trim().toLowerCase();
      if (!ALLOWED_REMOTE_CONTENT_TYPES.has(mimeType)) {
        throw unsupportedMediaType("Remote URLs must point to a PNG, JPEG, or WebP image.");
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && Number.parseInt(contentLength, 10) > options.maxBytes) {
        throw payloadTooLarge(`Remote images must be smaller than ${options.maxBytes} bytes.`);
      }

      const buffer = await readLimitedBody(response, options.maxBytes);
      return {
        buffer,
        contentType: mimeType,
        url: currentUrl.toString(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw badGateway("Timed out while fetching the remote image.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw badGateway("Failed to fetch the remote image.");
}
