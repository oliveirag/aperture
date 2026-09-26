import type { Metadata } from "next";

export const metadata: Metadata = { title: "Experience" };

export default function Layout({ children }: LayoutProps<"/onboarding">) {
  return children;
}
