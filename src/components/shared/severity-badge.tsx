import { cn } from "@/lib/utils";

const STYLES = {
  high: { label: "High", color: "var(--sev-high)" },
  medium: { label: "Medium", color: "var(--sev-medium)" },
  low: { label: "Low", color: "var(--sev-low)" },
} as const;

export function SeverityBadge({
  severity,
  className,
}: {
  severity: "high" | "medium" | "low";
  className?: string;
}) {
  const s = STYLES[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", className)} style={{ color: s.color }}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}
