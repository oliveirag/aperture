import type { ReactNode } from "react";
import { AskPanel } from "@/features/ask/ask-panel";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="bx-container flex-1 pt-12 pb-24 lg:pt-16">{children}</main>
      <SiteFooter />
      <AskPanel />
    </div>
  );
}
