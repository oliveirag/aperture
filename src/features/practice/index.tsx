"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
import { TickerMark } from "@/components/shared/ticker-mark";
import { DEFAULT_PRACTICE_AMOUNT, PRACTICE_AMOUNTS, PRACTICE_TEMPLATES } from "@/data/practice";
import { StepIndicator } from "@/features/onboarding/step-indicator";
import { formatUSD } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import { CUSTOM, TemplatePicker, type PracticeChoice } from "./template-picker";
import { usePracticePrices, type PracticeLeg } from "./use-practice-prices";

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1_000_000;
const STEPS = ["Experience", "Practice", "X-Ray"];

const formatShares = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 3 });

function AmountPicker({ amount, onChange }: { amount: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(amount));
  const preset = PRACTICE_AMOUNTS.includes(amount);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-text">How much pretend money?</p>
      <div className="flex flex-wrap items-center gap-2">
        {PRACTICE_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={amount === a}
            onClick={() => {
              onChange(a);
              setText(String(a));
            }}
            className={cn(
              "h-10 border px-4 text-[14px] tabular-nums transition-colors duration-150",
              amount === a ? "border-text bg-text text-bg" : "border-border-strong text-text hover:border-text",
            )}
          >
            {formatUSD(a)}
          </button>
        ))}
        <label className={cn("flex h-10 items-center border px-3 text-[14px]", !preset ? "border-text" : "border-border-strong")}>
          <span className="text-text-muted">$</span>
          <input
            value={text}
            inputMode="numeric"
            aria-label="Custom amount in dollars"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
              setText(digits);
              const n = Number(digits);
              if (n >= MIN_AMOUNT && n <= MAX_AMOUNT) onChange(n);
            }}
            className="w-24 bg-transparent pl-1 text-text tabular-nums outline-none"
          />
        </label>
      </div>
      {Number(text) < MIN_AMOUNT ? <p className="text-[13px] text-text-muted">Enter at least {formatUSD(MIN_AMOUNT)}.</p> : null}
    </div>
  );
}

