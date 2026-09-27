"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import type { ScenarioId } from "@/types/demo";
import { matchScenario } from "./match-scenario";
import { runResearch } from "../research-store";

const SUGGESTIONS = ["What if Iran closes the Strait of Hormuz?", "What if Democrats win and tariffs go down?"];

export function ShockInput({ onRun }: { onRun?: (id: ScenarioId, severity: number) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(value: string) {
    if (!value.trim() || busy) return;
    setError("");
    const hit = matchScenario(value);
    if (hit && onRun) { onRun(hit.id, hit.severity); return; }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try { await runResearch(value, controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Research failed"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); void submit(text); }
  return <div className="space-y-3">
    <form onSubmit={onSubmit} className="relative">
      <label htmlFor="shock-input" className="sr-only">Describe a scenario</label>
      <input id="shock-input" value={text} maxLength={500} onChange={e => setText(e.target.value)} placeholder="What if… describe an event or economic change" disabled={busy} className="h-12 w-full border-b border-border-strong bg-surface-1 pr-12 pl-4 text-[16px] text-text outline-none focus-visible:border-text" />
      <button type="submit" aria-label="Research scenario" disabled={busy || !text.trim()} className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border border-text text-text disabled:opacity-30">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button>
    </form>
    <div className="flex flex-wrap gap-2">{SUGGESTIONS.map(s => <button key={s} disabled={busy} onClick={() => { setText(s); void submit(s); }} className="border border-border px-3 py-1 text-left text-[12px] text-text-muted hover:text-text disabled:opacity-40">{s}</button>)}</div>
    {busy && <p role="status" className="text-[13px] text-text-muted">Finding evidence and calculating the scenario…</p>}
    {error && <p role="alert" className="text-[13px] text-sev-medium">{error}</p>}
  </div>;
}
