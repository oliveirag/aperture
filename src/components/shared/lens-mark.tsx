import { cn } from "@/lib/utils";

// Two overlapping lenses: one position, seen through.
export function LensMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 shrink-0", className)}>
      <circle cx="6" cy="8" r="4.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="10" cy="8" r="4.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-text", className)}>
      <LensMark />
      Lookthrough
    </span>
  );
}
