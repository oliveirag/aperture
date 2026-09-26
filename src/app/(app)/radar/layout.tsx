import type { Metadata } from "next";

export const metadata: Metadata = { title: "Filing Radar" };

export default function Layout({ children }: LayoutProps<"/radar">) {
  return children;
}
