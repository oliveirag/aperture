import type { ReactNode } from "react";
import { MobileNav, Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <TopBar />
        <MobileNav />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
