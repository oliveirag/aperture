import { Reveal } from "@/components/shared/reveal";
import { HOLDINGS, PORTFOLIO_TOTAL, weightOf } from "@/data/portfolio";
import { EXPOSURES, POSITIONS_COUNT, UNDERLYING_COMPANIES, exposureTotal } from "@/data/xray";
import { formatPct, formatUSD } from "@/lib/format";

const NVIDIA = EXPOSURES.find((e) => e.ticker === "NVDA")!;
const NVIDIA_WEIGHT = weightOf(exposureTotal(NVIDIA));
const NVIDIA_PCT = formatPct(NVIDIA_WEIGHT);
const DIRECT_PCT = formatPct(weightOf(HOLDINGS.find((h) => h.ticker === "NVDA")!.value));

// White "about" band: centered eyebrow and title, then a text column beside one large serif figure.
export function Scale() {
  return (
    <section className="border-t border-border bg-bg py-28 lg:py-36">
      <div className="bx-container">
        <Reveal className="text-center">
          <p className="eyebrow eyebrow-center">An example portfolio</p>
          <h2 className="display mt-10 text-[44px] leading-[1.15] text-text sm:text-[56px]">Several funds can own the same companies</h2>
        </Reveal>

        <div className="mx-auto mt-20 grid max-w-[1104px] gap-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-32">
          <Reveal>
            <h3 className="text-[24px] leading-[1.5] font-light text-text">Hidden concentration</h3>
            <p className="mt-6 text-[18px] leading-[1.6] font-light text-text">
              {POSITIONS_COUNT} positions worth {formatUSD(PORTFOLIO_TOTAL)} reach {UNDERLYING_COMPANIES} companies once
              the ETFs are opened up. NVIDIA is {DIRECT_PCT} of the account on paper and {NVIDIA_PCT} once you count what
              VOO and QQQ already hold.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="display text-[88px] leading-none text-text tabular-nums">
              {NVIDIA_PCT}
            </p>
            <p className="mt-4 text-[18px] font-normal text-text">NVIDIA look-through exposure</p>
            <p className="mt-6 text-[14px] leading-[1.6] text-text-muted">
              Figures from a curated example portfolio.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
