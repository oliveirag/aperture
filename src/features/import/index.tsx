"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
import { StepIndicator } from "@/features/onboarding/step-indicator";
import { DropZone, type ImportImage, type Phase } from "./drop-zone";
import { ExtractedPanel } from "./extracted-panel";
import { HOLDINGS } from "@/data/portfolio";
import { useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";
import { SCAN_MS, counts, extractHoldings, type ExtractedHolding, type ExtractResult } from "./extract";

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

// idle -> scanning -> extracted | error. A dropped image is read by Gemini and priced by Finnhub; the sample replays the demo portfolio.
export function ImportFlow() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const scanMs = reduce ? REDUCED_SCAN_MS : SCAN_MS;
  const [state, dispatch] = useReducer(reducer, IDLE);
  const run = useRef(0);
  const lastFile = useRef<File | null>(null);
  const setImported = usePortfolio((s) => s.setImported);
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  useHydratePortfolio();
  const objectUrl = useRef<string | null>(null);

  const releaseUrl = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
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

  function start(input: { file?: File; sample?: boolean }) {
    releaseUrl();
    lastFile.current = input.file ?? null;
    let image: ImportImage = { kind: "sample" };
    if (input.file) {
      objectUrl.current = URL.createObjectURL(input.file);
      image = { kind: "file", url: objectUrl.current, name: input.file.name };
    }
    const id = ++run.current;
    dispatch({ type: "start", image });
    extractHoldings(input, { delayMs: scanMs }).then((result) => {
      if (run.current === id) dispatch({ type: "done", result });
    });
  }

  // The sample is the demo portfolio; a real read becomes this session's portfolio.
  function confirm() {
    if (state.image?.kind === "file" && !isDemoPortfolio(state.holdings)) {
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

  function retry() {
    if (lastFile.current) start({ file: lastFile.current });
    else start({ sample: true });
  }

  function reset() {
    run.current++;
    releaseUrl();
    dispatch({ type: "reset" });
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-4 pb-10 sm:px-8"
    >
      <header className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <StepIndicator current={2} />
      </header>

      <section className="pt-2">
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-text sm:text-[40px]">Import your portfolio</h1>
        <p className="mt-2 max-w-[640px] text-[16px] text-text-muted">
          Drop a screenshot of your brokerage positions. Gemini reads every position and Finnhub prices it live; the image is never stored.
        </p>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[560px_minmax(0,1fr)]">
        <DropZone
          phase={state.phase}
          image={state.image}
          reduce={reduce}
          onFile={(file) => start({ file })}
          onSample={() => start({ sample: true })}
        />
        <ExtractedPanel
          phase={state.phase}
          holdings={state.holdings}
          error={state.error}
          scanMs={scanMs}
          reduce={reduce}
          onContinue={confirm}
          onRetry={retry}
          onSample={() => start({ sample: true })}
          onReset={reset}
        />
      </div>
    </motion.main>
  );
}
