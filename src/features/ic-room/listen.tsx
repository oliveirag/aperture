"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Square } from "lucide-react";

export type Speaker = "bull" | "bear";
export type ListenState = {
  status: "idle" | "loading" | "playing" | "paused";
  speaker: Speaker | null;
  // Share of the current speaker's statement read so far, 0..1.
  progress: number;
  engine: "gemini" | "browser" | null;
  error: string | null;
};

const IDLE: ListenState = { status: "idle", speaker: null, progress: 0, engine: null, error: null };
const ORDER: Speaker[] = ["bull", "bear"];

// Audio per statement for this tab, so a replay doesn't call Gemini again.
const clips = new Map<string, Promise<string>>();

function clipFor(side: Speaker, text: string) {
  const key = `${side}:${text}`;
  let p = clips.get(key);
  if (!p) {
    p = fetch("/api/ic/listen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side, text }) }).then(async (res) => {
      if (!res.ok) throw new Error(`listen ${res.status}`);
      return URL.createObjectURL(await res.blob());
    });
    p.catch(() => clips.delete(key));
    clips.set(key, p);
  }
  return p;
}

// Two different system voices for the browser fallback: English first, the second distinct from the first.
function browserVoices(): [SpeechSynthesisVoice | undefined, SpeechSynthesisVoice | undefined] {
  const all = window.speechSynthesis.getVoices();
  const en = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length >= 2 ? en : all;
  return [pool[0], pool.find((v) => v.name !== pool[0]?.name)];
}

// Reads the bull statement, then the bear's, in two voices: Gemini TTS when it answers, the Web Speech API otherwise.
export function useListen(texts: Record<Speaker, string>) {
  const [state, setState] = useState<ListenState>(IDLE);
  const audio = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current++;
    audio.current?.pause();
    audio.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState(IDLE);
  }, []);

  // A new run (new statements) or leaving the page stops the reading.
  useEffect(() => () => stop(), [texts.bull, texts.bear, stop]);

  const playBrowser = useCallback(
    (id: number, from: number) => {
      if (!("speechSynthesis" in window)) {
        setState({ ...IDLE, error: "Listen isn't available in this browser." });
        return;
      }
      const [first, second] = browserVoices();
      const say = (i: number) => {
        if (run.current !== id || i >= ORDER.length) {
          if (run.current === id) setState(IDLE);
          return;
        }
        const side = ORDER[i];
        const text = texts[side];
        const u = new SpeechSynthesisUtterance(text);
        const voice = side === "bull" ? first : second;
        if (voice) u.voice = voice;
        // Same voice twice (only one installed): lower the bear's pitch so the two still sound different.
        u.pitch = side === "bear" && (!second || second === first) ? 0.7 : 1;
        u.rate = 1.02;
        u.onboundary = (e) => run.current === id && setState((s) => ({ ...s, progress: Math.min(1, e.charIndex / text.length) }));
        u.onend = () => say(i + 1);
        setState({ status: "playing", speaker: side, progress: 0, engine: "browser", error: null });
        window.speechSynthesis.speak(u);
      };
      say(from);
    },
    [texts],
  );

  const play = useCallback(async () => {
    if (state.status === "paused") {
      if (state.engine === "gemini") await audio.current?.play();
      else window.speechSynthesis.resume();
      setState((s) => ({ ...s, status: "playing" }));
      return;
    }
    stop();
    const id = ++run.current;
    setState({ ...IDLE, status: "loading" });
    let urls: string[];
    try {
      urls = await Promise.all(ORDER.map((side) => clipFor(side, texts[side])));
    } catch {
      if (run.current === id) playBrowser(id, 0);
      return;
    }
    const next = (i: number) => {
      if (run.current !== id || i >= ORDER.length) {
        if (run.current === id) setState(IDLE);
        return;
      }
      const el = new Audio(urls[i]);
      audio.current = el;
      el.ontimeupdate = () => run.current === id && el.duration > 0 && setState((s) => ({ ...s, progress: el.currentTime / el.duration }));
      el.onended = () => next(i + 1);
      setState({ status: "playing", speaker: ORDER[i], progress: 0, engine: "gemini", error: null });
      el.play().catch(() => run.current === id && playBrowser(id, i));
    };
    next(0);
  }, [state.status, state.engine, texts, stop, playBrowser]);

  const pause = useCallback(() => {
    if (state.engine === "gemini") audio.current?.pause();
    else window.speechSynthesis.pause();
    setState((s) => ({ ...s, status: "paused" }));
  }, [state.engine]);

  return { state, play, pause, stop };
}

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 border border-border-strong px-3 text-[13px] font-medium text-text transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-surface-2 active:scale-[0.97] disabled:opacity-60";

export function ListenControl({ listen }: { listen: ReturnType<typeof useListen> }) {
  const { state, play, pause, stop } = listen;
  const active = state.status !== "idle";
  const who = state.speaker === "bull" ? "Bull analyst" : state.speaker === "bear" ? "Bear analyst" : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state.status === "playing" ? (
        <button type="button" onClick={pause} className={BUTTON}>
          <Pause aria-hidden className="size-3.5" />
          Pause
        </button>
      ) : (
        <button type="button" onClick={play} disabled={state.status === "loading"} className={BUTTON}>
          {state.status === "paused" ? <Play aria-hidden className="size-3.5" /> : <Headphones aria-hidden className="size-3.5" />}
          {state.status === "paused" ? "Resume" : state.status === "loading" ? "Preparing voices…" : "Listen"}
        </button>
      )}
      {active ? (
        <button type="button" onClick={stop} aria-label="Stop listening" className={BUTTON}>
          <Square aria-hidden className="size-3.5" />
          Stop
        </button>
      ) : null}
      <span aria-live="polite" className="text-[12px] text-text-subtle">
        {state.error ?? (who ? `${state.status === "paused" ? "Paused" : "Reading"}: ${who} · ${state.engine === "gemini" ? "Gemini voices" : "browser voices"}` : "")}
      </span>
    </div>
  );
}
