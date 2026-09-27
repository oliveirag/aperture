import Link from "next/link";
import { CircleArrow } from "@/components/shared/circle-arrow";
import { Reveal } from "@/components/shared/reveal";
import { NAV_ITEMS } from "@/components/shell/nav-items";

const BLURBS: Record<string, string> = {
  "/xray": "Every company your money reaches, and how it gets there.",
  "/shock": "A market shock traced through what you own, with sources.",
  "/radar": "New and changed risks in the filings you're exposed to.",
  "/ic": "The evidence for and against, before you add a position.",
};

// Black two-up band: the argument on the left, the four tools as hairline rows in a raised panel on the right.
export function Pillars() {
  return (
    <section aria-label="What Aperture does" className="theme-dark py-28 lg:py-36">
      <div className="bx-container grid gap-16 lg:grid-cols-2 lg:gap-24">
        <Reveal>
          <p className="eyebrow">Four questions</p>
          <h2 className="display mt-10 max-w-[14ch] text-[44px] leading-[1.2] text-text sm:text-[52px]">
            Institutional rigor for an individual portfolio
          </h2>
          <p className="mt-10 max-w-[42ch] pl-0 text-[18px] leading-[1.6] font-light text-text sm:pl-10">
            The questions an investment committee asks before it commits capital, answered for the seven positions you
            already hold.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <ul className="bg-surface-1 px-8 py-6 sm:px-16 sm:py-10">
            {NAV_ITEMS.map(({ href, label }) => (
              <li key={href} className="border-b border-border-strong last:border-b-0">
                <Link href={href} className="group flex items-center justify-between gap-8 py-8">
                  <span>
                    <span className="block text-[20px] font-normal text-text">
                      <span className="link-underline pb-0.5">{label}</span>
                    </span>
                    <span className="mt-2 block text-[15px] leading-6 text-text-muted">{BLURBS[href]}</span>
                  </span>
                  <CircleArrow size={32} className="text-text" />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
