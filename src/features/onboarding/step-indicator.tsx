import { cn } from "@/lib/utils";

const STEPS = ["Experience", "Import", "X-Ray"];

// A real sequence, so numbers carry meaning here.
export function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Setup steps" className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const active = step === current;
        const done = step < current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            {i > 0 ? <span aria-hidden className="h-px w-4 bg-border-strong" /> : null}
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                active ? "bg-text text-bg" : done ? "bg-surface-3 text-text" : "border border-border-strong text-text-subtle",
              )}
            >
              {step}
            </span>
            <span className={cn("text-[13px]", active ? "text-text" : "hidden text-text-subtle sm:inline")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
