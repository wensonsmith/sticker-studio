"use client";

/* These previews intentionally use object URL and arbitrary remote URLs. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition } from "react";

type SourceMode = "upload" | "url";
type OutputFormat = "png" | "webp";
type SegmentationModel = "u2netp" | "isnet-general-use";
type ResultState = {
  url: string;
  filename: string;
  mimeType: string;
} | null;

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");
const FIXED_OUTPUT_SIZE = 1000;
const FIXED_OUTPUT_FORMAT: OutputFormat = "png";
const OUTLINE_OPTIONS = [0, 6, 10, 14, 18, 24] as const;
const MASK_THRESHOLD_OPTIONS = [96, 112, 128, 144, 160] as const;
const SMOOTHNESS_OPTIONS = [0, 1, 2, 3, 4] as const;
const MODEL_OPTIONS = [
  { value: "u2netp", label: "U2NetP (Fast)" },
  { value: "isnet-general-use", label: "ISNet (Cleaner)" },
] as const satisfies ReadonlyArray<{ value: SegmentationModel; label: string }>;
function createCurlExample(
  model: SegmentationModel,
  outlinePx: number,
  maskThreshold: number,
  smoothness: number,
) {
  return [
    `curl -X POST "${API_BASE_URL}/v1/stickerize" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '{"imageUrl":"https://example.com/product.jpg","model":"${model}","outlinePx":${outlinePx},"size":${FIXED_OUTPUT_SIZE},"format":"${FIXED_OUTPUT_FORMAT}","maskThreshold":${maskThreshold},"smoothness":${smoothness}}' \\`,
    "  --output sticker.png",
  ].join("\n");
}

export function StickerStudio() {
  const [mode, setMode] = useState<SourceMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [model, setModel] = useState<SegmentationModel>("u2netp");
  const [outlinePx, setOutlinePx] = useState(10);
  const [maskThreshold, setMaskThreshold] = useState(128);
  const [smoothness, setSmoothness] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (mode !== "upload") {
      return;
    }

    if (!file) {
      setSourcePreview(null);
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

  function handleMaskThresholdChange(nextValue: number) {
    setMaskThreshold(nextValue);
    setError(null);
    resetResult();
  }

  function handleSmoothnessChange(nextValue: number) {
    setSmoothness(nextValue);
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
          formData.set("model", model);
          formData.set("outlinePx", String(outlinePx));
          formData.set("size", String(FIXED_OUTPUT_SIZE));
          formData.set("format", FIXED_OUTPUT_FORMAT);
          formData.set("maskThreshold", String(maskThreshold));
          formData.set("smoothness", String(smoothness));

          response = await fetch(`${API_BASE_URL}/v1/stickerize`, {
            method: "POST",
            body: formData,
          });
        } else {
          if (!imageUrl.trim()) {
            throw new Error(
              "Paste an https image URL before generating a sticker.",
            );
          }

          response = await fetch(`${API_BASE_URL}/v1/stickerize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageUrl: imageUrl.trim(),
              model,
              outlinePx,
              size: FIXED_OUTPUT_SIZE,
              format: FIXED_OUTPUT_FORMAT,
              maskThreshold,
              smoothness,
            }),
          });
        }

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            data?.error?.message ?? "Failed to generate the sticker.",
          );
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        setResult({
          url: objectUrl,
          filename: "sticker.png",
          mimeType: blob.type,
        });
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Failed to generate the sticker.",
        );
      }
    });
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--ink-strong)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-5 py-6 sm:px-8 lg:px-10">
        {/* 第一块：标题 + 表单 */}
        <div className="rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* 左侧标题 */}
            <div className="flex-1 space-y-6">
              <div className="inline-flex items-center rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Stickify Studio
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-balance font-sans text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-6xl">
                  [v0.9] Find the object contour first, then turn it into a
                  clean sticker.
                </h1>
                <p className="max-w-2xl text-pretty text-base leading-7 text-[var(--ink-muted)] sm:text-lg">
                  The Next.js interface stays lightweight while the FastAPI
                  backend handles remote fetch safety, contour extraction,
                  smoothing, and transparent sticker export.
                </p>
              </div>
            </div>

            {/* 右侧表单 */}
            <div className="flex-1">
              <div className="rounded-[1.75rem] border border-[var(--line-soft)] bg-white/75 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <form className="grid gap-5" onSubmit={handleSubmit}>
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

                  {mode === "upload" ? (
                    <label className="grid gap-3 rounded-[1.25rem] border border-dashed border-[var(--line-soft)] bg-[var(--paper)]/80 p-5 text-sm text-[var(--ink-muted)]">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                        Image file
                      </span>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        className="block w-full text-sm text-[var(--ink-strong)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:font-semibold file:text-[var(--ink-strong)]"
                        type="file"
                        onChange={(event) =>
                          handleFileChange(event.target.files?.[0] ?? null)
                        }
                      />
                      <span>PNG, JPEG, and WebP are supported.</span>
                    </label>
                  ) : (
                    <label className="grid gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                        Remote image URL
                      </span>
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
                      <span className="text-sm text-[var(--ink-muted)]">
                        Only public https URLs are accepted. Localhost and
                        private networks are blocked by the API.
                      </span>
                    </label>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                        Model
                      </span>
                      <select
                        className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                        value={model}
                        onChange={(event) =>
                          setModel(event.target.value as SegmentationModel)
                        }
                      >
                        {MODEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                        Outline
                      </span>
                      <select
                        className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                        value={outlinePx}
                        onChange={(event) =>
                          setOutlinePx(Number.parseInt(event.target.value, 10))
                        }
                      >
                        {OUTLINE_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value === 0
                              ? "No stroke"
                              : `${value}px white stroke`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <details className="rounded-[1rem] border border-[var(--line-soft)] bg-[var(--paper)] px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink-strong)]">
                      Advanced controls
                    </summary>
                    <div className="mt-4 grid gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                            Contour profile
                          </div>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
                            `Mask threshold` decides how much weak foreground
                            stays in the object. `Contour smoothing` decides how
                            aggressively the final outline is rounded.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                            Mask threshold
                          </span>
                          <select
                            className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                            value={maskThreshold}
                            onChange={(event) =>
                              handleMaskThresholdChange(
                                Number.parseInt(event.target.value, 10),
                              )
                            }
                          >
                            {MASK_THRESHOLD_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {value <= 112
                                  ? `${value} · more detail`
                                  : value >= 144
                                    ? `${value} · cleaner cut`
                                    : `${value} · balanced`}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                            Contour smoothing
                          </span>
                          <select
                            className="rounded-[1rem] border border-[var(--line-soft)] bg-white px-3 py-3 text-[var(--ink-strong)]"
                            value={smoothness}
                            onChange={(event) =>
                              handleSmoothnessChange(
                                Number.parseInt(event.target.value, 10),
                              )
                            }
                          >
                            {SMOOTHNESS_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {value === 0
                                  ? "0 · sharpest"
                                  : value === 2
                                    ? "2 · balanced"
                                    : value >= 4
                                      ? `${value} · softest`
                                      : `${value} · level ${value}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </details>

                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      className="rounded-full bg-[var(--ink-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isPending}
                      type="submit"
                    >
                      {isPending ? "Generating sticker..." : "Generate sticker"}
                    </button>
                    <p className="text-sm text-[var(--ink-muted)]">
                      Requests are sent directly to <code>{API_BASE_URL}</code>.
                    </p>
                  </div>

                  {error ? (
                    <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  ) : null}
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* 第二块：Preview */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 min-w-0">
            <div className="w-full rounded-[1.75rem] border border-[var(--line-soft)] bg-white/75 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                    Preview
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold">
                    Source and sticker output
                  </h2>
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
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                    Input
                  </div>
                  <div className="checkerboard mt-4 flex min-h-[320px] items-center justify-center overflow-hidden rounded-[1.2rem]">
                    {sourcePreview ? (
                      <img
                        alt="Source preview"
                        className="h-full max-h-[720px] w-full object-contain"
                        src={sourcePreview}
                      />
                    ) : (
                      <p className="max-w-[16rem] text-center text-sm leading-6 text-[var(--ink-muted)]">
                        Add a file or public image URL to preview the source
                        here.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                    Result
                  </div>
                  <div className="checkerboard mt-4 flex min-h-[320px] items-center justify-center overflow-hidden rounded-[1.2rem]">
                    {result ? (
                      <img
                        alt="Generated sticker"
                        className="h-full max-h-[720px] w-full object-contain"
                        src={result.url}
                      />
                    ) : (
                      <p className="max-w-[16rem] text-center text-sm leading-6 text-[var(--ink-muted)]">
                        Your sticker will appear here after the FastAPI backend
                        isolates the main contour and applies the white outline.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 第三块：API */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 min-w-0">
            <div className="rounded-[1.75rem] border border-[var(--line-soft)] bg-[var(--paper)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                API example
              </div>
              <pre className="mt-4 overflow-x-auto rounded-[1.2rem] bg-[var(--ink-strong)] p-4 text-sm leading-7 text-slate-100">
                <code>
                  {createCurlExample(
                    model,
                    outlinePx,
                    maskThreshold,
                    smoothness,
                  )}
                </code>
              </pre>
              <div className="mt-5 flex flex-col gap-2 text-sm leading-6 text-[var(--ink-muted)]">
                <p>
                  <code>POST /v1/stickerize</code> accepts either{" "}
                  <code>multipart/form-data</code> with a <code>file</code>{" "}
                  field or JSON with an <code>imageUrl</code> field.
                </p>
                <p>
                  Public options currently exposed in the UI are{" "}
                  <code>model</code> and <code>outlinePx</code>. The frontend
                  sends fixed values <code>size=1000</code> and{" "}
                  <code>format=png</code>.
                </p>
                <p>
                  Advanced controls map directly to <code>maskThreshold</code>{" "}
                  and <code>smoothness</code>. Successful responses return PNG
                  image bytes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
