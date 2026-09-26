import { cn } from "@/lib/utils";

const SIZES = {
  24: "size-6 text-[8.5px]",
  32: "size-8 text-[10px]",
  40: "size-10 text-[11.5px]",
} as const;

// Local monogram tile in the company's color. No logos, no network.
export function TickerMark({
  ticker,
  color = "#8fa3bf",
  size = 32,
  className,
}: {
  ticker: string;
  color?: string;
  size?: 24 | 32 | 40;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border font-medium tracking-[-0.03em] tabular-nums select-none",
        SIZES[size],
      )}
      // Monochrome hairline monogram: the editorial palette allows no brand fills. The company color survives
      // only as a 2px rule on the left edge.
      style={{
        color: "var(--text)",
        borderColor: "var(--border-strong)",
        boxShadow: `inset 2px 0 0 ${color}`,
      }}
    >
      <span className={className}>{ticker.replace(".", "").slice(0, 4)}</span>
    </span>
  );
}
