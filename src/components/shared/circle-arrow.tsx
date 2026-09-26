import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The hairline circle with an arrow that ends every Blackstone call to action.
// Fills on hover of the nearest .group; the arrow nudges forward. Decorative only.
export function CircleArrow({ size = 40, className }: { size?: 32 | 40 | 56; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-current [transition:background-color_300ms_var(--ease-out),color_300ms_var(--ease-out),transform_120ms_var(--ease-out)] group-hover:bg-text group-hover:text-bg group-active:scale-[0.94]",
        className,
      )}
    >
      <ArrowRight
        strokeWidth={1.25}
        className={cn(
          "transition-transform duration-300 ease-out group-hover:translate-x-0.5",
          size === 56 ? "size-6" : size === 40 ? "size-[18px]" : "size-4",
        )}
      />
    </span>
  );
}
