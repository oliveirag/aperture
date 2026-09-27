import type { ReactNode } from "react";
import { AccountNotice } from "@/features/account/account-menu";
import { AskPanel } from "@/features/ask/ask-panel";
import { ExperienceReady } from "./experience-ready";
import { LevelNotice } from "./level-notice";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <AccountNotice />
      <LevelNotice />
      <main className="bx-container flex-1 pt-12 pb-24 lg:pt-16">
        <ExperienceReady>{children}</ExperienceReady>
      </main>
      <SiteFooter />
      <AskPanel />
    </div>
  );
}
