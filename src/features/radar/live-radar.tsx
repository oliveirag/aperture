"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CircleCheck, LoaderCircle, RotateCcw } from "lucide-react";
import { formatSourceDate } from "@/components/shared/source-drawer";
import { TickerMark } from "@/components/shared/ticker-mark";
import type { Severity } from "@/data/radar";
import { useLevel, type Level } from "@/lib/level";
import type { ImportedHolding } from "@/lib/portfolio-store";
import type { RadarFiling } from "@/lib/radar/types";
import type { XrayModel } from "@/lib/xray/types";
import { CoverageRail } from "./coverage-rail";
import { RadarHeader } from "./header";
import { coveredCompanies, highExposure, liveHeadline, sortCards, toCard, type Covered } from "./live-model";
import { RadarCard } from "./radar-card";
import { SeverityFilter, type FilterValue } from "./severity-filter";
import { useLiveRadar, type LiveEntry } from "./use-live-radar";

function formatChecked(iso: string | null) {
  if (!iso) return "not yet";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Pending({ company, message }: { company: Covered; message: string }) {
  return (
    <article aria-busy="true" className="flex items-center gap-3 bg-surface-1 px-5 py-5">
      <TickerMark ticker={company.ticker} color={company.color} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-text">{company.name}</p>
        <p className="flex items-center gap-2 text-[13px] text-text-muted">
          <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin text-accent" />
          <span className="truncate">{message}…</span>
        </p>
      </div>
    </article>
  );
}

function Failed({ company, error, onRetry }: { company: Covered; error: string; onRetry: () => void }) {
  return (
    <article className="flex flex-wrap items-center gap-3 bg-surface-1 px-5 py-5">
      <TickerMark ticker={company.ticker} color={company.color} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-text">{company.name}</p>
        <p className="flex items-start gap-2 text-[13px] text-text-muted">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-sev-medium" />
          {error}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-8 items-center gap-2 border border-border-strong px-3 text-[13px] font-medium text-text transition-[background-color,transform] duration-150 ease-out hover:bg-surface-2 active:scale-[0.97]"
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Try again
      </button>
    </article>
  );
}

// A filing that was compared and had nothing material to report.
function Quiet({ company, filing }: { company: Covered; filing: RadarFiling }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 text-[13px]">
      <CircleCheck aria-hidden className="size-4 shrink-0 text-text-subtle" />
      <span className="min-w-0 flex-1 text-text-muted">
        <span className="font-medium text-text">{company.name}</span> · no material risk changes in its {filing.filingType} filed{" "}
        {formatSourceDate(filing.filedAt)}
      </span>
      <a
        href={filing.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1 font-medium text-text-muted transition-colors duration-150 hover:text-text"
      >
        SEC.gov
        <ArrowUpRight aria-hidden className="size-3.5" />
      </a>
    </li>
  );
}

function defaultExpanded(level: Level, ids: string[]) {
  if (level === "advanced") return ids;
  if (level === "intermediate") return ids.slice(0, 1);
  return [];
}

// Filing Radar for an imported or practice portfolio: real SEC filings, compared by Gemini, quotes verified server-side.
export function LiveRadar({ model, holdings }: { model: XrayModel; holdings: ImportedHolding[] }) {
  const level = useLevel((s) => s.level);
  const entries = useLiveRadar((s) => s.entries);
  const load = useLiveRadar((s) => s.load);
  const covered = useMemo(() => coveredCompanies(model, holdings), [model, holdings]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [toggled, setToggled] = useState<{ level: Level; ids: string[] } | null>(null);
  const [rechecked, setRechecked] = useState(false);

  const tickers = useMemo(() => covered.map((c) => c.ticker), [covered]);
  useEffect(() => {
    load(tickers);
  }, [tickers, load]);

  const rows = covered.map((company) => ({ company, entry: entries[company.ticker] as LiveEntry | undefined }));
  const shownFiling = (e: LiveEntry | undefined) => (e?.status === "ready" ? e.filing : e?.status === "loading" ? e.previous : undefined);

  const allCards = sortCards(
    rows.flatMap(({ company, entry }) => {
      const filing = shownFiling(entry);
      return filing && filing.severity ? [{ ...toCard(filing, company), refreshing: entry?.status === "loading" }] : [];
    }),
  );
  const quiet = rows.flatMap(({ company, entry }) => {
    const filing = shownFiling(entry);
    return filing && !filing.severity ? [{ company, filing }] : [];
  });
  const pending = rows.filter(({ entry }) => (!entry || entry.status === "loading") && !shownFiling(entry));
  const failed = rows.flatMap(({ company, entry }) => (entry?.status === "error" ? [{ company, error: entry.error }] : []));
  const unsupported = rows.flatMap(({ company, entry }) => (entry?.status === "unsupported" ? [{ company, reason: entry.reason }] : []));
  const checking = rows.some(({ entry }) => !entry || entry.status === "loading");
  const filingsReviewed = allCards.length + quiet.length;

  // Beginners see high and medium only.
  const pool = allCards.filter((c) => level !== "beginner" || c.severity !== "low");
  const counts: Partial<Record<Severity, number>> = {};
  for (const c of pool) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  const activeFilter: FilterValue = filter !== "all" && !counts[filter] ? "all" : filter;
  const cards = pool.filter((c) => activeFilter === "all" || c.severity === activeFilter);
  const options: { value: FilterValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: pool.length },
    ...(["high", "medium", "low"] as const)
      .filter((s) => counts[s])
      .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] ?? 0 })),
  ];

  const expandedIds = toggled?.level === level ? toggled.ids : defaultExpanded(level, pool.map((c) => c.id));
  const toggle = (id: string) =>
    setToggled({ level, ids: expandedIds.includes(id) ? expandedIds.filter((x) => x !== id) : [...expandedIds, id] });

  const lastChecked = rows.reduce<string | null>((acc, { entry }) => {
    const at = shownFiling(entry)?.checkedAt;
    return at && (!acc || at > acc) ? at : acc;
  }, null);
  const headline = liveHeadline(allCards, filingsReviewed, checking)[level];

  if (covered.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <RadarHeader headline="Filing Radar covers companies, not funds." />
        <p className="max-w-[60ch] border border-border bg-surface-1 px-5 py-4 text-[15px] leading-6 text-text-muted">
          Your portfolio is all funds we can&apos;t see inside, so there are no company filings to compare. Add a stock, or a fund
          with published holdings, and Radar will read its companies&apos; latest 10-K and 10-Q.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <RadarHeader headline={headline} />

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,760px)_280px] xl:justify-between">
        <section aria-label="Filing changes" className="flex min-w-0 flex-col gap-4">
          {pool.length > 0 ? <SeverityFilter options={options} value={activeFilter} onChange={setFilter} /> : null}

          <div className="flex flex-col gap-4">
            {cards.map((card, i) => (
              <RadarCard
                key={card.id}
                card={card}
                index={i}
                expanded={expandedIds.includes(card.id)}
                onToggle={() => toggle(card.id)}
                onRefresh={() => load([card.ticker], { fresh: true })}
                refreshing={card.refreshing}
              />
            ))}
            <div role="status" aria-live="polite" className="flex flex-col gap-4">
              {pending.map(({ company, entry }) => (
                <Pending key={company.ticker} company={company} message={entry?.status === "loading" ? entry.message : "Waiting for SEC EDGAR"} />
              ))}
            </div>
            {failed.map(({ company, error }) => (
              <Failed key={company.ticker} company={company} error={error} onRetry={() => load([company.ticker])} />
            ))}
          </div>

          {quiet.length > 0 ? (
            <ul aria-label="Filings without material changes" className="divide-y divide-border bg-surface-1">
              {quiet.map(({ company, filing }) => (
                <Quiet key={company.ticker} company={company} filing={filing} />
              ))}
            </ul>
          ) : null}
        </section>

        <CoverageRail
          counts={counts}
          filings={filingsReviewed}
          checking={checking}
          checked={rechecked}
          onRecheck={() => {
            setRechecked(true);
            load(tickers, { fresh: true });
          }}
          highExposure={highExposure(allCards)}
          lastChecked={formatChecked(lastChecked)}
          checkedMessage="Checked SEC EDGAR for newer filings."
        >
          {unsupported.length > 0 ? (
            <div className="text-[12px] leading-5 text-text-subtle">
              <p className="font-medium text-text-muted">Not covered</p>
              <ul className="mt-1 flex flex-col gap-1">
                {unsupported.map(({ company, reason }) => (
                  <li key={company.ticker}>
                    <span className="text-text-muted">{company.ticker}</span> · {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CoverageRail>
      </div>
    </div>
  );
}
