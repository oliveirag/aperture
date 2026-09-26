"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
import { StepIndicator } from "@/features/onboarding/step-indicator";
import { DropZone, type ImportImage, type Phase } from "./drop-zone";
import { ExtractedPanel } from "./extracted-panel";
import { SCAN_MS, extractHoldings, type ExtractedHolding } from "./extract";

// Reduced motion skips the sweep and lands on the result quickly.
const REDUCED_SCAN_MS = 600;

type State = { phase: Phase; image: ImportImage | null; holdings: ExtractedHolding[] };
type Action = { type: "start"; image: ImportImage } | { type: "done"; holdings: ExtractedHolding[] } | { type: "reset" };

const IDLE: State = { phase: "idle", image: null, holdings: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { phase: "scanning", image: action.image, holdings: [] };
    case "done":
      return state.phase === "scanning" ? { ...state, phase: "extracted", holdings: action.holdings } : state;
    case "reset":
      return IDLE;
  }
}

// idle -> scanning -> extracted. Scripted: any image, or the sample, reads as the canon portfolio.
export function ImportFlow() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const scanMs = reduce ? REDUCED_SCAN_MS : SCAN_MS;
  const [state, dispatch] = useReducer(reducer, IDLE);
  const run = useRef(0);
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
    let image: ImportImage = { kind: "sample" };
    if (input.file) {
      objectUrl.current = URL.createObjectURL(input.file);
      image = { kind: "file", url: objectUrl.current, name: input.file.name };
    }
    const id = ++run.current;
    dispatch({ type: "start", image });
    extractHoldings(input, { delayMs: scanMs }).then((holdings) => {
      if (run.current === id) dispatch({ type: "done", holdings });
    });
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
          Drop a screenshot of your brokerage positions. Gemini reads the tickers and share counts; the image is never stored.
        </p>
      </section>

      <div className="bx-container mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[560px_minmax(0,1fr)]">
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
          scanMs={scanMs}
          reduce={reduce}
          onContinue={() => router.push("/xray")}
          onReset={reset}
        />
      </div>
    </motion.main>
  );
}