// Beginner Practice Portfolio: pick a starter or your own tickers, split pretend dollars evenly, price them live,
// then see the real X-Ray of what that money would own. Nothing is bought.
export function PracticeBuilder() {
  const router = useRouter();
  const setImported = usePortfolio((s) => s.setImported);
  const [choice, setChoice] = useState<PracticeChoice>(PRACTICE_TEMPLATES[1].id);
  const [custom, setCustom] = useState<string[]>([]);
  const [amount, setAmount] = useState(DEFAULT_PRACTICE_AMOUNT);

  const legs: PracticeLeg[] = useMemo(() => {
    const picks = choice === CUSTOM ? custom.map((ticker) => ({ ticker, name: undefined })) : (PRACTICE_TEMPLATES.find((t) => t.id === choice)?.tickers ?? []);
    if (picks.length === 0) return [];
    // Even split, in whole cents; the last leg takes the rounding remainder so the total is exact.
    const each = Math.floor((amount / picks.length) * 100) / 100;
    return picks.map((p, i) => ({
      ticker: p.ticker,
      name: p.name,
      dollars: i === picks.length - 1 ? Math.round((amount - each * (picks.length - 1)) * 100) / 100 : each,
    }));
  }, [choice, custom, amount]);

  const prices = usePracticePrices(legs);
  const ready = prices.status === "ready" && prices.holdings.length > 0;
  const total = prices.status === "ready" ? prices.holdings.reduce((s, h) => s + h.value, 0) : 0;
  const example = prices.status === "ready" ? prices.holdings.find((h) => h.shares < 1) : undefined;

  function start() {
    if (prices.status !== "ready") return;
    setImported(
      prices.holdings.map((h) => ({ ticker: h.ticker, name: h.name, industry: h.industry, shares: h.shares, price: h.price ?? h.value / h.shares })),
      "practice",
    );
    router.push("/xray");
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex min-h-dvh w-full flex-col pb-16"
    >
      <header className="bx-container flex h-24 items-center justify-between gap-6">
        <Link href="/" aria-label="Aperture home">
          <Wordmark size="sm" className="sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>
        <StepIndicator current={2} steps={STEPS} />
      </header>

      <section className="bx-container grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <h1 className="display text-[40px] leading-[1.08] text-text sm:text-[56px]">Build a practice portfolio</h1>
        <p className="max-w-[42ch] text-[17px] leading-[1.55] font-light text-text lg:pb-2">
          Pretend money, real prices. Pick a starter or the companies you&apos;re curious about, then see what you would actually own.
          Nothing is bought.
        </p>
      </section>

      <div className="bx-container mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <TemplatePicker choice={choice} onChoice={setChoice} custom={custom} onCustom={setCustom} />
          <AmountPicker amount={amount} onChange={setAmount} />
        </div>

        <section aria-label="Practice portfolio preview" aria-live="polite" className="flex min-w-0 flex-col bg-surface-1 lg:self-start">
          <header className="flex h-12 items-center justify-between border-b border-border px-5">
            <h2 className="text-[14px] font-medium text-text">Your practice portfolio</h2>
            <span className="border border-border-strong px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] text-text-muted uppercase">
              No real money
            </span>
          </header>

          <div className="min-h-[220px] px-5 py-2">
            {prices.status === "idle" ? (
              <p className="py-8 text-[14px] text-text-muted">Add at least one ticker to see what your money would buy.</p>
            ) : prices.status === "loading" ? (
              <p className="flex items-center gap-2 py-8 text-[14px] text-text-muted">
                <LoaderCircle aria-hidden className="size-4 animate-spin text-accent" />
                Checking today&apos;s prices…
              </p>
            ) : prices.status === "error" ? (
              <p className="py-8 text-[14px] text-text">{prices.error}</p>
            ) : (
              <ul>
                {prices.holdings.map((h) => (
                  <li key={h.ticker} className="flex h-14 items-center gap-3 border-b border-border last:border-b-0">
                    <TickerMark ticker={h.ticker} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-text">{h.ticker}</span>
                      <span className="block truncate text-[12px] text-text-muted">{h.name}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[14px] text-text tabular-nums">{formatUSD(h.value, 2)}</span>
                      <span className="block text-[12px] text-text-muted tabular-nums">
                        {formatShares(h.shares)} {h.shares === 1 ? "share" : "shares"} at {formatUSD(h.price ?? 0, 2)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {prices.status === "ready" && prices.missing.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-[13px]">
                <p className="text-sev-medium">
                  No price for {prices.missing.join(", ")}, so {formatUSD(amount - total)} of your {formatUSD(amount)} isn&apos;t invested.
                </p>
                {choice === CUSTOM ? (
                  <button
                    type="button"
                    onClick={() => setCustom(custom.filter((t) => !prices.missing.includes(t)))}
                    className="font-medium text-text underline underline-offset-4 hover:text-accent"
                  >
                    Remove {prices.missing.join(", ")} and re-split
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <footer className="flex flex-col gap-3 border-t border-border p-5">
            <p className="flex items-baseline justify-between text-[14px] text-text-muted">
              Total
              <span className="text-[20px] font-medium text-text tabular-nums">{ready ? formatUSD(total, 2) : "–"}</span>
            </p>
            {example ? (
              <p className="flex gap-2 text-[13px] leading-5 text-text-muted">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                {formatUSD(example.value)} buys {formatShares(example.shares)} of one {example.ticker} share. Most brokerages let you buy
                fractions of a share.
              </p>
            ) : null}
            <button
              type="button"
              onClick={start}
              disabled={!ready}
              className="group inline-flex h-11 w-full items-center justify-center gap-2 bg-text text-[15px] font-medium text-bg transition-[transform,translate,scale,background-color] duration-150 ease-out hover:bg-text/85 active:scale-[0.97] disabled:opacity-40"
            >
              Look through my practice portfolio
              <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </button>
            <Link href="/import" className="self-center text-[13px] text-text-muted underline-offset-4 hover:text-text hover:underline">
              I already own investments
            </Link>
          </footer>
        </section>
      </div>
    </motion.main>
  );
}
