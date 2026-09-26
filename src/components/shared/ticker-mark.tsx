import { cn } from "@/lib/utils";

const SIZES = {
  24: "size-6 rounded-[6px] text-[8.5px]",
  32: "size-8 rounded-[8px] text-[10px]",
  40: "size-10 rounded-[10px] text-[11.5px]",
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
        "inline-flex shrink-0 items-center justify-center border font-semibold tracking-[0.01em] tabular-nums select-none",
        SIZES[size],
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      <span className={className}>{ticker.replace(".", "").slice(0, 4)}</span>
    </span>
  );
}
