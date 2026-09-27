"use client";

import { useId, type ReactNode } from "react";
import { BookOpen, Calculator, ChevronDown } from "lucide-react";
import { useDisclosure } from "@/lib/experience/disclosure";
import type { Disclosure } from "@/lib/experience/policy";
import { usePolicy } from "@/lib/experience/store";
import { cn } from "@/lib/utils";

const TOGGLE =
  "inline-flex min-h-8 items-center gap-1.5 text-[13px] font-medium text-text-muted transition-colors duration-150 hover:text-text focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

// "Show 7 more companies": a collapsed item always says what it holds and how many.
export function ShowMore({ open, onToggle, more, less = "Show less", controls, className }: {
  open: boolean;
  onToggle: () => void;
  more: string;
  less?: string;
  controls?: string;
  className?: string;
}) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className={cn(TOGGLE, className)}>
      {open ? less : more}
      <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
    </button>
  );
}

// A whole section that starts open or collapsed by level. Collapsed, it keeps its title and a one-line summary, so
// nothing disappears; the user's choice sticks for this portfolio across level changes.
export function DisclosureSection({ id, title, summary, fallback, className, children }: {
  id: string;
  title: string;
  summary: ReactNode;
  fallback: Disclosure;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useDisclosure(id, fallback);
  if (open) return <>{children}</>;
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-wrap items-center justify-between gap-3 bg-surface-1 px-8 py-5 sm:px-10", className)}>
      <div className="min-w-0">
        <h3 className="eyebrow">{title}</h3>
        <p className="mt-2 text-[14px] text-text-muted">{summary}</p>
      </div>
      <ShowMore open={false} onToggle={() => setOpen(true)} more={`Show ${title.toLowerCase()}`} />
    </section>
  );
}

// "Explain" and "Show calculation" for one section. Available at every level; the level only sets which starts open.
export function SectionControls({ id, explain, calculation, className }: {
  id: string;
  explain?: ReactNode;
  calculation?: ReactNode;
  className?: string;
}) {
  const policy = usePolicy();
  const [explainOpen, setExplain] = useDisclosure(`${id}:explain`, policy.explain);
  const [calcOpen, setCalc] = useDisclosure(`${id}:calculation`, policy.calculation);
  const explainId = useId();
  const calcId = useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {explain ? (
          <button type="button" aria-expanded={explainOpen} aria-controls={explainId} onClick={() => setExplain(!explainOpen)} className={TOGGLE}>
            <BookOpen aria-hidden className="size-3.5" />
            {explainOpen ? "Hide explanation" : "What does this mean?"}
          </button>
        ) : null}
        {calculation ? (
          <button type="button" aria-expanded={calcOpen} aria-controls={calcId} onClick={() => setCalc(!calcOpen)} className={TOGGLE}>
            <Calculator aria-hidden className="size-3.5" />
            {calcOpen ? "Hide calculation" : "Show calculation"}
          </button>
        ) : null}
      </div>
      {explain && explainOpen ? (
        <div id={explainId} className="max-w-[72ch] text-[15px] leading-6 text-text-muted">
          {explain}
        </div>
      ) : null}
      {calculation && calcOpen ? (
        <div id={calcId} className="max-w-[80ch] border-l-2 border-border-strong pl-4 text-[13px] leading-6 text-text-muted">
          {calculation}
        </div>
      ) : null}
    </div>
  );
}
