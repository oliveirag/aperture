"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import type { ScenarioId } from "@/types/demo";
import { matchScenario } from "./match-scenario";

const SUGGESTIONS = ["Commercial real estate falls 20%", "Big tech cuts AI spending 30%"];

// Free-text entry, keyword matched locally. No match changes nothing and says what is modeled.
export function ShockInput({ onRun }: { onRun: (id: ScenarioId, severity: number) => void }) {
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(false);

  function submit(value: string) {
    if (!value.trim()) return;
    const hit = matchScenario(value);
    if (!hit) {
      setMiss(true);
      return;
    }
    setMiss(false);
    onRun(hit.id, hit.severity);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(text);
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 @[700px]:flex-row @[700px]:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="shock-input" className="sr-only">
            Describe a shock
          </label>
          <input
            id="shock-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMiss(false);
            }}
            placeholder="Describe a shock…"
            autoComplete="off"
            aria-describedby={miss ? "shock-input-miss" : undefined}
            className="h-10 w-full rounded-full border border-border bg-surface-1 pr-11 pl-4 text-[14px] text-text transition-[border-color] duration-150 outline-none placeholder:text-text-subtle hover:border-border-strong focus-visible:border-accent/60"
          />
          <button
            type="submit"
            aria-label="Run shock"
            disabled={!text.trim()}
            className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-accent text-bg transition-[opacity,transform] duration-150 ease-out active:scale-[0.94] disabled:opacity-30"
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s);
                submit(s);
              }}
              className="inline-flex h-7 items-center rounded-full border border-border px-3 text-[12px] text-text-muted transition-[border-color,color,transform] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97]"
            >
              {s}
            </button>
          ))}
        </div>
      </form>
      {miss ? (
        <p id="shock-input-miss" role="status" className="mt-2 pl-4 text-[13px] text-text-muted">
          Not modeled yet. Try commercial real estate or AI data-center spending.
        </p>
      ) : null}
    </div>
  );
}
