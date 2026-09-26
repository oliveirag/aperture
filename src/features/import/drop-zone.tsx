"use client";

import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { ImagePlus, ImageUp, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SampleBrokerageScreenshot } from "./sample-screenshot";
import { ScanOverlay, SWEEP_S } from "./scan-overlay";

// What the user handed us: one to three screenshots, the sample, or typed/CSV rows (no image).
export type ImportImage = { kind: "files"; images: { url: string; name: string }[] } | { kind: "sample" } | { kind: "typed" };

export const MAX_SCREENSHOTS = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type Phase = "idle" | "scanning" | "extracted" | "error";

// Time into a sweep at which motion's easeInOut, cubic-bezier(0.42, 0, 0.58, 1), reaches progress p.
function sweepTimeAt(p: number) {
  const curve = (a: number, b: number, s: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(0, 1, mid) < p) lo = mid;
    else hi = mid;
  }
  return curve(0.42, 0.58, lo) * SWEEP_S;
}

function images(files: FileList | null | undefined) {
  return Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
}

// One object URL per staged file, made on first render and released when the file leaves staging (releaseStaged).
const stagedUrls = new WeakMap<File, string>();
function urlFor(file: File) {
  let url = stagedUrls.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    stagedUrls.set(file, url);
  }
  return url;
}

export function releaseStaged(files: File[]) {
  for (const f of files) {
    const url = stagedUrls.get(f);
    if (url) URL.revokeObjectURL(url);
    stagedUrls.delete(f);
  }
}

// Screenshots picked but not read yet, as removable thumbnails.
function Staged({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  return (
    <ul aria-label="Screenshots to read" className="grid w-full grid-cols-3 gap-3">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="relative aspect-[3/4] overflow-hidden border border-border-strong bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlFor(f)} alt={`Screenshot ${i + 1}: ${f.name}`} className="size-full object-contain p-1.5" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove screenshot ${i + 1}`}
            className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-bg/85 text-text transition-[color,background-color,border-color,scale] duration-150 hover:bg-bg active:scale-[0.95]"
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DropZone({
  phase,
  image,
  reduce,
  staged,
  notice,
  onFiles,
  onRemove,
  onRead,
  onSample,
}: {
  phase: Phase;
  image: ImportImage | null;
  reduce: boolean;
  // Screenshots waiting to be read (two or more were picked, or one was removed from a set).
  staged: File[];
  notice: string | null;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  onRead: () => void;
  onSample: () => void;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const idle = phase === "idle";
  const scanning = phase === "scanning";
  const sweeping = scanning && !reduce;

  // Time each sample row's outline to the moment the first sweep crosses its middle.
  // Runs before paint, so the delay is in place when the CSS animation starts.
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    if (!zone || !sweeping || image?.kind !== "sample") return;
    const box = zone.getBoundingClientRect();
    zone.querySelectorAll<HTMLElement>("[data-scan-row]").forEach((row) => {
      const r = row.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (r.top + r.height / 2 - box.top) / box.height));
      row.querySelector<HTMLElement>("[data-scan-outline]")?.style.setProperty("--tw-animation-delay", `${sweepTimeAt(p)}s`);
    });
  }, [sweeping, image]);

  function onDragOver(e: DragEvent) {
    if (!idle) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    if (!zoneRef.current?.contains(e.relatedTarget as Node | null)) setDragOver(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!idle) return;
    const files = images(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  return (
    <div
      ref={zoneRef}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative flex min-h-[420px] w-full items-center justify-center overflow-hidden rounded-2xl border-[1.5px] bg-surface-1 transition-[border-color,background-color] duration-150 ease-out",
        image ? "border-solid border-border-strong" : "border-dashed border-border-strong",
        dragOver && "border-accent bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-1))]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const files = images(e.currentTarget.files);
          e.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />

      {idle && staged.length > 0 ? (
        <div className="relative flex w-full flex-col items-center gap-5 px-6 py-8">
          <Staged files={staged} onRemove={onRemove} />
          {notice ? (
            <p role="status" className="text-center text-[13px] text-sev-medium">
              {notice}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onRead}
              className="inline-flex h-10 items-center gap-2 bg-text px-4 text-[14px] font-medium text-bg transition-[opacity,transform,translate,scale] duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
            >
              <ScanLine aria-hidden className="size-4" />
              Read {staged.length} {staged.length === 1 ? "screenshot" : "screenshots"}
            </button>
            {staged.length < MAX_SCREENSHOTS ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 border border-border-strong px-4 text-[14px] font-medium text-text transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-surface-2 active:scale-[0.97]"
              >
                <ImagePlus aria-hidden className="size-4" />
                Add another
              </button>
            ) : null}
          </div>
          <p className="text-center text-[12px] text-text-subtle">
            Up to {MAX_SCREENSHOTS} screenshots of one account. Overlapping rows are counted once.
          </p>
        </div>
      ) : idle ? (
        <>
          {/* The whole zone picks a file; the sample button sits above it. */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Choose a screenshot of your brokerage positions"
            className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          />
          <div className="pointer-events-none relative flex flex-col items-center px-6 text-center">
            <ImageUp aria-hidden className="size-7 text-text-muted" strokeWidth={1.5} />
            <p className="mt-4 text-[16px] font-medium text-text">Drop a screenshot here</p>
            <p className="mt-1 text-[13px] text-text-muted">or click to choose. Up to {MAX_SCREENSHOTS} if your positions span several screens</p>
            {notice ? (
              <p role="status" className="mt-2 text-[13px] text-sev-medium">
                {notice}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onSample}
              className="pointer-events-auto mt-6 inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-text transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-surface-3 active:scale-[0.97]"
            >
              Use sample screenshot
            </button>
          </div>
        </>
      ) : image?.kind === "files" ? (
        <div className={cn("absolute inset-0 grid gap-2 p-4", image.images.length === 1 ? "grid-cols-1" : image.images.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {image.images.map((img, i) => (
            // Local object URLs; next/image adds nothing for blobs that never leave the browser.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.url} src={img.url} alt={`Uploaded screenshot${image.images.length > 1 ? ` ${i + 1}` : ""}: ${img.name}`} className="size-full min-h-0 object-contain" />
          ))}
        </div>
      ) : (
        <div className="p-4">
          <SampleBrokerageScreenshot outlined={sweeping || phase === "extracted"} />
        </div>
      )}

      {sweeping ? <ScanOverlay /> : null}
    </div>
  );
}
