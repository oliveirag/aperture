import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { SourceDrawer } from "@/components/shared/source-drawer";
import { DemoKeys } from "@/components/shell/demo-keys";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lookthrough",
  description: "See what you actually own.",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        {/* First tooltip waits; neighbours open instantly (Base UI handles the grace period). */}
        <TooltipProvider delay={350}>
          {children}
          <SourceDrawer />
          <DemoKeys />
        </TooltipProvider>
      </body>
    </html>
  );
}
