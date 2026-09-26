import type { Metadata } from "next";

export const metadata: Metadata = { title: "Practice portfolio" };

export default function Layout({ children }: LayoutProps<"/practice">) {
  return children;
}
