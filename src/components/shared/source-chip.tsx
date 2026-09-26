"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSourceDrawer, type SourceDrawerPayload } from "./source-drawer";

function truncate(text: string, max = 28) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function SourceChip({
  payload,
  label,
  className,
}: {
  payload: SourceDrawerPayload;
  label?: string;
  className?: string;
}) {
  const open = useSourceDrawer((s) => s.open);
  const text = label ?? `${payload.source.docType} · ${payload.source.issuer}`;

  return (
    <button
      type="button"
      onClick={() => open(payload)}
      title={payload.source.title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 border border-border bg-surface-2 px-2.5 text-[12px] font-medium whitespace-nowrap text-text-muted",
        "transition-[border-color,color,transform] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97]",
        className,
      )}
    >
      <FileText className="size-3 shrink-0" aria-hidden />
      {truncate(text)}
    </button>
  );
}
