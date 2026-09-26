"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, CloudOff, LoaderCircle, LogIn, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

const ITEM =
  "flex min-h-10 w-full cursor-default items-center gap-3 px-3 py-2 text-left text-[14px] text-text outline-none select-none data-[highlighted]:bg-surface-1";

function initials(name: string | null, email: string | null) {
  const src = name || email || "?";
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function SaveStatus({ className }: { className?: string }) {
  const saveState = useAccount((s) => s.saveState);
  if (saveState === "idle") return null;
  const map = {
    saving: { icon: LoaderCircle, text: "Saving to your account…", spin: true },
    saved: { icon: Check, text: "Saved to your account", spin: false },
    error: { icon: CloudOff, text: "Couldn't save. Try again from the menu.", spin: false },
  } as const;
  const { icon: Icon, text, spin } = map[saveState];
  return (
    <span className={cn("flex items-center gap-1.5 text-[12px] text-text-muted", className)}>
      <Icon aria-hidden className={cn("size-3.5", spin && "animate-spin", saveState === "error" && "text-sev-medium")} />
      {text}
    </span>
  );
}

// Masthead account control. Hidden entirely when accounts aren't configured, so the demo is unchanged.
export function AccountButton() {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const signIn = useAccount((s) => s.signIn);
  const signOut = useAccount((s) => s.signOut);
  const saveCurrent = useAccount((s) => s.saveCurrent);
  const saveState = useAccount((s) => s.saveState);
  const pathname = usePathname();

  if (status === "disabled") return null;
  if (status === "loading") return <span aria-hidden className="size-8 shrink-0 animate-pulse rounded-full bg-surface-1" />;

  if (status === "signed-out" || !user) {
    return (
      <button
        type="button"
        onClick={() => signIn(pathname)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap text-[14px] font-light text-text transition-colors duration-150 hover:text-accent"
      >
        <LogIn aria-hidden className="size-4" />
        Sign in
      </button>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${user.name ?? user.email ?? "signed in"}`}
        className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-1 text-[12px] font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {user.avatar ? (
          // Google avatar URL; next/image would need every Google avatar host allow-listed for a 32px circle.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          initials(user.name, user.email)
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={10} className="z-50">
          <Menu.Popup className="min-w-[260px] origin-[var(--transform-origin)] border border-border-strong bg-bg py-2 shadow-[0_12px_32px_rgba(0,0,0,0.4)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            <div className="px-3 pt-1 pb-2">
              <p className="truncate text-[14px] font-medium text-text">{user.name ?? "Signed in"}</p>
              {user.email ? <p className="truncate text-[12px] text-text-muted">{user.email}</p> : null}
              <SaveStatus className="mt-2" />
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            {saveState === "error" ? (
              <Menu.Item className={ITEM} onClick={() => void saveCurrent()}>
                <CloudOff aria-hidden className="size-4 text-text-muted" />
                Try saving again
              </Menu.Item>
            ) : null}
            <Menu.Item className={ITEM} onClick={() => void signOut()}>
              <LogOut aria-hidden className="size-4 text-text-muted" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
