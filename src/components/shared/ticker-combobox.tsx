"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { TickerMark } from "@/components/shared/ticker-mark";
import { cn } from "@/lib/utils";

export type TickerOption = { ticker: string; name: string; type: "stock" | "etf" };

const DEBOUNCE_MS = 200;
// Shared across every combobox on the page: typing the same prefix twice doesn't refetch.
const cache = new Map<string, TickerOption[]>();

async function search(q: string, signal: AbortSignal): Promise<TickerOption[]> {
  const key = q.toUpperCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const { results } = (await res.json()) as { results: TickerOption[] };
  cache.set(key, results);
  return results;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSelect" | "role"> & {
  value: string;
  onChange: (value: string) => void;
  // Called when an option is chosen (click or Enter). Defaults to putting the ticker in the input.
  onSelect?: (option: TickerOption) => void;
  listClassName?: string;
};

// Ticker input with suggestions by symbol or company name (ARIA 1.2 combobox with a listbox popup).
// Free typing always works: suggestions are optional, and nothing is lost when search is unavailable.
export function TickerCombobox({
  value,
  onChange,
  onSelect,
  className,
  listClassName,
  onKeyDown,
  onBlur,
  onFocus,
  disabled,
  ...rest
}: Props) {
  const listId = useId();
  const [options, setOptions] = useState<TickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const skip = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const query = value.trim();
  useEffect(() => {
    // Don't search again for the ticker that was just picked.
    if (!focused || !query || skip.current === query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(query, controller.signal)
        .then((results) => {
          setOptions(results);
          setActive(-1);
          setOpen(results.length > 0);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, focused]);

  const shown = open && focused && query.length > 0 && options.length > 0;

  // The list is portaled and fixed under the input, so scrolling containers (the typed-entry rows) can't clip it.
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [shown]);

  function choose(option: TickerOption) {
    skip.current = option.ticker;
    setOpen(false);
    setActive(-1);
    if (onSelect) onSelect(option);
    else onChange(option.ticker);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const n = options.length;
      setActive((i) => (i < 0 ? (step > 0 ? 0 : n - 1) : (i + step + n) % n));
      return;
    }
    if (e.key === "Enter" && shown && active >= 0) {
      e.preventDefault();
      choose(options[active]);
      return;
    }
    if (e.key === "Escape" && shown) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    onKeyDown?.(e);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        {...rest}
        ref={inputRef}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          skip.current = null;
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={keyDown}
        className={className}
      />
      {shown && rect
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              aria-label="Ticker suggestions"
              style={{ left: rect.left, top: rect.top, width: Math.max(rect.width, 280) }}
              className={cn(
                "fixed z-[60] max-h-72 overflow-y-auto border border-border-strong bg-surface-2 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]",
                listClassName,
              )}
            >
              {options.map((o, i) => (
                <li
                  key={o.ticker}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // Keep focus in the input so the blur doesn't close the list before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-default items-center gap-2.5 px-3 py-2 text-left", i === active && "bg-surface-3")}
                >
                  <TickerMark ticker={o.ticker} size={24} />
                  <span className="w-14 shrink-0 text-[13px] font-medium text-text">{o.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-text-muted">{o.name}</span>
                  {o.type === "etf" ? <span className="shrink-0 text-[11px] text-text-subtle">ETF</span> : null}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
