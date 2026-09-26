import { MaskLine, Reveal } from "@/components/shared/reveal";
import { LookthroughIllustration } from "./lookthrough-illustration";
import { TryDemoLink } from "./try-demo-link";

// Black opening band: a two-line serif title with the second line stepped in, the promise on the right,
// then one wide media panel carrying the product's single idea.
export function Hero() {
  return (
    <section className="pt-16 pb-24 lg:pt-24">
      <div className="bx-container grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <h1 className="display text-[56px] leading-[1.02] text-text sm:text-[84px] lg:text-[104px]">
          <MaskLine>See what you</MaskLine>
          <MaskLine delay={0.12} className="pl-[12%]">
            actually own.
          </MaskLine>
        </h1>
        <Reveal delay={0.5} className="lg:pb-4">
          <p className="max-w-[30ch] text-[22px] leading-[1.5] font-light text-text sm:text-[24px]">
            Brokerages show you what you bought. Unfold shows what&apos;s inside it.
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.7} className="bx-container mt-20">
        <div className="bg-surface-1 px-6 py-12 sm:px-12 lg:px-20 lg:py-20">
          <LookthroughIllustration />
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <h2 className="display text-[36px] leading-[1.2] text-text sm:text-[40px]">One company, three doors in.</h2>
          <div>
            <p className="text-[20px] leading-[1.5] font-light text-text">
              NVIDIA looks like one holding. Through your ETFs it is three, and the largest single bet in the portfolio.
              Unfold shows what&apos;s inside, what could hit it, what changed in the filings, and what to check
              before you add more.
            </p>
            <TryDemoLink className="mt-10" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
