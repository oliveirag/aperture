"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUp, CircleStop, LoaderCircle, MessageCircleQuestion, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { RADAR_CARDS } from "@/data/radar";
import { DEMO_RUN } from "@/features/ic-room/run-data";
import { useIcMemos } from "@/features/ic-room/memos";
import { coveredCompanies, toCard } from "@/features/radar/live-model";
import { useLiveRadar } from "@/features/radar/use-live-radar";
import { useXray } from "@/features/xray/use-xray";
import { DISCLAIMER } from "@/lib/ask/prompt";
import { useLevel } from "@/lib/level";
import { usePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import { askContext, type AskMemo } from "./context";
import { useAsk, type AskMessage } from "./store";

const CHIPS = ["What's my biggest risk?", "How much of my money is in AI?", "What changed in Apple's latest filing?"];
const BEGINNER_CHIPS = ["What is an ETF?", "How do I research a stock before buying?"];

// The portfolio JSON for the active portfolio, built from what the pages already computed.
function useAskContext() {
  const xray = useXray();
  const imported = usePortfolio((s) => s.imported);
  const kind = usePortfolio((s) => s.kind);
  const entries = useLiveRadar((s) => s.entries);
  const memos = useIcMemos((s) => s.memos);
  return useMemo(() => {
    if (xray.status !== "ready") return null;
    const model = xray.model;
    const demo = !imported;
    const names = Object.fromEntries((imported ?? []).map((h) => [h.ticker, h.name]));
    const radar = demo
      ? RADAR_CARDS
      : coveredCompanies(model, imported).flatMap((c) => {
          const e = entries[c.ticker];
          return e?.status === "ready" && e.filing.severity ? [toCard(e.filing, c)] : [];
        });
    const demoMemo: AskMemo = { ticker: DEMO_RUN.ticker.ticker, date: DEMO_RUN.date, memo: DEMO_RUN.memo };
    return askContext({ kind: demo ? "demo" : kind, model, names, radar, memos: demo ? [demoMemo, ...memos] : memos });
  }, [xray, imported, kind, entries, memos]);
}

// Paragraphs and "- " lists; nothing else is rendered as markup.
function Answer({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={i} className="flex flex-col gap-1.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span aria-hidden className="mt-[10px] size-1 shrink-0 rounded-full bg-text-subtle" />
                  <span>{l.replace(/^\s*[-•*]\s+/, "").replace(/\*\*/g, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        const muted = block.trim() === DISCLAIMER;
        return (
          <p key={i} className={cn("whitespace-pre-line", muted && "text-[12px] text-text-subtle")}>
            {block.replace(/\*\*/g, "")}
          </p>
        );
      })}
    </div>
  );
}

function Message({ m, onNavigate }: { m: AskMessage; onNavigate: () => void }) {
  if (m.role === "user") {
    return <p className="ml-10 self-end bg-surface-3 px-4 py-2.5 text-[14px] leading-[22px] text-text">{m.text}</p>;
  }
  return (
    <div className="mr-6 flex flex-col gap-3 text-[14px] leading-[22px] text-text">
      {m.pending && !m.text ? (
        <p className="flex items-center gap-2 text-text-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin text-accent" />
          Reading your portfolio…
        </p>
      ) : m.error ? (
        <p role="alert" className="text-sev-medium">
          {m.text}
        </p>
      ) : (
        <Answer text={m.text} />
      )}
      {m.declined ? (
        <Link
          href="/ic"
          onClick={onNavigate}
          className="inline-flex h-8 w-fit items-center gap-2 border border-border-strong px-3 text-[13px] font-medium text-text transition-[color,background-color,border-color,scale] duration-150 hover:bg-surface-2 active:scale-[0.97]"
        >
          Open the IC Room
        </Link>
      ) : null}
    </div>
  );
}

// Slide-over chat about the active portfolio. Mounted once in the app shell; any page opens it with useAsk.
export function AskPanel() {
  const open = useAsk((s) => s.open);
  const setOpen = useAsk((s) => s.setOpen);
  const messages = useAsk((s) => s.messages);
  const busy = useAsk((s) => s.busy);
  const ask = useAsk((s) => s.ask);
  const stop = useAsk((s) => s.stop);
  const clear = useAsk((s) => s.clear);
  const level = useLevel((s) => s.level);
  const context = useAskContext();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const last = messages[messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, last?.text]);

  function send(question: string) {
    if (!question.trim() || busy || !context) return;
    setDraft("");
    ask(question, level, context);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  const chips = level === "beginner" ? [...CHIPS.slice(0, 2), ...BEGINNER_CHIPS] : CHIPS;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        initialFocus={inputRef}
        className="gap-0 border-border bg-surface-1 p-0 shadow-[0_0_0_1px_var(--border),-24px_0_64px_rgba(0,0,0,0.5)] duration-250 ease-drawer data-ending-style:duration-200 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
      >
        <div className="border-b border-border px-6 pt-6 pb-4 pr-12">
          <SheetTitle className="text-[18px] leading-6 font-medium tracking-[-0.01em] text-text">Ask about your portfolio</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-text-muted">
            Answers come from your X-Ray, Filing Radar and IC memos. {DISCLAIMER}
          </SheetDescription>
        </div>

        <div aria-live="polite" aria-busy={busy} className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-4">
              <MessageCircleQuestion aria-hidden className="size-5 text-text-muted" />
              <p className="text-[14px] leading-[22px] text-text-muted">Try one of these, or ask your own question.</p>
              <ul className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => send(c)}
                      disabled={!context}
                      className="inline-flex min-h-8 items-center border border-border px-3 py-1 text-left text-[13px] text-text-muted transition-[border-color,color,transform,translate,scale] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97] disabled:opacity-50"
                    >
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            messages.map((m) => <Message key={m.id} m={m} onNavigate={() => setOpen(false)} />)
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-border px-4 py-4">
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <div className="flex items-end gap-2 border border-border-strong bg-surface-2 p-2 focus-within:border-accent/60">
            <textarea
              id="ask-input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={2}
              placeholder={context ? "Ask about your holdings…" : "Loading your portfolio…"}
              className="min-h-10 flex-1 resize-none bg-transparent px-1 text-[14px] leading-[22px] text-text outline-none placeholder:text-text-subtle"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop answering"
                className="flex size-9 shrink-0 items-center justify-center text-text-muted transition-colors duration-150 hover:text-text"
              >
                <CircleStop aria-hidden className="size-5" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send question"
                disabled={!draft.trim() || !context}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-text text-text transition-[opacity,background-color,color,scale] duration-150 hover:bg-text active:scale-[0.95] hover:text-bg disabled:opacity-30"
              >
                <ArrowUp aria-hidden className="size-4" />
              </button>
            )}
          </div>
          {messages.length > 0 && !busy ? (
            <button
              type="button"
              onClick={clear}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-text-subtle transition-colors duration-150 hover:text-text"
            >
              <RotateCcw aria-hidden className="size-3" />
              New conversation
            </button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

// The masthead's entry point to Ask.
export function AskButton({ className }: { className?: string }) {
  const setOpen = useAsk((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex h-9 items-center gap-2 border border-border-strong px-3 text-[14px] font-light text-text transition-[color,background-color,border-color,scale] duration-150 hover:bg-surface-1 active:scale-[0.97]",
        className,
      )}
    >
      <MessageCircleQuestion aria-hidden className="size-4" />
      Ask
    </button>
  );
}
