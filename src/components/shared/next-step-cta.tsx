import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function NextStepCTA({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link
      href={href}
      className="group flex h-[72px] w-full items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 px-6 transition-[border-color,transform] duration-150 ease-out hover:border-border-strong active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-text">{label}</span>
        <span className="block truncate text-[13px] text-text-muted">{description}</span>
      </span>
      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 text-text-muted transition-[transform,color] duration-200 ease-out group-hover:translate-x-1 group-hover:text-text"
      />
    </Link>
  );
}
