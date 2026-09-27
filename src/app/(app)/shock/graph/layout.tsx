import type { Metadata } from "next";

// The parent Shock Test layout sets a plain title, so the root template does not reach this far.
export const metadata: Metadata = { title: { absolute: "Shock Graph · Aperture" } };

export default function Layout({ children }: LayoutProps<"/shock/graph">) {
  return children;
}
