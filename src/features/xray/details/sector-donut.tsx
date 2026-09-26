"use client";

import { useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Sector, type PieSectorShapeProps } from "recharts";
import { SECTOR_THRESHOLD, SECTORS } from "@/data/xray";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DetailCard } from "./card";

// Same order as SECTORS.
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-6)",
  "#7A7A82",
  "#4A4A52",
];
const DEFAULT = 0;

export function SectorDonut() {
  const [hovered, setHovered] = useState<number | null>(null);
  const slice = SECTORS[hovered ?? DEFAULT];

  function shape(props: PieSectorShapeProps) {
    const i = props.index;
    const lit = hovered === null || hovered === i;
    return (
      <Sector
        {...props}
        outerRadius={hovered === i ? Number(props.outerRadius) + 4 : props.outerRadius}
        stroke="none"
        style={{ fill: COLORS[i], opacity: lit ? 1 : 0.35, transition: "opacity 150ms ease-out", outline: "none" }}
      />
    );
  }

  return (
    <DetailCard title="Sectors" headline="Where your money sits by industry" className="lg:col-span-5">
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row lg:flex-col">
        <div className="relative h-[240px] w-[240px] shrink-0">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 240 }}>
            <PieChart>
              <Pie
                data={SECTORS}
                dataKey="weight"
                nameKey="sector"
                innerRadius="70%"
                outerRadius="94%"
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                rootTabIndex={-1}
                shape={shape}
                onMouseEnter={(_, i) => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="display text-[34px] leading-9 text-text tabular-nums">
              {formatPct(slice.weight)}
            </span>
            <span className="mt-0.5 max-w-[110px] text-[12px] leading-4 text-text-muted">{slice.sector}</span>
          </div>
        </div>
        <ul className="w-full min-w-0 flex-1" onMouseLeave={() => setHovered(null)}>
          {SECTORS.map((s, i) => (
            <li
              key={s.sector}
              onMouseEnter={() => setHovered(i)}
              className={cn(
                "flex h-7 cursor-default items-center gap-2.5 rounded-md px-2 text-[13px] transition-[background-color,opacity] duration-150",
                hovered === i && "bg-surface-2",
                hovered !== null && hovered !== i && "opacity-50",
              )}
            >
              <span aria-hidden className="size-2 shrink-0" style={{ backgroundColor: COLORS[i] }} />
              <span className="min-w-0 flex-1 truncate text-text">{s.sector}</span>
              {s.weight > SECTOR_THRESHOLD ? (
                <span className="text-[11px] font-medium whitespace-nowrap text-sev-medium">
                  Above {formatPct(SECTOR_THRESHOLD, 0)}
                </span>
              ) : null}
              <span className="w-11 text-right text-text-muted tabular-nums">{formatPct(s.weight)}</span>
            </li>
          ))}
        </ul>
      </div>
    </DetailCard>
  );
}
