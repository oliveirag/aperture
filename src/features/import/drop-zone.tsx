"use client";

import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SampleBrokerageScreenshot } from "./sample-screenshot";
import { ScanOverlay, SWEEP_S } from "./scan-overlay";

export type ImportImage = { kind: "file"; url: string; name: string } | { kind: "sample" };
export type Phase = "idle" | "scanning" | "extracted";

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

function firstImage(files: FileList | null | undefined) {
  return Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
}

export function DropZone({
  phase,
  image,
  reduce,
  onFile,
  onSample,
}: {
  phase: Phase;
  image: ImportImage | null;
  reduce: boolean;
  onFile: (file: File) => void;
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
    const file = firstImage(e.dataTransfer.files);
    if (file) onFile(file);
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
        tabIndex={-1}
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const file = firstImage(e.currentTarget.files);
          e.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />

      {idle ? (
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
            <p className="mt-1 text-[13px] text-text-muted">or click to choose a file</p>
            <button
              type="button"
              onClick={onSample}
              className="pointer-events-auto mt-6 inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface-2 px-4 text-[13px] font-medium text-text transition-[background-color,transform] duration-150 ease-out hover:bg-surface-3 active:scale-[0.97]"
            >
              Use sample screenshot
            </button>
          </div>
        </>
      ) : image?.kind === "file" ? (
        // A local object URL; next/image adds nothing for a blob that never leaves the browser.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.url} alt={`Uploaded screenshot: ${image.name}`} className="absolute inset-0 size-full object-contain p-4" />
      ) : (
        <div className="p-4">
          <SampleBrokerageScreenshot outlined={sweeping || phase === "extracted"} />
        </div>
      )}

      {sweeping ? <ScanOverlay /> : null}
    </div>
  );
}
