import { HOLDINGS } from "@/data/portfolio";
import { ETF_LOOKTHROUGH, OVERLAPS } from "@/data/xray";
import { formatPct } from "@/lib/format";
import { DetailCard } from "./card";

const [VOO_QQQ, VOO_KRE, QQQ_KRE] = OVERLAPS;
const QQQ_COUNT = ETF_LOOKTHROUGH.find((e) => e.ticker === "QQQ")!.holdingsCount;
const valueOf = (t: string) => HOLDINGS.find((h) => h.ticker === t)!.value;

// Radius ∝ sqrt(value). DISTANCE was solved numerically so the lens is ≈ 43% of the QQQ circle's area.
const R_VOO = 80;
const R_QQQ = R_VOO * Math.sqrt(valueOf("QQQ") / valueOf("VOO"));
const DISTANCE = 77;
const CY = 92;
const CX_VOO = 150 - DISTANCE / 2 - (R_VOO - R_QQQ) / 2;
const CX_QQQ = CX_VOO + DISTANCE;

export function OverlapVenn() {
  return (
    <DetailCard
      title="ETF overlap"
      headline={`${VOO_QQQ.a} and ${VOO_QQQ.b} overlap ${formatPct(VOO_QQQ.overlap, 0)}`}
      className="lg:col-span-5"
    >
      <p className="mt-1 text-[14px] text-text-muted">
        {VOO_QQQ.sharedCompanies} of QQQ&apos;s {QQQ_COUNT} companies are also in VOO.
      </p>
      <div className="mt-4 flex items-center gap-6">
        <p className="text-[32px] leading-none font-semibold tracking-[-0.02em] text-text tabular-nums">
          {formatPct(VOO_QQQ.overlap, 0)}
        </p>
        <svg viewBox="0 0 300 184" className="h-auto w-full max-w-[300px] min-w-0" role="img" aria-label="VOO and QQQ overlap diagram">
          <defs>
            <clipPath id="venn-voo">
              <circle cx={CX_VOO} cy={CY} r={R_VOO} />
            </clipPath>
          </defs>
          <circle
            cx={CX_VOO}
            cy={CY}
            r={R_VOO}
            strokeWidth={1.5}
            style={{ fill: "color-mix(in srgb, var(--chart-2) 12%, transparent)", stroke: "var(--chart-2)" }}
          />
          <circle
            cx={CX_QQQ}
            cy={CY}
            r={R_QQQ}
            strokeWidth={1.5}
            style={{ fill: "color-mix(in srgb, var(--chart-3) 12%, transparent)", stroke: "var(--chart-3)" }}
          />
          <circle
            cx={CX_QQQ}
            cy={CY}
            r={R_QQQ}
            clipPath="url(#venn-voo)"
            style={{ fill: "color-mix(in srgb, var(--accent) 25%, transparent)" }}
          />
          <text x={CX_VOO - R_VOO / 2} y={CY + 4} textAnchor="middle" className="fill-text text-[13px] font-semibold">
            VOO
          </text>
          <text x={CX_QQQ + R_QQQ / 2} y={CY + 4} textAnchor="middle" className="fill-text text-[13px] font-semibold">
            QQQ
          </text>
        </svg>
      </div>
      <ul className="mt-4 flex flex-col text-[13px] text-text-muted">
        <li className="flex h-8 items-center justify-between border-t border-border">
          <span>
            {VOO_KRE.a} ∩ {VOO_KRE.b}
          </span>
          <span className="tabular-nums">
            {formatPct(VOO_KRE.overlap, 0)} · {VOO_KRE.sharedCompanies} shared
          </span>
        </li>
        <li className="flex h-8 items-center justify-between border-t border-border">
          <span>
            {QQQ_KRE.a} ∩ {QQQ_KRE.b}
          </span>
          <span className="tabular-nums">{formatPct(QQQ_KRE.overlap, 0)}</span>
        </li>
      </ul>
    </DetailCard>
  );
}
