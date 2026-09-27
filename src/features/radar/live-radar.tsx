"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CircleCheck, LoaderCircle, RotateCcw } from "lucide-react";
import { formatSourceDate } from "@/components/shared/source-drawer";
import { TickerMark } from "@/components/shared/ticker-mark";
import { ShowMore } from "@/components/shared/disclosure";
import { useDisclosure } from "@/lib/experience/disclosure";
import { isNewFiling, positionsKey, useLastSeen } from "@/lib/experience/last-seen";
import type { Level } from "@/lib/experience/policy";
import { usePolicy } from "@/lib/experience/store";
import { usePortfolio, type ImportedHolding } from "@/lib/portfolio-store";
import type { RadarFiling } from "@/lib/radar/types";
import type { XrayModel } from "@/lib/xray/types";
import { CoverageRail } from "./coverage-rail";
import { RadarHeader } from "./header";
import { coveredCompanies, highExposure, liveHeadline, MAX_COVERED, sortCards, toCard, uncoveredCompanies, type Covered } from "./live-model";
import { RadarCard } from "./radar-card";
import { SeverityFilter, type FilterValue } from "./severity-filter";
import { feedView } from "./view";
import { useLiveRadar, type LiveEntry } from "./use-live-radar";

const filingId = (f: RadarFiling) => `${f.filingType}:${f.filedAt}`;

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
        className="inline-flex h-8 items-center gap-2 border border-border-strong px-3 text-[13px] font-medium text-text transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-surface-2 active:scale-[0.97]"
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
        <span className="font-medium text-text">{company.name}</span> · {filing.dropped ? "comparison incomplete; proposed quotes could not be verified" : "no verified material changes found in the reviewed text"} · {filing.filingType} filed{" "}
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

// Filing Radar for an imported or practice portfolio: real SEC filings, compared by Gemini (or sentence by sentence
// when Gemini is unavailable), quotes verified server-side.
export function LiveRadar({ model, holdings }: { model: XrayModel; holdings: ImportedHolding[] }) {
  const policy = usePolicy();
  const level = policy.level;
  const entries = useLiveRadar((s) => s.entries);
  const load = useLiveRadar((s) => s.load);
  const covered = useMemo(() => coveredCompanies(model, holdings), [model, holdings]);
  const uncovered = useMemo(() => uncoveredCompanies(model, holdings), [model, holdings]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [toggled, setToggled] = useState<{ level: Level; ids: string[] } | null>(null);
  const [showLow, setShowLow] = useDisclosure("radar-low", policy.radar.lowSeverity);
  const [rechecked, setRechecked] = useState(false);
  const seenKey = positionsKey(usePortfolio((s) => s.imported));
  const seen = useLastSeen((s) => s.portfolios[seenKey]);
  const markReviewed = useLastSeen((s) => s.markReviewed);
  const noteFiling = useLastSeen((s) => s.noteFiling);

  const tickers = useMemo(() => covered.map((c) => c.ticker), [covered]);
  useEffect(() => {
    load(tickers);
  }, [tickers, load]);

  const rows = covered.map((company) => ({ company, entry: entries[company.ticker] as LiveEntry | undefined }));
  const shownFiling = (e: LiveEntry | undefined) => (e?.status === "ready" ? e.filing : e?.status === "loading" ? e.previous : undefined);

  // The first filing seen for each company is the baseline for "new since your last visit".
  useEffect(() => {
    for (const [ticker, e] of Object.entries(entries)) if (e.status === "ready") noteFiling(seenKey, ticker, filingId(e.filing));
  }, [entries, seenKey, noteFiling]);

  const allCards = sortCards(
    rows.flatMap(({ company, entry }) => {
      const filing = shownFiling(entry);
      return filing && filing.severity
        ? [{ ...toCard(filing, company), refreshing: entry?.status === "loading", isNew: isNewFiling(seen, filing.ticker, filingId(filing)), filingKey: filingId(filing) }]
        : [];
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

  // Counts cover every filing; a level can only fold lower-severity cards behind a counted row.
  const feed = feedView(allCards, policy, showLow || filter === "low");
  const counts = feed.counts;
  const activeFilter: FilterValue = filter !== "all" && !counts[filter] ? "all" : filter;
  const cards = feed.visible.filter((c) => activeFilter === "all" || c.severity === activeFilter);
  const options: { value: FilterValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: allCards.length },
    ...(["high", "medium", "low"] as const)
      .filter((s) => counts[s])
      .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] ?? 0 })),
  ];

  const expandedIds = toggled?.level === level ? toggled.ids : feed.expanded;
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
          {allCards.length > 0 ? <SeverityFilter options={options} value={activeFilter} onChange={setFilter} /> : null}

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
                isNew={card.isNew && policy.radar.changes === "open"}
                onReviewed={() => markReviewed(seenKey, card.ticker, card.filingKey)}
              />
            ))}
            {feed.collapsed.length > 0 && activeFilter === "all" ? (
              <div className="flex items-center justify-between gap-3 bg-surface-1 px-5 py-4 text-[14px] text-text-muted">
                <span>
                  {feed.collapsed.length} lower-severity {feed.collapsed.length === 1 ? "change" : "changes"} ({feed.collapsed.map((c) => c.company).join(", ")})
                </span>
                <ShowMore open={false} onToggle={() => setShowLow(true)} more="Show" />
              </div>
            ) : null}
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
          {unsupported.length > 0 || uncovered.length > 0 ? (
            <div className="text-[12px] leading-5 text-text-subtle">
              <p className="font-medium text-text-muted">Not covered</p>
              <ul className="mt-1 flex flex-col gap-1">
                {unsupported.map(({ company, reason }) => (
                  <li key={company.ticker}>
                    <span className="text-text-muted">{company.ticker}</span> · {reason}
                  </li>
                ))}
                {uncovered.length > 0 ? (
                  <li>
                    <span className="text-text-muted">{uncovered.map((c) => c.ticker).join(", ")}</span> · beyond the {MAX_COVERED} largest companies Radar reads
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </CoverageRail>
      </div>
    </div>
  );
}
