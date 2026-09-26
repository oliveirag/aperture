"use client";

import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

// Any render error inside the shell lands here instead of a white screen.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
      <PageHeader headline="Something went sideways." subline="The demo hit an unexpected error. Reloading the page puts it back on track." />
      <button
        type="button"
        onClick={() => retry()}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-text px-5 text-[15px] font-medium text-bg transition-[transform,background-color] duration-150 ease-out outline-none hover:bg-text/85 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97]"
      >
        <RotateCcw aria-hidden className="size-4" />
        Reload this page
      </button>
    </div>
  );
}
