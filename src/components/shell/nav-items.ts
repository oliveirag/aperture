import { Activity, Radar, ScanEye, Users, type LucideIcon } from "lucide-react";

// Demo order: see it, stress it, read what changed, test the next idea.
export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/xray", label: "X-Ray", icon: ScanEye },
  { href: "/shock", label: "Shock Test", icon: Activity },
  { href: "/radar", label: "Filing Radar", icon: Radar },
  { href: "/ic", label: "IC Room", icon: Users },
];
