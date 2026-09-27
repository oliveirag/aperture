"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ChevronDown, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseReviewCsv, type ParsedRow, type SkippedRow } from "./csv";
import type { Phase } from "./drop-zone";
import { readWorkbook, type SheetResult } from "./spreadsheet";

// Matches the server's per-import limit; Finnhub calls queue behind a shared rate limit, so big files are slower, not refused.
const MAX_POSITIONS = 50;
const MAX_BYTES = 5 * 1024 * 1024;

const EXAMPLE = "Symbol,Quantity\nVOO,75\nQQQ,60\nNVDA,110\nAAPL,50\n";

export type CsvFile = { name: string; rows: ParsedRow[]; skipped: SkippedRow[] };

const formatShares = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

function isCsv(f: File) {
  return /\.(csv|txt|xlsx|xls)$/i.test(f.name) || f.type === "text/csv" || f.type === "text/plain";
}

// CSV import: drop or pick a broker export. Parsed in the browser; only ticker, shares and value are sent for pricing.
export function CsvZone({ phase, file, onRows }: { phase: Phase; file: CsvFile | null; onRows: (file: CsvFile) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [sheets, setSheets] = useState<SheetResult[]>([]);
  const [workbookName, setWorkbookName] = useState("");
  const [reading, setReading] = useState(false);
  const idle = phase === "idle";

  async function read(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!isCsv(f)) return setError("Choose a CSV, XLSX or XLS brokerage export.");
    if (f.size > MAX_BYTES) return setError("Choose a file of 5MB or less.");
    setSheets([]);
    setReading(true);
    try {
      if (/\.xlsx?$/i.test(f.name)) {
        const found = await readWorkbook(await f.arrayBuffer(), true);
        setWorkbookName(f.name);
        if (found.length > 1) { setSheets(found); return; }
        if (!found.length) throw new Error("No visible worksheet found.");
        accept(f.name, found[0].result);
      } else accept(f.name, parseReviewCsv(await f.text()));
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read this spreadsheet. Export the positions as CSV."); }
    finally { setReading(false); }
  }

  function accept(name: string, parsed: SheetResult["result"]) {
    if (parsed.error) return setError(parsed.error);
    if (parsed.skipped.some(row => row.reason === "No share count or value")) return setError("Some positions have no share count or value. Correct those rows and upload again; nothing was imported.");
    if (parsed.rows.length > MAX_POSITIONS) {
      return setError(`This file has ${parsed.rows.length} positions; this version supports ${MAX_POSITIONS}. Use a smaller account export; nothing was imported.`);
    }
    setSheets([]);
    onRows({ name, rows: parsed.rows, skipped: parsed.skipped });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (idle) read(e.dataTransfer.files[0]);
  }

  const example = `data:text/csv;charset=utf-8,${encodeURIComponent(EXAMPLE)}`;

  return (
    <div
      onDragEnter={(e) => idle && (e.preventDefault(), setDragOver(true))}
      onDragOver={(e) => idle && e.preventDefault()}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border-[1.5px] bg-surface-1 transition-[border-color,background-color] duration-150 ease-out",
        file && !idle ? "border-solid border-border-strong" : "border-dashed border-border-strong",
        dragOver && "border-accent bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-1))]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        tabIndex={-1}
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          read(f);
        }}
      />

      {idle || !file ? (
        <div className="relative flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Choose a CSV or Excel export of your brokerage positions"
            disabled={reading}
            className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          />
          <div className="pointer-events-none relative flex max-w-[380px] flex-col items-center px-6 text-center">
            <FileSpreadsheet aria-hidden className="size-7 text-text-muted" strokeWidth={1.5} />
            <p className="mt-4 text-[16px] font-medium text-text">{reading ? "Reading spreadsheet…" : "Drop your CSV or Excel file here"}</p>
            <p className="mt-1 text-[13px] text-text-muted">or click to choose a file</p>
            <p className="mt-5 text-[13px] leading-5 text-text-muted">
              Works with Fidelity, Schwab and Vanguard exports, or any file with a <span className="text-text">Symbol</span> column and{" "}
              <span className="text-text">Quantity</span> or <span className="text-text">Market Value</span>. Cash and options are skipped.
            </p>
            <a
              href={example}
              download="aperture-example.csv"
              className="pointer-events-auto mt-5 text-[13px] font-medium text-text underline underline-offset-4 hover:text-accent"
            >
              Download an example file
            </a>
            {sheets.length > 1 && <div className="pointer-events-auto mt-4 space-y-2 text-left"><p className="text-[13px]">Choose the positions sheet. Sheets are not combined automatically.</p>{sheets.map(sheet => <button key={sheet.name} onClick={() => accept(`${workbookName} · ${sheet.name}`, sheet.result)} className="block w-full border border-border px-3 py-2 text-[13px]">{sheet.name} · {sheet.result.rows.length} positions</button>)}</div>}
            {error ? (
              <p role="alert" className="mt-5 flex items-start gap-2 text-left text-[13px] text-text">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-sev-medium" />
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-5">
          <p className="flex items-center gap-2 text-[14px] font-medium text-text">
            <FileSpreadsheet aria-hidden className="size-4 text-text-muted" />
            <span className="truncate">{file.name}</span>
          </p>
          <p className="mt-1 text-[13px] text-text-muted">
            {file.rows.length} {file.rows.length === 1 ? "position" : "positions"} read
            {file.skipped.length > 0 ? ` · ${file.skipped.length} rows skipped` : ""}
          </p>
          <ul className="mt-4 max-h-[300px] overflow-y-auto border-t border-border text-[14px]">
            {file.rows.map((r) => (
              <li key={r.ticker} className="flex h-9 items-center justify-between border-b border-border">
                <span className="font-medium text-text">{r.ticker}</span>
                <span className="text-text-muted tabular-nums">
                  {r.shares !== null ? `${formatShares(r.shares)} shares` : `$${r.marketValue?.toLocaleString("en-US")} value`}
                </span>
              </li>
            ))}
          </ul>
          {file.skipped.length > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowSkipped((v) => !v)}
                aria-expanded={showSkipped}
                className="inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-text"
              >
                Skipped rows
                <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", showSkipped && "rotate-180")} />
              </button>
              {showSkipped ? (
                <ul className="mt-2 flex flex-col gap-1 text-[12px] text-text-muted transition-[opacity,translate] duration-200 ease-out starting:-translate-y-1 starting:opacity-0">
                  {file.skipped.map((s) => (
                    <li key={s.line} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-text-subtle">Line {s.line}</span>
                      <span className="min-w-0 flex-1 truncate">{s.text}</span>
                      <span className="shrink-0">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
