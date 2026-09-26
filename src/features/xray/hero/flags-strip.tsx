import { AlertTriangle } from "lucide-react";
import { FLAGS } from "@/data/xray";
import { formatPct } from "@/lib/format";

export function FlagsStrip() {
  return (
    <ul aria-label="Concentration flags" className="flex flex-wrap gap-2">
      {FLAGS.map((f) => (
        <li
          key={f.id}
          className="inline-flex h-8 items-center gap-2 border border-border bg-surface-1 px-3 text-[13px]"
        >
          <AlertTriangle aria-hidden className="size-3.5 text-sev-medium" />
          <span className="font-medium text-text">
            {f.label} <span className="tabular-nums">{formatPct(f.weight)}</span>
          </span>
          <span className="text-text-subtle tabular-nums">&gt; {formatPct(f.threshold, 0)}</span>
        </li>
      ))}
    </ul>
  );
}
