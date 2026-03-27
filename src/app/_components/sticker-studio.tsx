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
const API_PARAMETER_ROWS = [
  {
    name: "file",
    required: "Conditional",
    values: "PNG, JPEG, WebP",
    note: "Used in multipart/form-data uploads.",
  },
  {
    name: "imageUrl",
    required: "Conditional",
    values: "Public https URL",
    note: "Used in JSON requests.",
  },
  {
    name: "model",
    required: "No",
    values: "u2netp, isnet-general-use",
    note: "Segmentation model.",
  },
  {
    name: "outlinePx",
    required: "No",
    values: "UI: 0, 6, 10, 14, 18, 24 | API: 0-48",
    note: "White outline thickness.",
  },
  {
    name: "size",
    required: "No",
    values: "UI: 1000 | API: 256-1024",
    note: "Output width and height.",
  },
  {
    name: "format",
    required: "No",
    values: "png, webp",
    note: "UI currently sends png.",
  },
  {
    name: "maskThreshold",
    required: "No",
    values: "UI: 96, 112, 128, 144, 160 | API: 1-254",
    note: "Foreground cutoff.",
  },
  {
    name: "smoothness",
    required: "No",
    values: "0, 1, 2, 3, 4",
    note: "Contour smoothing level.",
  },
] as const;

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

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M18.901 1.153H22.58l-8.036 9.183L24 22.847h-7.406l-5.8-7.584-6.639 7.584H.473l8.595-9.824L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.291 19.49h2.039L6.486 3.25H4.298L17.61 20.643Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 .5a12 12 0 0 0-3.793 23.385c.6.111.82-.26.82-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.388-1.334-1.757-1.334-1.757-1.09-.745.083-.73.083-.73 1.205.085 1.839 1.237 1.839 1.237 1.07 1.833 2.807 1.304 3.492.997.108-.775.418-1.304.762-1.604-2.665-.303-5.467-1.333-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.323 3.301 1.23a11.45 11.45 0 0 1 6.008 0c2.291-1.553 3.297-1.23 3.297-1.23.654 1.652.243 2.873.119 3.176.77.84 1.234 1.911 1.234 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.814 1.103.814 2.222v3.293c0 .319.216.694.825.576A12 12 0 0 0 12 .5Z" />
    </svg>
  );
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
                Sticker Studio
              </div>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-balance font-sans text-5xl font-semibold leading-[0.92] sm:text-6xl lg:text-7xl">
                  Turn product shots and object photos into clean stickers.
                </h1>
                <p className="max-w-2xl text-pretty text-base leading-7 text-[var(--ink-muted)] sm:text-lg">
                  Upload a file or paste an image URL, fine-tune the cut, and
                  export a polished sticker with a transparent background in a
                  few clicks.
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
                        HTTPS URLs are accepted. The backend may block some
                        hosts based on its network policy.
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
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                  API example
                </div>
                <code className="text-sm text-[var(--ink-muted)]">
                  POST /v1/stickerize
                </code>
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
              <div className="mt-5 overflow-x-auto rounded-[1.2rem] border border-[var(--line-soft)] bg-white/80">
                <table className="min-w-full border-collapse text-left text-sm text-[var(--ink-muted)]">
                  <thead className="bg-[var(--paper)] text-xs uppercase tracking-[0.18em] text-[var(--ink-strong)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Parameter</th>
                      <th className="px-4 py-3 font-semibold">Required</th>
                      <th className="px-4 py-3 font-semibold">Available values</th>
                      <th className="px-4 py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_PARAMETER_ROWS.map((row) => (
                      <tr
                        key={row.name}
                        className="border-t border-[var(--line-soft)] align-top"
                      >
                        <td className="px-4 py-3 font-mono text-[var(--ink-strong)]">
                          {row.name}
                        </td>
                        <td className="px-4 py-3">{row.required}</td>
                        <td className="px-4 py-3">{row.values}</td>
                        <td className="px-4 py-3">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <footer className="rounded-[1.75rem] border border-white/50 bg-white/65 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Links
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
                Find more writing, updates, and source code around Sticker
                Studio.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <a
              className="group flex items-center gap-4 rounded-[1.25rem] border border-[var(--line-soft)] bg-white/80 px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--ink-strong)]/18 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
              href="https://middlefun.com"
              rel="noreferrer"
              target="_blank"
            >
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--line-soft)]">
                <img
                  alt="MiddleFun logo"
                  className="h-7 w-auto"
                  src="https://www.middlefun.com/middle-fun-logo-narrow.png"
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ink-strong)]">
                  Knowledge Community
                </div>
                <div className="mt-1 text-sm text-[var(--ink-muted)]">
                  MiddleFun
                </div>
              </div>
            </a>

            <a
              className="group flex items-center gap-4 rounded-[1.25rem] border border-[var(--line-soft)] bg-white/80 px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--ink-strong)]/18 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
              href="https://x.com/wensonsmith?s=21"
              rel="noreferrer"
              target="_blank"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ink-strong)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                <XIcon />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ink-strong)]">
                  Twitter
                </div>
                <div className="mt-1 text-sm text-[var(--ink-muted)]">
                  Wenson
                </div>
              </div>
            </a>

            <a
              className="group flex items-center gap-4 rounded-[1.25rem] border border-[var(--line-soft)] bg-white/80 px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--ink-strong)]/18 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
              href="https://github.com/wensonsmith/sticker-studio"
              rel="noreferrer"
              target="_blank"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--ink-strong)] ring-1 ring-[var(--line-soft)]">
                <GitHubIcon />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ink-strong)]">
                  GitHub
                </div>
                <div className="mt-1 text-sm text-[var(--ink-muted)]">
                  StickerStudio
                </div>
              </div>
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
