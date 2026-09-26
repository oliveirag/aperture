import { LookthroughIllustration } from "./lookthrough-illustration";
import { TryDemoLink } from "./try-demo-link";

export function Hero() {
  return (
    <section className="grid items-center gap-12 pt-12 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_560px] lg:gap-16">
      <div>
        <p className="mb-6 text-[14px] text-text-muted">Built for the Blackstone challenge at ShellHacks 2026</p>
        <h1 className="text-[44px] leading-[1.04] font-semibold tracking-[-0.03em] text-balance text-text sm:text-[56px] lg:text-[64px]">
          See what you actually own.
        </h1>
        <p className="mt-6 max-w-[52ch] text-[18px] leading-7 text-pretty text-text-muted">
          Brokerages show you what you bought. Lookthrough shows what&apos;s inside it, what could hit it, what changed
          in the filings, and what to check before you add more.
        </p>
        <TryDemoLink className="mt-10" />
      </div>
      <LookthroughIllustration />
    </section>
  );
}
