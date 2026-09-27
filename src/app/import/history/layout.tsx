import type { Metadata } from "next";

export const metadata: Metadata = { title: "Saved imports" };

export default function Layout({ children }: LayoutProps<"/import/history">) {
  return children;
}
