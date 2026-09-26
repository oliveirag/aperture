"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { TickerCombobox } from "@/components/shared/ticker-combobox";
import { cn } from "@/lib/utils";
import type { Phase } from "./drop-zone";

const MAX_ROWS = 50;
const TICKER = /^[A-Z][A-Z.]{0,5}$/;

export type ManualRow = { id: number; ticker: string; shares: string };

let nextId = 1;
export const blankRow = (): ManualRow => ({ id: nextId++, ticker: "", shares: "" });

const cleanTicker = (t: string) => t.trim().toUpperCase().replace(/^\$/, "").replace(/[/-]/g, ".");

// Why a row can't be priced, or null if it's fine. Empty rows are ignored rather than flagged.
function problem(r: ManualRow): string | null {
  if (!r.ticker.trim() && !r.shares.trim()) return null;
  if (!TICKER.test(cleanTicker(r.ticker))) return "Enter a ticker like AAPL or BRK.B, or pick a company from the list";
  const n = Number(r.shares);
  if (!(n > 0) || !Number.isFinite(n)) return "Enter a share count above 0";
  return null;
}

const INPUT =
  "h-10 w-full border border-border-strong bg-bg px-3 text-[15px] text-text outline-none transition-[border-color] duration-150 placeholder:text-text-subtle focus:border-text disabled:opacity-60";

// Typed entry: ticker + shares rows. Rows live in the parent so "Start over" keeps them for editing.
export function ManualEntry({
  phase,
  rows,
  onRowsChange,
  onSubmit,
}: {
  phase: Phase;
  rows: ManualRow[];
  onRowsChange: (rows: ManualRow[]) => void;
  onSubmit: (rows: { ticker: string; shares: number }[]) => void;
}) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const locked = phase === "scanning";
  const filled = rows.filter((r) => r.ticker.trim() || r.shares.trim());

  const update = (rowId: number, patch: Partial<ManualRow>) => onRowsChange(rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  const remove = (rowId: number) => {
    const next = rows.filter((r) => r.id !== rowId);
    onRowsChange(next.length ? next : [blankRow()]);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (filled.length === 0 || filled.some((r) => problem(r))) return;
    onSubmit(filled.map((r) => ({ ticker: cleanTicker(r.ticker), shares: Number(r.shares) })));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex min-h-[420px] w-full flex-col rounded-2xl border-[1.5px] border-solid border-border-strong bg-surface-1 p-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 text-[11px] font-medium tracking-[0.06em] text-text-subtle uppercase">
        <span id={`${id}-t`}>Ticker</span>
        <span id={`${id}-s`}>Shares</span>
        <span aria-hidden />
      </div>
      <ul className="mt-2 flex max-h-[300px] flex-col gap-2 overflow-y-auto">
        {rows.map((r, i) => {
          const err = touched ? problem(r) : null;
          return (
            <li key={r.id}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-2">
                <TickerCombobox
                  aria-labelledby={`${id}-t`}
                  aria-invalid={Boolean(err) && !TICKER.test(cleanTicker(r.ticker))}
                  value={r.ticker}
                  onChange={(ticker) => update(r.id, { ticker: ticker.toUpperCase() })}
                  placeholder={i === 0 ? "VOO or Apple" : ""}
                  maxLength={40}
                  autoCapitalize="characters"
                  disabled={locked}
                  className={cn(INPUT, "font-medium", err && !TICKER.test(cleanTicker(r.ticker)) && "border-negative")}
                />
                <input
                  aria-labelledby={`${id}-s`}
                  value={r.shares}
                  onChange={(e) => update(r.id, { shares: e.target.value.replace(/[^\d.]/g, "") })}
                  placeholder={i === 0 ? "75" : ""}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={locked}
                  className={cn(INPUT, "tabular-nums", err && TICKER.test(cleanTicker(r.ticker)) && "border-negative")}
                />
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={locked}
                  aria-label={`Remove row ${i + 1}`}
                  className="inline-flex size-8 items-center justify-center text-text-muted transition-colors duration-150 hover:text-text disabled:opacity-40"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {err ? <p className="mt-1 text-[12px] text-negative">{err}</p> : null}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onRowsChange([...rows, blankRow()])}
        disabled={locked || rows.length >= MAX_ROWS}
        className="mt-3 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-text-muted transition-colors duration-150 hover:text-text disabled:opacity-40"
      >
        <Plus aria-hidden className="size-4" />
        Add position
      </button>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {touched && filled.length === 0 ? <p className="text-[13px] text-negative">Add at least one ticker and share count.</p> : null}
        <button
          type="submit"
          disabled={locked}
          className="inline-flex h-11 w-full items-center justify-center bg-text text-[15px] font-medium text-bg transition-[transform,translate,scale,background-color] duration-150 ease-out hover:bg-text/85 active:scale-[0.97] disabled:opacity-60"
        >
          {phase === "extracted" || phase === "error" ? "Price again" : "Price my holdings"}
        </button>
      </div>
    </form>
  );
}
