import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { formatUSD } from "@/lib/format";

// Illustrative day moves for the fake app. Display only; nothing downstream reads them.
const DAY_CHANGE: Record<string, number> = {
  VOO: 0.0038,
  QQQ: 0.0062,
  NVDA: 0.0184,
  KRE: -0.0091,
  AAPL: 0.0027,
  BXP: -0.0112,
  MSFT: 0.0044,
};

function signedPct(f: number) {
  return `${f >= 0 ? "+" : "−"}${Math.abs(f * 100).toFixed(2)}%`;
}

// A generic brokerage positions screen, built in JSX so the demo needs no asset.
// `outlined` draws a faint accent box on each row. The drop zone times each box to the scan line
// by setting --tw-animation-delay on the [data-scan-outline] spans.
export function SampleBrokerageScreenshot({ outlined = false }: { outlined?: boolean }) {
  return (
    <div
      className="w-[340px] max-w-full overflow-hidden rounded-[12px] bg-[#FFFFFF] text-[14px] text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_32px_rgba(0,0,0,0.35)] select-none"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <div className="flex items-center justify-between px-4 pt-3 text-[11px] font-semibold text-[#111]">
        <span className="tabular-nums">9:41</span>
        <span aria-hidden className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-[2px] bg-[#111]" />
          <span className="h-2 w-4 rounded-[2px] border border-[#111]" />
        </span>
      </div>
      <div className="px-4 pt-3 pb-2">
        <div className="text-[20px] font-bold tracking-[-0.01em]">Positions</div>
        <div className="mt-1 text-[12px] text-[#6B6B6B]">Account value</div>
        <div className="text-[22px] font-semibold tracking-[-0.01em] tabular-nums">{formatUSD(PORTFOLIO_TOTAL, 2)}</div>
      </div>
      <div className="flex h-7 items-center justify-between border-t border-[#EEE] px-4 text-[11px] text-[#6B6B6B]">
        <span>Symbol</span>
        <span>Market value</span>
      </div>
      <ul>
        {HOLDINGS.map((h) => {
          const change = DAY_CHANGE[h.ticker] ?? 0;
          return (
            <li key={h.ticker} data-scan-row className="relative flex h-11 items-center justify-between border-t border-[#EEE] px-4">
              <div className="leading-tight">
                <div className="font-semibold">{h.ticker}</div>
                <div className="text-[11px] text-[#6B6B6B] tabular-nums">{h.shares} shares</div>
              </div>
              <div className="text-right leading-tight tabular-nums">
                <div className="font-medium">{formatUSD(h.value, 2)}</div>
                <div className={`text-[11px] ${change >= 0 ? "text-[#1A7F4B]" : "text-[#C23B3B]"}`}>{signedPct(change)}</div>
              </div>
              {outlined ? (
                <span
                  aria-hidden
                  data-scan-outline
                  className="pointer-events-none absolute inset-x-2 inset-y-1 animate-in rounded-[6px] border border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] duration-200 fade-in fill-mode-both"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="h-3 border-t border-[#EEE]" />
    </div>
  );
}
