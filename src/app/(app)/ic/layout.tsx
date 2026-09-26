import type { Metadata } from "next";

export const metadata: Metadata = { title: "IC Room" };

export default function Layout({ children }: LayoutProps<"/ic">) {
  return children;
}
