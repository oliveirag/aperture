"use client";

import type { ReactNode, Ref } from "react";
import { motion } from "motion/react";
import { ShowMore } from "@/components/shared/disclosure";
import { SourceChip } from "@/components/shared/source-chip";
import { formatSourceDate } from "@/components/shared/source-drawer";
import { GLOSSARY } from "@/data/glossary";
import type { MemoPoint } from "@/data/ic-room";
import { useDisclosure } from "@/lib/experience/disclosure";
import { usePolicy } from "@/lib/experience/store";
import { cn } from "@/lib/utils";
import { STATUS } from "./assumption-card";
import { ideaKey, useChecklist } from "./checklist";
import { EASE_OUT, useAnimated } from "./enter";
import { FactRef, factPayload } from "./fact-ref";
import { FitTable } from "./fit-table";
import { useIcData } from "./run-data";

const KEY_TERMS = ["thesis", "investment committee", "concentration"] as const;

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-medium tracking-[0.04em] text-text-subtle uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Points({ points }: { points: readonly MemoPoint[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {points.map((p) => (
        <li key={p.text} className="flex gap-2.5 text-[15px] leading-6 text-text">
          <span aria-hidden className="mt-[11px] size-1 shrink-0 rounded-full bg-text-subtle" />
          <span>
            {p.text}
            {p.refs.map((r) => (
              <span key={r} className="ml-1.5">
                <FactRef id={r} />
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Bull or bear points: the level sets how many start visible; the rest are one tap away with a count.
function Side({ id, title, points, shown }: { id: string; title: string; points: readonly MemoPoint[]; shown: number | "all" }) {
  const [all, setAll] = useDisclosure(`ic-${id}`, "collapsed");
  const initial = shown === "all" ? points.length : Math.min(shown, points.length);
  const visible = all ? points : points.slice(0, initial);
  const hidden = points.length - initial;
  return (
    <Section title={title}>
      <Points points={visible} />
      {hidden > 0 ? <ShowMore open={all} onToggle={() => setAll(!all)} more={`Show ${hidden} more`} className="self-start" /> : null}
    </Section>
  );
}

function Toggle({ id, label, fallback, children }: { id: string; label: string; fallback: "open" | "collapsed"; children: ReactNode }) {
  const [open, setOpen] = useDisclosure(id, fallback);
  return (
    <div className="flex flex-col gap-3">
      <ShowMore open={open} onToggle={() => setOpen(!open)} more={`Show ${label.toLowerCase()}`} less={`Hide ${label.toLowerCase()}`} className="self-start" />
      {open ? children : null}
    </div>
  );
}

// The payoff: a one-page investment committee memo. The level sets which parts start open; the stance, summary,
// every key risk, the portfolio fit and the sources are shown at every level.
export function MemoCard({ ref }: { ref?: Ref<HTMLElement> }) {
  const policy = usePolicy();
  const level = policy.level;
  const motionOn = useAnimated();
  const data = useIcData();
  const { ticker, date, memo, assumptions, facts, thesis } = data;
  const idea = ideaKey(ticker.ticker, thesis);
  const checked = useChecklist((s) => s.checked[idea]);
  const toggle = useChecklist((s) => s.toggle);
  const [checklistOpen, setChecklist] = useDisclosure("ic-checklist", policy.ic.checklist);
  const templated = memo.summarySource?.[level] === "template";

  return (
    // scroll-mt-30 leaves room for the top bar plus the 24px the memo is still rising when it scrolls into view.
    <motion.article
      ref={ref}
      aria-label="Investment committee memo"
      initial={motionOn ? { opacity: 0, transform: "translateY(24px)" } : false}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="relative w-full max-w-[760px] scroll-mt-30 rounded-2xl border border-border bg-surface-2 p-6 sm:p-8"
    >
      <span aria-hidden className="absolute inset-x-8 top-0 h-px bg-accent/60" />
      {motionOn ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl border border-accent/60 shadow-[0_0_32px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
        />
      ) : null}

      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[12px] font-medium tracking-[0.04em] text-text-subtle uppercase">Chair</p>
          <h2 className="mt-1 text-[20px] leading-7 font-medium tracking-[-0.01em] text-text">
            Investment Committee Memo · {ticker.ticker} · {formatSourceDate(date)}
          </h2>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center self-start border border-accent/70 px-3 text-[13px] font-medium text-accent">
          {memo.stance}
        </span>
      </header>

      <div className="flex flex-col gap-8 pt-6">
        <Section title="Summary">
          <p key={level} className="text-[15px] leading-6 text-pretty text-text animate-in fade-in duration-200">
            {memo.summary[level]}
          </p>
          {templated ? (
            <p className="text-[12px] text-text-subtle">
              Built from the memo&apos;s cited claims: the written summary for this level didn&apos;t pass our check against the evidence.
            </p>
          ) : null}
          <p className="text-[14px] leading-[22px] text-text-muted">{memo.chairNote}</p>
        </Section>

        <Toggle id="ic-key-terms" label="Key terms" fallback={policy.ic.keyTerms}>
          <aside aria-label="Key terms" className="bg-surface-1 p-4">
            <dl className="flex flex-col gap-2.5 text-[14px] leading-[22px]">
              {KEY_TERMS.map((term) => (
                <div key={term}>
                  <dt className="inline font-medium text-text capitalize">{term}. </dt>
                  <dd className="inline text-text-muted">{GLOSSARY[term]}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </Toggle>

        {assumptions.length > 0 ? (
          <Section
            title="Research checklist: what must be true"
            action={
              <ShowMore
                open={checklistOpen}
                onToggle={() => setChecklist(!checklistOpen)}
                more={`Show ${assumptions.length} items`}
                less="Collapse"
              />
            }
          >
            {checklistOpen ? (
              <>
                <ul className="flex flex-col gap-2">
                  {assumptions.map((a) => {
                    const { icon: Icon, label, tone } = STATUS[a.status];
                    const box = `${idea}:${a.id}`;
                    return (
                      <li key={a.id} className="flex items-start gap-2.5 text-[15px] leading-6 text-text">
                        <input
                          id={box}
                          type="checkbox"
                          checked={checked?.[a.id] ?? false}
                          onChange={() => toggle(idea, a.id)}
                          className="mt-1.5 size-4 shrink-0 accent-accent"
                        />
                        <label htmlFor={box} className="flex items-start gap-2">
                          <Icon className={cn("mt-1 size-4 shrink-0", tone)} aria-label={label} />
                          <span>
                            {a.text} <span className="text-[13px] text-text-subtle">{label}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[12px] text-text-subtle">Tick an item once you&apos;ve checked it yourself. Saved on this device for this ticker and thesis.</p>
              </>
            ) : (
              <p className="text-[14px] text-text-muted">
                {assumptions.length} things must be true for this thesis: {assumptions.filter((a) => a.status === "supported").length} supported,{" "}
                {assumptions.filter((a) => a.status === "contested").length} contested, {assumptions.filter((a) => a.status === "unresolved").length} unresolved.
              </p>
            )}
          </Section>
        ) : null}

        <div className="grid gap-8 md:grid-cols-2">
          <Side id="bull" title="Bull case" points={memo.bull} shown={policy.ic.pointsShown} />
          <Side id="bear" title="Bear case" points={memo.bear} shown={policy.ic.pointsShown} />
          <Section title="Key risks">
            {memo.keyRisks.length ? <Points points={memo.keyRisks} /> : <p className="text-[14px] text-text-muted">No key risk was supported by a cited source.</p>}
          </Section>
          <Section title="What to watch">
            {memo.watch.length ? <Points points={memo.watch} /> : <p className="text-[14px] text-text-muted">No watch item was supported by a cited source.</p>}
          </Section>
        </div>

        <Section title="Portfolio fit">
          <FitTable />
        </Section>

        <Section title="Sources">
          <div className="flex flex-wrap gap-2">
            {facts.map((f) => (
              <SourceChip key={f.id} payload={factPayload(facts, f.id)!} label={`${f.id} · ${f.title}`} />
            ))}
          </div>
        </Section>

        <Toggle id="ic-audit" label="Evidence audit" fallback={policy.ic.audit}>
          <Section title="Evidence audit">
            <p className="text-[13px] text-text-muted">
              Compare each argument with its underlying evidence. Citations identify the input; the bull and bear interpretations remain analysis.
            </p>
            {memo.claims?.length ? (
              <ul className="flex flex-col gap-2 text-[14px]">
                {memo.claims.map((c) => (
                  <li key={c.id}>
                    <span className="font-mono text-[12px] text-text-subtle">{c.id}</span> <span className="text-text-muted">[{c.kind}{c.material ? ", material" : ""}]</span> {c.text}
                    {c.refs.map((r) => (
                      <span key={r} className="ml-1.5">
                        <FactRef id={r} />
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
            {facts.map((f) => (
              <details key={f.id} className="border-t border-border pt-3">
                <summary className="cursor-pointer text-[14px]">
                  {f.id} · {f.title}
                </summary>
                <p className="mt-2 text-[14px] leading-6">{f.excerpt}</p>
                {f.section ? <p className="mt-1 text-[12px] text-text-subtle">{f.section}</p> : null}
                <a href={f.url} target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">
                  Open original source
                </a>
              </details>
            ))}
          </Section>
        </Toggle>

        <Toggle id="ic-record" label="Run record" fallback={policy.ic.record}>
          <Section title="Run record">
            {data.runId ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
                <dt className="text-text-subtle">Run</dt>
                <dd className="font-mono text-text">{data.runId}</dd>
                <dt className="text-text-subtle">Inputs</dt>
                <dd className="text-text">
                  {ticker.ticker} · ${data.amount.toLocaleString("en-US")} hypothetical · facts gathered {date}
                </dd>
                <dt className="text-text-subtle">Facts</dt>
                <dd className="text-text">{facts.length} sources (F1–F{facts.length})</dd>
                <dt className="text-text-subtle">Models</dt>
                <dd className="text-text">
                  {Object.entries(data.models ?? {})
                    .filter(([, m]) => m)
                    .map(([step, m]) => `${step}: ${m}`)
                    .join(" · ") || "Not recorded"}
                </dd>
                <dt className="text-text-subtle">Summaries</dt>
                <dd className="text-text">
                  {memo.summarySource
                    ? Object.entries(memo.summarySource)
                        .map(([l, s]) => `${l}: ${s === "model" ? "written by the chair" : "built from cited claims"}`)
                        .join(" · ")
                    : "Not recorded"}
                </dd>
              </dl>
            ) : (
              <p className="text-[13px] text-text-muted">This is the labeled illustrative replay, not a live run, so it has no run record.</p>
            )}
            <p className="text-[12px] text-text-subtle">
              An identical run (same ticker, thesis, amount and positions) on the same day replays this record. Runs are kept for a day.
            </p>
          </Section>
        </Toggle>
      </div>

      <footer className="mt-8 border-t border-border pt-4 text-[12px] text-text-subtle">Educational tool. Not investment advice.</footer>
    </motion.article>
  );
}
