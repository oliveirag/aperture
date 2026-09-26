import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shock Test" };

export default function Layout({ children }: LayoutProps<"/shock">) {
  return children;
}
