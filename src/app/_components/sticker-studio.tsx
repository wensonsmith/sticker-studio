"use client";

/* These previews intentionally use object URLs and arbitrary remote URLs. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition } from "react";

type SourceMode = "upload" | "url";
type OutputFormat = "png" | "webp";

type ResultState = {
  url: string;
  filename: string;
  mimeType: string;
} | null;

const OUTPUT_SIZE_OPTIONS = [256, 512, 768, 1024] as const;
const OUTLINE_OPTIONS = [0, 6, 10, 14, 18, 24] as const;

function createCurlExample(format: OutputFormat) {
  const extension = format === "webp" ? "webp" : "png";
  return [
    `curl -X POST "$YOUR_APP_URL/api/stickerize" \\`,
    `  -H "x-api-key: $STICKIFY_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"imageUrl":"https://example.com/product.jpg","outlinePx":10,"size":512,"format":"${format}"}' \\`,
    `  --output sticker.${extension}`,
  ].join("\n");
}

export function StickerStudio() {
  const [mode, setMode] = useState<SourceMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [outlinePx, setOutlinePx] = useState(10);
  const [size, setSize] = useState(512);
  const [format, setFormat] = useState<OutputFormat>("png");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (mode !== "upload" || !file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSourcePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, mode]);

  useEffect(() => {
    if (mode !== "url") {
      return;
    }

    setSourcePreview(imageUrl.trim() || null);
  }, [imageUrl, mode]);

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result]);

  function resetResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function handleModeChange(nextMode: SourceMode) {
    setMode(nextMode);
    setError(null);
    resetResult();
  }

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setError(null);
    resetResult();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    resetResult();

    startTransition(async () => {
      try {
        let response: Response;

        if (mode === "upload") {
          if (!file) {
            throw new Error("Select an image before generating a sticker.");
          }

          const formData = new FormData();
          formData.set("file", file);
          formData.set("outlinePx", String(outlinePx));
          formData.set("size", String(size));
          formData.set("format", format);

          response = await fetch("/api/stickerize", {
            method: "POST",
            headers: apiKey.trim() ? { "x-api-key": apiKey.trim() } : undefined,
            body: formData,
          });
        } else {
          if (!imageUrl.trim()) {
            throw new Error("Paste an https image URL before generating a sticker.");
          }

          response = await fetch("/api/stickerize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey.trim() ? { "x-api-key": apiKey.trim() } : {}),
            },
            body: JSON.stringify({
              imageUrl: imageUrl.trim(),
              outlinePx,
              size,
              format,
            }),
          });
        }

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(data?.error?.message ?? "Failed to generate the sticker.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const extension = format === "webp" ? "webp" : "png";

        setResult({
          url: objectUrl,
          filename: `sticker.${extension}`,
          mimeType: blob.type,
        });
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Failed to generate the sticker.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--ink-strong)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-5 py-6 sm:px-8 lg:px-10">
        <header className="grid gap-6 rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur lg:grid-cols-[1.3fr_0.9fr] lg:p-8">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
              Stickify Studio
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-balance font-sans text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-6xl">
                Cut the object, add a crisp white stroke, ship a sticker-ready PNG.
              </h1>
              <p className="max-w-2xl text-pretty text-base leading-7 text-[var(--ink-muted)] sm:text-lg">
                Upload a product shot or paste a public https image URL. The same Next.js app renders the page, protects the API, removes the background, and returns a transparent sticker image.
              </p>
            </div>
          </div>
          <div className="sticker-sample relative overflow-hidden rounded-[1.75rem] border border-[var(--line-soft)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.65),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.85),rgba(255,255,255,0.45))]" />
            <div className="relative grid gap-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                <span>Single route</span>
                <span>/api/stickerize</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.4rem] border border-dashed border-[var(--line-soft)] bg-[var(--paper)]/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Input</div>
                  <div className="mt-4 aspect-square rounded-[1.2rem] bg-[linear-gradient(145deg,#fed7aa,#fb7185_44%,#f4f4f5)]" />
                </div>
                <div className="rounded-[1.4rem] border border-[var(--line-soft)] bg-white/90 p-4 shadow-[0_16px_30px_rgba(251,113,133,0.12)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Sticker</div>
                  <div className="mt-4 flex aspect-square items-center justify-center rounded-[1.2rem] bg-[radial-gradient(circle_at_center,#ffffff,rgba(255,255,255,0.7)_52%,transparent_53%),linear-gradient(135deg,rgba(255,255,255,0.7),rgba(241,245,249,0.9))]">
                    <div className="rounded-[1.6rem] border-[12px] border-white bg-[linear-gradient(145deg,#f59e0b,#ef4444)] px-8 py-10 shadow-[0_18px_40px_rgba(239,68,68,0.22)]" />
                  </div>
                </div>
              </div>
              <p className="text-sm leading-6 text-[var(--ink-muted)]">
                Same-origin browser requests work from this page without exposing your API key. External callers can pass <code>x-api-key</code> for server-to-server usage.
              </p>
            </div>
          </div>
        </header>

        <main className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="rounded-[2rem] border border-white/50 bg-white/75 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.1)] backdrop-blur lg:p-8">
            <form className="grid gap-6" onSubmit={handleSubmit}>
              <div className="flex flex-wrap gap-3">
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "upload" ? "bg-[var(--ink-strong)] text-white" : "border border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink-muted)] hover:border-[var(--ink-strong)]/20"}`}
                  type="button"
                  onClick={() => handleModeChange("upload")}
                >
                  Upload a file
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "url" ? "bg-[var(--ink-strong)] text-white" : "border border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink-muted)] hover:border-[var(--ink-strong)]/20"}`}
                  type="button"
                  onClick={() => handleModeChange("url")}
                >
                  Use an image URL
                </button>
              </div>

              <div className="grid gap-5 rounded-[1.5rem] border border-[var(--line-soft)] bg-[var(--paper)]/80 p-5">
                {mode === "upload" ? (
                  <label className="grid gap-3 rounded-[1.25rem] border border-dashed border-[var(--line-soft)] bg-white/80 p-5 text-sm text-[var(--ink-muted)]">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em]">Image file</span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      className="block w-full text-sm text-[var(--ink-strong)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:font-semibold file:text-[var(--ink-strong)]"
                      type="file"
                      onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                    />
                    <span>PNG, JPEG, and WebP are supported.</span>
                  </label>
                ) : (
                  <label className="grid gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">Remote image URL</span>
                    <input
                      className="rounded-[1.1rem] border border-[var(--line-soft)] bg-white px-4 py-3 text-sm text-[var(--ink-strong)] outline-none transition focus:border-[var(--ink-strong)]/30"
                      inputMode="url"
                      placeholder="https://example.com/product-shot.webp"
                      type="url"
                      value={imageUrl}
                      onChange={(event) => {
                        setImageUrl(event.target.value);
                        setError(null);
                        resetResult();
                      }}
                    />
                    <span className="text-sm text-[var(--ink-muted)]">Only public https URLs are accepted. Localhost and private networks are blocked.</span>
                  </label>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em]">Outline</span>
                    <select
                      className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                      value={outlinePx}
                      onChange={(event) => setOutlinePx(Number.parseInt(event.target.value, 10))}
                    >
                      {OUTLINE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value === 0 ? "No stroke" : `${value}px white stroke`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em]">Canvas size</span>
                    <select
                      className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                      value={size}
                      onChange={(event) => setSize(Number.parseInt(event.target.value, 10))}
                    >
                      {OUTPUT_SIZE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value} x {value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em]">Format</span>
                    <select
                      className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                      value={format}
                      onChange={(event) => setFormat(event.target.value as OutputFormat)}
                    >
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </label>
                </div>

                <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em]">Optional API key</span>
                  <input
                    className="rounded-[1.1rem] border border-[var(--line-soft)] bg-white px-4 py-3 text-sm text-[var(--ink-strong)] outline-none transition focus:border-[var(--ink-strong)]/30"
                    placeholder="Leave empty for same-origin browser requests"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  className="rounded-full bg-[var(--ink-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? "Generating sticker..." : "Generate sticker"}
                </button>
                <p className="text-sm text-[var(--ink-muted)]">
                  The API returns the binary image directly and keeps responses uncached.
                </p>
              </div>

              {error ? (
                <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
            </form>
          </section>

          <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white/50 bg-white/75 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.1)] backdrop-blur lg:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">Preview</div>
                  <h2 className="mt-2 text-2xl font-semibold">Source and sticker output</h2>
                </div>
                {result ? (
                  <a
                    className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-4 py-2 text-sm font-semibold text-[var(--ink-strong)] transition hover:border-[var(--ink-strong)]/25"
                    download={result.filename}
                    href={result.url}
                  >
                    Download {result.filename}
                  </a>
                ) : null}
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-2">
                <div className="rounded-[1.4rem] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Input</div>
                  <div className="checkerboard mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-[1.2rem]">
                    {sourcePreview ? (
                      <img alt="Source preview" className="h-full w-full object-contain" src={sourcePreview} />
                    ) : (
                      <p className="max-w-[14rem] text-center text-sm leading-6 text-[var(--ink-muted)]">
                        Add a file or public image URL to preview the source here.
                      </p>
                    )}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Result</div>
                  <div className="checkerboard mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-[1.2rem]">
                    {result ? (
                      <img alt="Generated sticker" className="h-full w-full object-contain" src={result.url} />
                    ) : (
                      <p className="max-w-[14rem] text-center text-sm leading-6 text-[var(--ink-muted)]">
                        Your sticker will appear here with a transparent background and white outline.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/50 bg-white/75 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.1)] backdrop-blur lg:p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">API example</div>
              <pre className="mt-4 overflow-x-auto rounded-[1.2rem] bg-[var(--ink-strong)] p-4 text-sm leading-7 text-slate-100">
                <code>{createCurlExample(format)}</code>
              </pre>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

