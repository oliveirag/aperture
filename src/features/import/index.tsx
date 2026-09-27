"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
import { StepIndicator } from "@/features/onboarding/step-indicator";
import { CsvZone, type CsvFile } from "./csv-zone";
import { DropZone, MAX_IMAGE_BYTES, MAX_SCREENSHOTS, releaseStaged, type ImportImage, type Phase } from "./drop-zone";
import { ExtractedPanel } from "./extracted-panel";
import { ManualEntry, blankRow, type ManualRow } from "./manual-entry";
import { ModeSwitch, type ImportMode } from "./mode-switch";
import { HOLDINGS } from "@/data/portfolio";
import { useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";
import { SCAN_MS, counts, extractHoldings, type ExtractedHolding, type ExtractResult, type TypedRow } from "./extract";

// Typed and CSV rows skip the image scan, so a short beat is enough.
const TYPED_MS = 900;

type Input = { files?: File[]; sample?: boolean; rows?: TypedRow[] };

// Reduced motion skips the sweep and lands on the result quickly.
const REDUCED_SCAN_MS = 600;

type State = { phase: Phase; image: ImportImage | null; holdings: ExtractedHolding[]; error: string | null };
type Action = { type: "start"; image: ImportImage } | { type: "done"; result: ExtractResult } | { type: "reset" };

// A read of the demo screenshot keeps the demo portfolio, so the curated analysis still applies.
function isDemoPortfolio(holdings: ExtractedHolding[]) {
  const rows = holdings.filter(counts);
  return rows.length === HOLDINGS.length && HOLDINGS.every((h) => rows.some((r) => r.ticker === h.ticker && r.shares === h.shares));
}

const IDLE: State = { phase: "idle", image: null, holdings: [], error: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { phase: "scanning", image: action.image, holdings: [], error: null };
    case "done":
      if (state.phase !== "scanning") return state;
      return action.result.ok
        ? { ...state, phase: "extracted", holdings: action.result.holdings }
        : { ...state, phase: "error", error: action.result.error };
    case "reset":
      return IDLE;
  }
}

