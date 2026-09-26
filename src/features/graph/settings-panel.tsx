"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, RotateCcw, Search, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphUi, type GraphSettings } from "./settings";

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="border-t border-white/[0.06] first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 py-2 text-left text-[13px] font-medium text-[#dadada] transition-colors duration-150 hover:text-white"
      >
        <ChevronRight aria-hidden className={cn("size-3.5 text-[#8f8f8f] transition-transform duration-150", open && "rotate-90")} />
        {title}
      </button>
      {open ? <div className="flex flex-col gap-2.5 pb-3">{children}</div> : null}
    </div>
  );
}

function Toggle({ label, k }: { label: string; k: keyof GraphSettings }) {
  const value = useGraphUi((s) => s.settings[k]) as boolean;
  const set = useGraphUi((s) => s.set);
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px] text-[#bdbdbd]">
      {label}
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        onClick={() => set(k, !value as GraphSettings[typeof k])}
        className={cn(
          "relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-150",
          value ? "bg-[#a882ff]" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow transition-transform duration-150 ease-out",
            value && "translate-x-[14px]",
          )}
        />
      </button>
    </div>
  );
}

function Range({ label, k, min, max, step }: { label: string; k: keyof GraphSettings; min: number; max: number; step: number }) {
  const value = useGraphUi((s) => s.settings[k]) as number;
  const set = useGraphUi((s) => s.set);
  return (
    <label className="flex flex-col gap-1 text-[12.5px] text-[#bdbdbd]">
      <span className="flex justify-between">
        {label}
        <span className="font-mono text-[11px] text-[#8f8f8f] tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(k, Number(e.target.value) as GraphSettings[typeof k])}
        className="h-1 w-full cursor-pointer accent-[#a882ff]"
      />
    </label>
  );
}

const GROUPS = [
  { label: "Shock", color: "#ff3b30" },
  { label: "Channel", color: "#ffa24c" },
  { label: "Hit by the shock", color: "#ff7a45" },
  { label: "Not reached", color: "#8f8f8f" },
  { label: "Source note", color: "#a882ff" },
  { label: "Your holding (ring)", color: "#8FA3BF", ring: true },
];

// Obsidian's graph settings pane: a gear in the corner that opens Filters, Groups, Display and Forces.
export function SettingsPanel({ query, onQuery, onReplay }: { query: string; onQuery: (q: string) => void; onReplay: () => void }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState({ filters: true, groups: true, display: false, forces: false });
  const reset = useGraphUi((s) => s.reset);
  const toggle = (k: keyof typeof sections) => setSections((s) => ({ ...s, [k]: !s[k] }));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Graph settings"
        title="Graph settings"
        className="flex size-8 items-center justify-center border border-white/10 bg-[#262626]/90 text-[#8f8f8f] backdrop-blur transition-colors duration-150 hover:text-[#dadada]"
      >
        <Settings aria-hidden className="size-4" />
      </button>
    );
  }

  return (
    <div className="max-h-[calc(100%-24px)] w-[260px] overflow-y-auto border border-white/10 bg-[#262626]/95 px-3 pb-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur">
      <div className="flex items-center justify-end gap-1 pt-2">
        <button
          type="button"
          onClick={() => {
            reset();
            onReplay();
          }}
          aria-label="Restore defaults"
          title="Restore defaults"
          className="flex size-7 items-center justify-center text-[#8f8f8f] transition-colors duration-150 hover:text-[#dadada]"
        >
          <RotateCcw aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
          className="flex size-7 items-center justify-center text-[#8f8f8f] transition-colors duration-150 hover:text-[#dadada]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <Section title="Filters" open={sections.filters} onToggle={() => toggle("filters")}>
        <label className="flex items-center gap-2 border border-white/10 bg-[#1e1e1e] px-2 focus-within:border-[#a882ff]/60">
          <Search aria-hidden className="size-3.5 shrink-0 text-[#8f8f8f]" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search nodes…"
            className="h-7 min-w-0 flex-1 bg-transparent text-[12.5px] text-[#dadada] outline-none placeholder:text-[#5c5c5c]"
          />
        </label>
        <Toggle label="Source notes" k="showSources" />
        <Toggle label="Look-through context" k="showContext" />
        <Toggle label="Holdings not reached" k="showUnaffected" />
      </Section>

      <Section title="Groups" open={sections.groups} onToggle={() => toggle("groups")}>
        <ul className="flex flex-col gap-1.5">
          {GROUPS.map((g) => (
            <li key={g.label} className="flex items-center gap-2 text-[12.5px] text-[#bdbdbd]">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={g.ring ? { boxShadow: `0 0 0 1.5px ${g.color}`, background: "#8f8f8f" } : { background: g.color, boxShadow: `0 0 6px ${g.color}` }}
              />
              {g.label}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Display" open={sections.display} onToggle={() => toggle("display")}>
        <Toggle label="Arrows" k="arrows" />
        <Toggle label="Shock flow" k="flow" />
        <Range label="Text fade threshold" k="textFade" min={0.3} max={3} step={0.1} />
        <Range label="Node size" k="nodeSize" min={0.5} max={2} step={0.05} />
        <Range label="Link thickness" k="linkThickness" min={0.3} max={3} step={0.1} />
        <button
          type="button"
          onClick={onReplay}
          className="mt-1 h-8 w-full bg-[#a882ff] text-[12.5px] font-medium text-white transition-[background-color,transform,translate,scale] duration-150 hover:bg-[#9670f5] active:scale-[0.98]"
        >
          Animate
        </button>
      </Section>

      <Section title="Forces" open={sections.forces} onToggle={() => toggle("forces")}>
        <Range label="Center force" k="center" min={0} max={1} step={0.01} />
        <Range label="Repel force" k="repel" min={0} max={20} step={0.5} />
        <Range label="Link force" k="linkForce" min={0} max={1} step={0.01} />
        <Range label="Link distance" k="linkDistance" min={10} max={150} step={1} />
      </Section>
    </div>
  );
}
