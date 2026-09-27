import { formatPct } from "@/lib/format";
import type { XOverlap, XrayModel } from "@/lib/xray/types";
import { DetailCard } from "./card";

const R_A = 80;
const CY = 92;

// Area shared by two circles whose centers are d apart.
function lensArea(r1: number, r2: number, d: number) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 ** 2 * Math.acos((d ** 2 + r1 ** 2 - r2 ** 2) / (2 * d * r1));
  const b = r2 ** 2 * Math.acos((d ** 2 + r2 ** 2 - r1 ** 2) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a + b - c;
}

// Radius ∝ sqrt(value); the distance is solved so the lens is `overlap` of the smaller circle's area.
function geometry(o: XOverlap) {
  const rB = R_A * Math.sqrt(Math.min(1, o.bValue / Math.max(o.aValue, 1)));
  const target = o.overlap * Math.PI * rB ** 2;
  let lo = R_A - rB;
  let hi = R_A + rB;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lensArea(R_A, rB, mid) > target) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  const cxA = 150 - d / 2 - (R_A - rB) / 2;
  return { rB, cxA, cxB: cxA + d };
}

function Venn({ o }: { o: XOverlap }) {
  const { rB, cxA, cxB } = geometry(o);
  const id = `venn-${o.a}-${o.b}`;
  return (
    <svg viewBox="0 0 300 184" className="h-auto w-full max-w-[300px] min-w-0" role="img" aria-label={`${o.a} and ${o.b} overlap diagram`}>
      <defs>
        <clipPath id={id}>
          <circle cx={cxA} cy={CY} r={R_A} />
        </clipPath>
      </defs>
      <circle cx={cxA} cy={CY} r={R_A} strokeWidth={1.5} style={{ fill: "color-mix(in srgb, var(--chart-2) 12%, transparent)", stroke: "var(--chart-2)" }} />
      <circle cx={cxB} cy={CY} r={rB} strokeWidth={1.5} style={{ fill: "color-mix(in srgb, var(--chart-3) 12%, transparent)", stroke: "var(--chart-3)" }} />
      <circle cx={cxB} cy={CY} r={rB} clipPath={`url(#${id})`} style={{ fill: "color-mix(in srgb, var(--accent) 25%, transparent)" }} />
      <text x={cxA - R_A / 2} y={CY + 4} textAnchor="middle" className="fill-text text-[13px] font-medium">
        {o.a}
      </text>
      <text x={cxB + rB / 2} y={CY + 4} textAnchor="middle" className="fill-text text-[13px] font-medium">
        {o.b}
      </text>
    </svg>
  );
}

export function OverlapVenn({ model }: { model: XrayModel }) {
  const [top, ...rest] = model.overlaps;
  const span = "lg:col-span-12";

  if (!top) {
    return (
      <DetailCard title="ETF overlap" headline="No overlapping funds" className={span}>
        <p className="mt-1 text-[14px] text-text-muted">
          Overlap compares two ETFs by the weight of the companies they both hold. This portfolio has fewer than two ETFs we can see
          inside.
        </p>
      </DetailCard>
    );
  }

  return (
    <DetailCard title="ETF overlap" headline={`${top.a} and ${top.b} overlap ${formatPct(top.overlap, 0)}`} className={span}>
      <p className="mt-1 text-[14px] text-text-muted">
        {top.sharedCompanies} of {top.b}&apos;s {top.bCount} companies are also in {top.a}.
      </p>
      <div className="mt-4 flex items-center gap-6 lg:gap-12">
        <p className="display text-[48px] leading-none text-text tabular-nums">{formatPct(top.overlap, 0)}</p>
        <Venn o={top} />
      </div>
      {rest.length > 0 ? (
        <ul className="mt-4 flex flex-col text-[13px] text-text-muted">
          {rest.slice(0, 3).map((o) => (
            <li key={`${o.a}-${o.b}`} className="flex h-8 items-center justify-between border-t border-border">
              <span>
                {o.a} ∩ {o.b}
              </span>
              <span className="tabular-nums">
                {formatPct(o.overlap, 0)}
                {o.sharedCompanies > 0 ? ` · ${o.sharedCompanies} shared` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </DetailCard>
  );
}