// idle -> scanning -> extracted | error. Three ways in: a screenshot (Gemini reads it), a CSV export, or typed rows.
// Every position is priced live by Finnhub; the sample replays the demo portfolio.
export function ImportFlow() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const scanMs = reduce ? REDUCED_SCAN_MS : SCAN_MS;
  const [state, dispatch] = useReducer(reducer, IDLE);
  const run = useRef(0);
  const lastInput = useRef<Input | null>(null);
  const [mode, setMode] = useState<ImportMode>("screenshot");
  const [csvFile, setCsvFile] = useState<CsvFile | null>(null);
  const [manualRows, setManualRows] = useState<ManualRow[]>(() => [blankRow(), blankRow(), blankRow()]);
  const setImported = usePortfolio((s) => s.setImported);
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  useHydratePortfolio();
  const objectUrls = useRef<string[]>([]);
  const [staged, setStaged] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const releaseUrl = useCallback(() => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current = [];
  }, []);

  // Free the last dropped image when the page goes away.
  useEffect(() => releaseUrl, [releaseUrl]);

  // A drop that misses the zone must not navigate the tab to the image mid-demo.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  useEffect(() => {
    if (state.phase === "extracted") router.prefetch("/xray");
  }, [state.phase, router]);

  function start(input: Input) {
    releaseUrl();
    lastInput.current = input;
    let image: ImportImage = input.rows ? { kind: "typed" } : { kind: "sample" };
    if (input.files?.length) {
      objectUrls.current = input.files.map((f) => URL.createObjectURL(f));
      image = { kind: "files", images: input.files.map((f, i) => ({ url: objectUrls.current[i], name: f.name })) };
    }
    releaseStaged(staged);
    setStaged([]);
    setNotice(null);
    const id = ++run.current;
    dispatch({ type: "start", image });
    extractHoldings(input, { delayMs: input.rows ? Math.min(scanMs, TYPED_MS) : scanMs }).then((result) => {
      if (run.current === id) dispatch({ type: "done", result });
    });
  }

  // The sample is the demo portfolio; a real read becomes this session's portfolio.
  function confirm() {
    if (state.image?.kind !== "sample" && !isDemoPortfolio(state.holdings)) {
      setImported(
        state.holdings
          .filter(counts)
          .map((h) => ({ ticker: h.ticker, name: h.name, industry: h.industry, shares: h.shares, price: h.price ?? h.value / h.shares })),
      );
    } else {
      resetToDemo();
    }
    router.push("/xray");
  }

  // One screenshot reads straight away, as before; two or three are staged so they can be checked and removed first.
  function addFiles(files: File[]) {
    const fits = files.filter((f) => f.size <= MAX_IMAGE_BYTES);
    const all = [...staged, ...fits];
    const kept = all.slice(0, MAX_SCREENSHOTS);
    const notes = [
      fits.length < files.length ? "Each screenshot must be 5MB or smaller." : "",
      all.length > MAX_SCREENSHOTS ? `Up to ${MAX_SCREENSHOTS} screenshots; kept the first ${MAX_SCREENSHOTS}.` : "",
    ].filter(Boolean);
    setNotice(notes.join(" ") || null);
    if (staged.length === 0 && kept.length === 1 && notes.length === 0) {
      start({ files: kept });
      return;
    }
    setStaged(kept);
  }

  function retry() {
    start(lastInput.current ?? { sample: true });
  }

  function startSample() {
    setMode("screenshot");
    start({ sample: true });
  }

  function changeMode(next: ImportMode) {
    if (next === mode) return;
    reset();
    setCsvFile(null);
    setMode(next);
  }

  function reset() {
    run.current++;
    releaseUrl();
    releaseStaged(staged);
    setStaged([]);
    setNotice(null);
    dispatch({ type: "reset" });
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex min-h-dvh w-full flex-col pb-16"
    >
      <header className="bx-container flex h-24 items-center justify-between gap-6">
        <Link href="/" aria-label="Lookthrough home">
          <Wordmark size="sm" className="sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>
        <StepIndicator current={2} />
      </header>

      <section className="bx-container grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <h1 className="display text-[40px] leading-[1.08] text-text sm:text-[56px]">Import your portfolio</h1>
        <p className="max-w-[40ch] text-[17px] leading-[1.55] font-light text-text lg:pb-2">
          A screenshot, a CSV export or typed positions. Priced live; nothing you upload is stored.
          <Link href="/practice" className="mt-3 block text-[15px] text-text-muted underline underline-offset-4 hover:text-text">
            Don&apos;t own anything yet? Build a practice portfolio
          </Link>
        </p>
      </section>

      <div className="bx-container mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[560px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ModeSwitch mode={mode} disabled={state.phase === "scanning"} onChange={changeMode} />
          {mode === "screenshot" ? (
            <DropZone
              phase={state.phase}
              image={state.image}
              reduce={reduce}
              staged={staged}
              notice={notice}
              onFiles={addFiles}
              onRemove={(i) => {
                releaseStaged([staged[i]]);
                setStaged(staged.filter((_, j) => j !== i));
              }}
              onRead={() => staged.length && start({ files: staged })}
              onSample={() => start({ sample: true })}
            />
          ) : mode === "csv" ? (
            <CsvZone
              phase={state.phase}
              file={csvFile}
              onRows={(file) => {
                setCsvFile(file);
                start({ rows: file.rows });
              }}
            />
          ) : (
            <ManualEntry
              phase={state.phase}
              rows={manualRows}
              onRowsChange={setManualRows}
              onSubmit={(rows) => start({ rows: rows.map((r) => ({ ...r, marketValue: null })) })}
            />
          )}
        </div>
        <ExtractedPanel
          phase={state.phase}
          holdings={state.holdings}
          error={state.error}
          scanMs={scanMs}
          reduce={reduce}
          onContinue={confirm}
          onRetry={retry}
          onSample={startSample}
          onReset={() => {
            reset();
            setCsvFile(null);
          }}
        />
      </div>
    </motion.main>
  );
}
