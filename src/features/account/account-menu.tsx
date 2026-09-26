"use client";

import { useEffect } from "react";
import { Menu } from "@base-ui/react/menu";
import { Cloud, LogIn, LogOut, Save, Trash2, UserRound, X } from "lucide-react";
import { samePositions } from "@/lib/accounts";
import { useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import { startAccounts, useAccount } from "./store";

const ITEM =
  "flex min-h-10 w-full cursor-default items-center gap-3 px-3 py-2 text-left text-[14px] text-text outline-none select-none data-[highlighted]:bg-surface-1";
const GROUP_LABEL = "px-3 pt-3 pb-1 text-[11px] font-normal tracking-[0.08em] text-text-subtle uppercase";

// Mounted once in the root layout: starts Supabase auth (and finishes a Google redirect) on any page.
export function AccountSync() {
  useHydratePortfolio();
  useEffect(() => startAccounts(), []);
  return null;
}

// Masthead account control: "Sign in" with Google, or a menu of saved portfolios. Absent when accounts aren't configured.
export function AccountMenu({ className, align = "end" }: { className?: string; align?: "start" | "end" }) {
  const status = useAccount((s) => s.status);
  const email = useAccount((s) => s.email);
  const saved = useAccount((s) => s.saved);
  const offerSave = useAccount((s) => s.offerSave);
  const signIn = useAccount((s) => s.signIn);
  const signOut = useAccount((s) => s.signOut);
  const saveCurrent = useAccount((s) => s.saveCurrent);
  const open = useAccount((s) => s.open);
  const remove = useAccount((s) => s.remove);
  const imported = usePortfolio((s) => s.imported);

  if (status === "disabled" || status === "loading") return null;
  if (status === "signed-out") {
    return (
      <button
        type="button"
        onClick={signIn}
        className={cn(
          "inline-flex h-9 items-center gap-2 px-2 text-[14px] font-light text-text transition-colors duration-150 hover:bg-surface-1",
          className,
        )}
      >
        <LogIn aria-hidden className="size-4" />
        Sign in
      </button>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${email ?? "signed in"}`}
        className={cn(
          "relative inline-flex size-9 items-center justify-center rounded-full border border-border-strong text-text outline-none transition-colors duration-150 hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-surface-1",
          className,
        )}
      >
        <UserRound aria-hidden className="size-4" />
        {offerSave ? <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent" /> : null}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align={align} sideOffset={10} className="z-50">
          <Menu.Popup className="max-h-[70dvh] min-w-[300px] origin-[var(--transform-origin)] overflow-y-auto border border-border-strong bg-bg pb-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            <p className="truncate px-3 pt-3 pb-1 text-[13px] text-text-muted">{email}</p>
            {offerSave ? (
              <Menu.Item className={ITEM} onClick={() => saveCurrent()}>
                <Save aria-hidden className="size-4 text-accent" />
                <span className="flex-1">
                  Save this session&apos;s portfolio
                  <span className="block text-[12px] text-text-muted">Keep it for your next visit</span>
                </span>
              </Menu.Item>
            ) : null}

            <Menu.Separator className="my-2 h-px bg-border" />
            <Menu.Group>
              <Menu.GroupLabel className={GROUP_LABEL}>Saved portfolios</Menu.GroupLabel>
              {saved.length === 0 ? <p className="px-3 py-2 text-[13px] text-text-muted">Nothing saved yet.</p> : null}
              {saved.map((p) => (
                <div key={p.id} className="flex items-center">
                  <Menu.Item className={cn(ITEM, "flex-1")} onClick={() => open(p)}>
                    <Cloud aria-hidden className="size-4 text-text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="block text-[12px] text-text-muted">
                        {p.holdings.length} {p.holdings.length === 1 ? "position" : "positions"}
                        {p.kind === "practice" ? " · practice" : ""}
                        {imported && samePositions(imported, p.holdings) ? " · showing" : ""}
                      </span>
                    </span>
                  </Menu.Item>
                  <Menu.Item
                    className="flex size-10 cursor-default items-center justify-center text-text-muted outline-none data-[highlighted]:bg-surface-1 data-[highlighted]:text-text"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Menu.Item>
                </div>
              ))}
            </Menu.Group>

            <Menu.Separator className="my-2 h-px bg-border" />
            <Menu.Item className={ITEM} onClick={signOut}>
              <LogOut aria-hidden className="size-4 text-text-muted" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

// After sign-in, a portfolio that only lives in this session gets a one-line offer to save it. Errors show here too.
export function AccountNotice() {
  const offerSave = useAccount((s) => s.offerSave);
  const error = useAccount((s) => s.error);
  const saveCurrent = useAccount((s) => s.saveCurrent);
  const dismissOffer = useAccount((s) => s.dismissOffer);
  if (!offerSave && !error) return null;
  return (
    <div role="status" className="border-b border-border bg-surface-1">
      <div className="bx-container flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-[14px]">
        <span className="min-w-0 flex-1 text-text-muted">{error ?? "Save the portfolio from this session to your account so it's here next time?"}</span>
        {!error ? (
          <button
            type="button"
            onClick={() => saveCurrent()}
            className="inline-flex h-8 items-center gap-2 bg-text px-3 text-[13px] font-medium text-bg transition-opacity duration-150 hover:opacity-90"
          >
            <Save aria-hidden className="size-3.5" />
            Save portfolio
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => (error ? useAccount.setState({ error: null }) : dismissOffer())}
          aria-label="Dismiss"
          className="inline-flex size-8 items-center justify-center text-text-muted hover:text-text"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
