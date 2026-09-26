import type { Metadata } from "next";

export const metadata: Metadata = { title: "X-Ray" };

export default function Layout({ children }: LayoutProps<"/xray">) {
  return children;
}
