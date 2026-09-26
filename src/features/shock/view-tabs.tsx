import Link from "next/link";
import { Activity, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "flow", href: "/shock", label: "Flow", icon: Activity },
  { id: "graph", href: "/shock/graph", label: "Graph", icon: Waypoints },
] as const;

// Two ways to read the same Shock Test: the step-by-step flow, or the whole knowledge graph.
export function ShockViewTabs({ active }: { active: (typeof VIEWS)[number]["id"] }) {
  return (
    <nav aria-label="Shock Test view" className="-mb-4 flex gap-1 border-b border-border">
      {VIEWS.map(({ id, href, label, icon: Icon }) => (
        <Link
          key={id}
          href={href}
          aria-current={id === active ? "page" : undefined}
          className={cn(
            "relative -mb-px inline-flex h-10 items-center gap-2 px-3 text-[14px] transition-colors duration-150",
            id === active ? "text-text" : "text-text-muted hover:text-text",
          )}
        >
          <Icon aria-hidden className={cn("size-4", id === active && "text-accent")} />
          {label}
          {id === active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" /> : null}
        </Link>
      ))}
    </nav>
  );
}
