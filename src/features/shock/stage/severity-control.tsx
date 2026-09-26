"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { ShockScenario } from "@/types/demo";

// Local slider styling (the shared shadcn Slider can't be restyled without editing it).
export function SeverityControl({
  scenario,
  severity,
  onChange,
}: {
  scenario: ShockScenario;
  severity: number;
  onChange: (v: number) => void;
}) {
  const { minSeverity: min, maxSeverity: max, baseSeverity: base } = scenario;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const ticks = [min, base, max];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <p className="shrink-0 text-[14px] text-text-muted sm:w-[250px]" id="severity-label">
        <span className="font-medium text-text tabular-nums">{severity}%</span> {scenario.severityLabel}
      </p>
      <div className="min-w-0 flex-1 pb-4">
        <SliderPrimitive.Root
          value={severity}
          min={min}
          max={max}
          step={1}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
          aria-labelledby="severity-label"
          className="w-full"
        >
          <SliderPrimitive.Control className="relative flex h-5 w-full touch-none items-center select-none">
            <SliderPrimitive.Track className="relative h-1 w-full rounded-full bg-surface-3">
              <SliderPrimitive.Indicator className="h-full rounded-full bg-accent" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="block size-4 rounded-full bg-white shadow-[0_0_0_2px_var(--accent),0_2px_6px_rgba(0,0,0,0.4)] transition-[box-shadow] duration-150 outline-none after:absolute after:-inset-2 focus-visible:shadow-[0_0_0_2px_var(--accent),0_0_0_6px_color-mix(in_srgb,var(--accent)_30%,transparent)]" />
          </SliderPrimitive.Control>
        </SliderPrimitive.Root>
        <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-text-subtle tabular-nums">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute"
              style={{
                left: pos(t),
                transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {t}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
