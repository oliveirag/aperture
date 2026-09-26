import type { Metadata } from "next";

export const metadata: Metadata = { title: "Import" };

export default function Layout({ children }: LayoutProps<"/import">) {
  return children;
}
