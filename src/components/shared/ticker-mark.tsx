"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useMarket } from "@/lib/market";
import { cn } from "@/lib/utils";

const SIZES = {
  24: "size-6 rounded-[6px] text-[8.5px]",
  32: "size-8 rounded-[8px] text-[10px]",
  40: "size-10 rounded-[10px] text-[11.5px]",
} as const;

// Monogram tile in the company's color. The Finnhub logo fades in over it once loaded; ETFs and offline stay on the monogram.
export function TickerMark({
  ticker,
  color = "#8fa3bf",
  size = 32,
  className,
}: {
  ticker: string;
  color?: string;
  size?: 24 | 32 | 40;
  className?: string;
}) {
  const logo = useMarket((s) => s.profiles[ticker]?.logo);
  const requestProfile = useMarket((s) => s.requestProfile);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => requestProfile(ticker), [ticker, requestProfile]);

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden border font-semibold tracking-[0.01em] tabular-nums select-none",
        SIZES[size],
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      <span className={className}>{ticker.replace(".", "").slice(0, 4)}</span>
      {logo && !failed ? (
        <Image
          src={logo}
          alt=""
          width={size * 2}
          height={size * 2}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 size-full bg-white object-contain p-[12%] transition-opacity duration-200 ease-out",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </span>
  );
}
