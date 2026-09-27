"use client";

import type { ReactNode } from "react";
import { useExperience } from "@/lib/experience/store";

// Holds the page invisible (but laid out, so server and client markup match) until the saved level has loaded, so a
// returning Beginner never sees an Intermediate page flash first.
export function ExperienceReady({ children }: { children: ReactNode }) {
  const hydrated = useExperience((s) => s.hydrated);
  return <div style={hydrated ? undefined : { visibility: "hidden" }}>{children}</div>;
}
