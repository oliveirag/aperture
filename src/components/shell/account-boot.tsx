"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloudUpload, X } from "lucide-react";
import { startAccount, useAccount } from "@/lib/account";
import { usePortfolio } from "@/lib/portfolio-store";

// Starts account sync once per page load and shows the "save this portfolio?" offer after sign-in.
export function AccountBoot() {
  const offerSave = useAccount((s) => s.offerSave);
  const saveCurrent = useAccount((s) => s.saveCurrent);
  const dismissOffer = useAccount((s) => s.dismissOffer);
  const replaces = useAccount((s) => s.offerReplaces);
  const kind = usePortfolio((s) => s.kind);
  const count = usePortfolio((s) => s.imported?.length ?? 0);

  useEffect(() => startAccount(), []);

  return (
    <AnimatePresence>
      {offerSave && count > 0 ? (
        <motion.div
          role="dialog"
          aria-labelledby="save-offer-title"
          initial={{ opacity: 0, transform: "translateY(8px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="fixed right-4 bottom-4 z-50 w-[min(380px,calc(100vw-2rem))] border border-border-strong bg-bg p-5 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
        >
          <div className="flex items-start gap-3">
            <CloudUpload aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p id="save-offer-title" className="text-[15px] font-medium text-text">
                Save this {kind === "practice" ? "practice " : ""}portfolio to your account?
              </p>
              <p className="mt-1 text-[13px] leading-5 text-text-muted">
                Its {count} {count === 1 ? "position" : "positions"} will be here next time you sign in, on any device.
                {replaces ? ` This replaces the ${kind === "practice" ? "practice" : "imported"} portfolio already saved in your account.` : ""}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveCurrent()}
                  className="inline-flex h-9 items-center bg-text px-4 text-[14px] font-medium text-bg transition-[background-color,transform] duration-150 hover:bg-text/85 active:scale-[0.97]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={dismissOffer}
                  className="inline-flex h-9 items-center border border-border-strong px-4 text-[14px] text-text transition-colors duration-150 hover:bg-surface-1"
                >
                  Not now
                </button>
              </div>
            </div>
            <button type="button" onClick={dismissOffer} aria-label="Dismiss" className="text-text-muted hover:text-text">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
