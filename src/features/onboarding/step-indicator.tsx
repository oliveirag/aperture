import { cn } from "@/lib/utils";

const STEPS = ["Experience", "Import", "X-Ray"];

// A real sequence, so numbers carry meaning here. Tracked numerals, the current step underlined.
// `steps` renames the labels (the practice path says "Practice" instead of "Import").
export function StepIndicator({ current, steps = STEPS }: { current: 1 | 2 | 3; steps?: string[] }) {
  return (
    <ol aria-label="Setup steps" className="flex items-center gap-4 sm:gap-8">
      {steps.map((label, i) => {
        const step = i + 1;
        const active = step === current;
        return (
          <li key={label} className="flex items-baseline gap-2" aria-current={active ? "step" : undefined}>
            <span className={cn("text-[12px] tracking-[0.08em] tabular-nums", active ? "text-text" : "text-text-subtle")}>
              {String(step).padStart(2, "0")}
            </span>
            <span
              className={cn(
                "pb-1 text-[15px]",
                active ? "border-b border-text font-normal text-text" : "hidden font-light text-text-subtle sm:inline",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
