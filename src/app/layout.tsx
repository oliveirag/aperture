import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { SourceDrawer } from "@/components/shared/source-drawer";
import { AccountBoot } from "@/components/shell/account-boot";
import { DemoKeys } from "@/components/shell/demo-keys";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Light editorial serif for display type and a light grotesk for text, self-hosted at build time.
const display = Newsreader({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"], display: "swap" });
const grotesk = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Lookthrough", template: "%s · Lookthrough" },
  description: "See what you actually own.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The whole site runs on the black-band tokens; .theme-light is available for inverted emphasis.
    <html lang="en" className={`theme-dark ${display.variable} ${grotesk.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        {/* First tooltip waits; neighbours open instantly (Base UI handles the grace period). */}
        <TooltipProvider delay={350}>
          {children}
          <SourceDrawer />
          <DemoKeys />
          <AccountBoot />
        </TooltipProvider>
      </body>
    </html>
  );
}
