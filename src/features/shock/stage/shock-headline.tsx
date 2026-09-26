"use client";

import { Fragment } from "react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { formatSignedPct, formatSignedUSD } from "@/lib/format";

// Renders a scenario headline template, with {pct} and {usd} as counting numbers in --negative.
export function ShockHeadline({
  template,
  severity,
  pct,
  dollar,
  countMs,
}: {
  template: string;
  severity: number;
  pct: number;
  dollar: number;
  countMs: number;
}) {
  const parts = template.split(/(\{\w+\})/);
  return (
    <>
      {parts.map((part, i) => {
        if (part === "{severity}") return <Fragment key={i}>{severity}</Fragment>;
        if (part === "{pct}")
          return (
            <AnimatedNumber key={i} value={pct} from={0} duration={countMs} format={(v) => formatSignedPct(v)} className="text-negative" />
          );
        if (part === "{usd}")
          return (
            <AnimatedNumber key={i} value={dollar} from={0} duration={countMs} format={(v) => formatSignedUSD(v)} className="text-negative" />
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
