"use client";

import { Fragment, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { create } from "zustand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Source } from "@/types/demo";

export type SourceLike = Source;

export type SourceDrawerPayload = {
  source: SourceLike;
  meta?: { label: string; value: string }[];
  compare?: { prior: string; current: string; highlight?: string[] };
};

type SourceDrawerState = {
  payload: SourceDrawerPayload | null;
  open: (p: SourceDrawerPayload) => void;
  close: () => void;
};

export const useSourceDrawer = create<SourceDrawerState>()((set) => ({
  payload: null,
  open: (payload) => set({ payload }),
  close: () => set({ payload: null }),
}));

export function formatSourceDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

// Wraps every occurrence of each phrase in <mark>. Case-sensitive, longest phrase first.
export function highlightPhrases(text: string, phrases: string[] = []): ReactNode {
  const list = phrases.filter(Boolean).sort((a, b) => b.length - a.length);
  if (list.length === 0) return text;
  const escaped = list.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return parts.map((part, i) =>
    list.includes(part) ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[12px] font-medium text-text-subtle">{children}</p>;
}

// Mounted once in the root layout. Any feature opens it with useSourceDrawer.getState().open(payload).
export function SourceDrawer() {
  const payload = useSourceDrawer((s) => s.payload);
  const close = useSourceDrawer((s) => s.close);
  const source = payload?.source;

  return (
    <Sheet open={payload !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto border-border bg-surface-1 p-0 shadow-[0_0_0_1px_var(--border),-24px_0_64px_rgba(0,0,0,0.5)] duration-300 ease-drawer data-ending-style:duration-200 data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]"
      >
        {source ? (
          <div className="flex min-h-full flex-col">
            <div className="border-b border-border px-6 pt-6 pb-5 pr-12">
              <div className="mb-3 flex items-center gap-2 text-[12px] text-text-muted">
                <span className="rounded-md border border-border-strong px-1.5 py-0.5 font-medium text-text">
                  {source.docType}
                </span>
                <span className="tabular-nums">{formatSourceDate(source.date)}</span>
              </div>
              <SheetTitle className="text-[18px] leading-6 font-semibold tracking-[-0.01em] text-text">
                {source.title}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[13px] text-text-muted">
                {source.section ? `${source.issuer}, ${source.section}` : source.issuer}
              </SheetDescription>
            </div>

            <div className="flex flex-1 flex-col gap-6 px-6 py-6">
              {payload?.meta && payload.meta.length > 0 ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
                  {payload.meta.map((m) => (
                    <Fragment key={m.label}>
                      <dt className="text-text-subtle">{m.label}</dt>
                      <dd className="text-text tabular-nums">{m.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              ) : null}

              {/* With a compare, the latest wording is the excerpt; don't show it twice. */}
              {!payload?.compare ? (
                <section>
                  <Label>Excerpt</Label>
                  <blockquote className="border-l-2 border-accent pl-4 text-[15px] leading-6 text-text">
                    {highlightPhrases(source.excerpt, source.highlight ? [source.highlight] : [])}
                  </blockquote>
                </section>
              ) : null}

              {payload?.compare ? (
                <section className="flex flex-col gap-4">
                  <div>
                    <Label>Prior filing</Label>
                    <p className="rounded-lg bg-surface-2 p-4 text-[14px] leading-6 text-text-muted">
                      {payload.compare.prior}
                    </p>
                  </div>
                  <div>
                    <Label>Latest filing</Label>
                    <p className="rounded-lg border border-border-strong bg-surface-2 p-4 text-[14px] leading-6 text-text">
                      {highlightPhrases(payload.compare.current, payload.compare.highlight)}
                    </p>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="border-t border-border px-6 py-4">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-1 text-[13px] font-medium text-text-muted transition-colors duration-150 hover:text-text"
              >
                View source
                <ArrowUpRight className="size-3.5 transition-transform duration-150 ease-out group-hover:-translate-y-px group-hover:translate-x-px" />
              </a>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
