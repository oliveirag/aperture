"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, FlaskConical, LogIn, Sprout, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatSignedPct, formatSignedUSD, formatUSD } from "@/lib/format";
import { useAccount } from "@/lib/account";
import { usePortfolio } from "@/lib/portfolio-store";
import { SaveStatus } from "./account-button";
import { cn } from "@/lib/utils";
import type { usePortfolioValue } from "./use-portfolio-value";

type Value = ReturnType<typeof usePortfolioValue>;

const ITEM =
  "flex min-h-10 w-full cursor-default items-center gap-3 px-3 py-2 text-left text-[14px] text-text outline-none select-none data-[highlighted]:bg-surface-1";
const GROUP_LABEL = "px-3 pt-3 pb-1 text-[11px] font-normal tracking-[0.08em] text-text-subtle uppercase";

const kindLabel = (kind: "imported" | "practice") => (kind === "practice" ? "practice" : "imported");

// The masthead's portfolio readout doubles as the switcher: see which portfolio is active, import your own,
// build a practice one, or flip between yours and the demo without losing either.
export function PortfolioMenu({ value, align = "end" }: { value: Value; align?: "start" | "end" }) {
  const router = useRouter();
  const imported = usePortfolio((s) => s.imported);
  const kind = usePortfolio((s) => s.kind);
  const stashed = usePortfolio((s) => s.stashed);
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  const restoreStashed = usePortfolio((s) => s.restoreStashed);
  const accountStatus = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.signIn);
  const own = imported ? { count: imported.length, kind } : stashed ? { count: stashed.holdings.length, kind: stashed.kind } : null;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Portfolio: ${value.label}. Change portfolio`}
        title={value.asOf}
        className={cn(
          "group -mx-2 rounded-md px-2 py-1 leading-tight outline-none transition-colors duration-150 hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-surface-1",
          align === "end" ? "text-right" : "text-left",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-normal tracking-[0.08em] whitespace-nowrap text-text-muted uppercase",
            align === "end" && "justify-end",
          )}
        >
          {value.live ? <span aria-hidden className="size-1.5 rounded-full bg-positive" /> : null}
          {value.label}
          <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-data-[popup-open]:rotate-180" />
        </span>
        <span className="mt-0.5 block whitespace-nowrap tabular-nums">
          <span className="text-[17px] font-normal text-text">{formatUSD(value.total)}</span>
          <span className={cn("ml-2 hidden text-[13px] xl:inline", value.change < 0 ? "text-negative" : "text-positive")}>
            {formatSignedUSD(value.change)} ({formatSignedPct(value.pct, 2)})
          </span>
        </span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align={align} sideOffset={10} className="z-50">
          <Menu.Popup className="min-w-[288px] origin-[var(--transform-origin)] border border-border-strong bg-bg pb-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            <Menu.Group>
              <Menu.GroupLabel className={GROUP_LABEL}>Showing</Menu.GroupLabel>
              <Menu.Item className={ITEM} onClick={resetToDemo}>
                <FlaskConical aria-hidden className="size-4 text-text-muted" />
                <span className="flex-1">Demo portfolio</span>
                {!imported ? <Check aria-label="Active" className="size-4" /> : null}
              </Menu.Item>
              {own ? (
                <Menu.Item className={ITEM} onClick={restoreStashed}>
                  {own.kind === "practice" ? (
                    <Sprout aria-hidden className="size-4 text-text-muted" />
                  ) : (
                    <Upload aria-hidden className="size-4 text-text-muted" />
                  )}
                  <span className="flex-1">
                    Your {kindLabel(own.kind)} portfolio
                    <span className="ml-1.5 text-[12px] text-text-muted">
                      {own.count} {own.count === 1 ? "position" : "positions"}
                    </span>
                  </span>
                  {imported ? <Check aria-label="Active" className="size-4" /> : null}
                </Menu.Item>
              ) : null}
            </Menu.Group>

            <Menu.Separator className="my-2 h-px bg-border" />

            <Menu.Group>
              <Menu.GroupLabel className={GROUP_LABEL}>{own ? "Replace with" : "Use your own"}</Menu.GroupLabel>
              <Menu.Item className={ITEM} onClick={() => router.push("/import")}>
                <Upload aria-hidden className="size-4 text-text-muted" />
                <span className="flex-1">
                  Import a portfolio
                  <span className="block text-[12px] text-text-muted">Screenshot, CSV export or type it in</span>
                </span>
              </Menu.Item>
              <Menu.Item className={ITEM} onClick={() => router.push("/practice")}>
                <Sprout aria-hidden className="size-4 text-text-muted" />
                <span className="flex-1">
                  Build a practice portfolio
                  <span className="block text-[12px] text-text-muted">Pretend money, real prices</span>
                </span>
              </Menu.Item>
            </Menu.Group>

            {/* Accounts: where your own portfolio is kept. Nothing here when accounts aren't configured. */}
            {imported && accountStatus === "signed-in" ? (
              <>
                <Menu.Separator className="my-2 h-px bg-border" />
                <SaveStatus className="px-3 py-1" />
              </>
            ) : own && accountStatus === "signed-out" ? (
              <>
                <Menu.Separator className="my-2 h-px bg-border" />
                <Menu.Item className={ITEM} onClick={() => void signIn()}>
                  <LogIn aria-hidden className="size-4 text-text-muted" />
                  <span className="flex-1">
                    Sign in to keep it
                    <span className="block text-[12px] text-text-muted">Right now it only lives in this tab</span>
                  </span>
                </Menu.Item>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
