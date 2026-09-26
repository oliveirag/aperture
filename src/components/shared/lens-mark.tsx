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

// Boxed serif wordmark: a filled block on light surfaces, a hairline frame on black bands.
export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "display inline-flex items-center border border-text bg-text leading-none text-bg in-[.theme-dark]:bg-transparent in-[.theme-dark]:text-text",
        size === "md" ? "h-[52px] px-3 pt-1 text-[30px]" : "h-9 px-2 pt-0.5 text-[20px]",
        className,
      )}
    >
      Lookthrough
    </span>
  );
}
