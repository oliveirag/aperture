"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, X } from "lucide-react";
import { TickerCombobox } from "@/components/shared/ticker-combobox";
import { MAX_PRACTICE_TICKERS, PRACTICE_TEMPLATES } from "@/data/practice";
import { cn } from "@/lib/utils";

export type PracticeChoice = string; // a template id, or "custom"
export const CUSTOM = "custom";

const OPTIONS = [
  ...PRACTICE_TEMPLATES.map((t) => ({ id: t.id, title: t.title, body: t.body, tickers: t.tickers.map((x) => x.ticker) })),
  { id: CUSTOM, title: "Pick my own", body: "Choose up to 10 companies or funds you're curious about.", tickers: [] as string[] },
];

const SUGGESTIONS = ["VOO", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "TSLA", "KO", "SCHD", "JPM", "DIS"];
const TICKER = /^[A-Z][A-Z.]{0,5}$/;

const clean = (t: string) => t.trim().toUpperCase().replace(/^\$/, "").replace(/[/-]/g, ".");

// Radio cards for the three starters plus "Pick my own", which opens a ticker picker.
export function TemplatePicker({
  choice,
  onChoice,
  custom,
  onCustom,
}: {
  choice: PracticeChoice;
  onChoice: (c: PracticeChoice) => void;
  custom: string[];
  onCustom: (tickers: string[]) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const i = OPTIONS.findIndex((o) => o.id === choice);
    const next = (i + (forward ? 1 : OPTIONS.length - 1)) % OPTIONS.length;
    onChoice(OPTIONS[next].id);
    refs.current[next]?.focus();
  }

  function add(raw: string) {
    const parts = raw.split(/[\s,]+/).map(clean).filter(Boolean);
    if (parts.length === 0) return;
    const bad = parts.find((t) => !TICKER.test(t));
    if (bad) return setError(`"${bad}" doesn't look like a ticker. Try AAPL or BRK.B.`);
    const next = [...custom];
    for (const t of parts) if (!next.includes(t)) next.push(t);
    if (next.length > MAX_PRACTICE_TICKERS) return setError(`Up to ${MAX_PRACTICE_TICKERS} tickers.`);
    setError(null);
    setDraft("");
    onCustom(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Starter portfolio" onKeyDown={onKeyDown} className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o, i) => {
          const selected = o.id === choice;
          return (
            <button
              key={o.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChoice(o.id)}
              className={cn(
                "relative flex min-h-[168px] flex-col items-start p-6 text-left transition-[background-color,color,transform] duration-300 ease-out active:scale-[0.99]",
                selected ? "theme-light" : "bg-surface-1 hover:bg-surface-2",
              )}
            >
              <span className="display text-[24px] leading-tight text-text">{o.title}</span>
              <span className="mt-2 text-[14px] leading-[1.5] text-text-muted">{o.body}</span>
              {o.tickers.length > 0 ? (
                <span className="mt-auto flex gap-1.5 pt-4">
                  {o.tickers.map((t) => (
                    <span key={t} className="border border-border-strong px-1.5 py-0.5 text-[11px] font-medium tracking-[0.04em] text-text">
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
              {selected ? (
                <span aria-hidden className="absolute top-6 right-6 inline-flex size-5 items-center justify-center rounded-full bg-text text-bg">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {choice === CUSTOM ? (
        <div className="border border-border-strong bg-surface-1 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add(draft);
            }}
            className="flex gap-2"
          >
            <TickerCombobox
              value={draft}
              onChange={(v) => {
                setDraft(v.toUpperCase());
                setError(null);
              }}
              onSelect={(o) => add(o.ticker)}
              placeholder="Type a ticker or company, e.g. MSFT"
              aria-label="Add a ticker"
              autoCapitalize="characters"
              className="h-10 w-full min-w-0 border border-border-strong bg-bg px-3 text-[15px] font-medium text-text outline-none placeholder:font-normal placeholder:text-text-subtle focus:border-text"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 bg-text px-4 text-[14px] font-medium text-bg transition-[background-color] duration-150 hover:bg-text/85"
            >
              <Plus aria-hidden className="size-4" />
              Add
            </button>
          </form>
          {error ? <p className="mt-2 text-[13px] text-negative">{error}</p> : null}

          {custom.length > 0 ? (
            <ul aria-label="Your tickers" className="mt-4 flex flex-wrap gap-2">
              {custom.map((t) => (
                <li key={t} className="inline-flex h-8 items-center gap-1 border border-text pr-1 pl-2.5 text-[13px] font-medium text-text">
                  {t}
                  <button
                    type="button"
                    onClick={() => onCustom(custom.filter((x) => x !== t))}
                    aria-label={`Remove ${t}`}
                    className="inline-flex size-6 items-center justify-center text-text-muted hover:text-text"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-4 text-[12px] text-text-subtle">Popular picks</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.filter((t) => !custom.includes(t)).map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => add(t)}
                  disabled={custom.length >= MAX_PRACTICE_TICKERS}
                  className="h-7 border border-border px-2 text-[12px] font-medium text-text-muted transition-colors duration-150 hover:border-text hover:text-text disabled:opacity-40"
                >
                  + {t}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
