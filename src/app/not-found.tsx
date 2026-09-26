import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/shared/lens-mark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1200px] flex-col px-6 sm:px-8">
      <header className="flex h-16 items-center">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
        <p className="mb-3 text-[13px] font-medium text-text-muted">404</p>
        <h1 className="max-w-[28ch] text-[40px] leading-[1.1] font-medium tracking-[-0.02em] text-balance text-text">
          This page isn&apos;t in the demo.
        </h1>
        <p className="mt-4 max-w-[48ch] text-base leading-6 text-pretty text-text-muted">
          The demo portfolio is still here. Pick up where you left off.
        </p>
        <Link
          href="/xray"
          className="group mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-text px-5 text-[15px] font-medium whitespace-nowrap text-bg transition-[transform,translate,scale,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-text/85 active:scale-[0.97]"
        >
          Back to X-Ray
          <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
        </Link>
      </div>
    </main>
  );
}
