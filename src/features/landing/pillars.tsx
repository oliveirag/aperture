import { Activity, Radar, ScanEye, Users, type LucideIcon } from "lucide-react";

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ScanEye, title: "See what you actually own", body: "Looks inside your ETFs to show every company your money reaches." },
  { icon: Activity, title: "Stress it before the market does", body: "Traces a market shock through the companies you own, with sources." },
  { icon: Radar, title: "Know what changed in the fine print", body: "Flags new and changed risks in the filings you're exposed to." },
  { icon: Users, title: "Pressure-test your next idea", body: "Weighs the evidence for and against before you add a position." },
];

// Four columns divided by hairlines rather than four identical boxes: the hero stays the only loud thing.
export function Pillars() {
  return (
    <section aria-label="What Lookthrough does" className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
      {PILLARS.map(({ icon: Icon, title, body }) => (
        <div
          key={title}
          className="border-t border-border py-8 first:border-t-0 sm:pr-8 sm:nth-2:border-t-0 lg:border-t-0 lg:border-l lg:pl-8 lg:first:border-l-0 lg:first:pl-0"
        >
          <Icon aria-hidden className="size-5 text-accent" />
          <h2 className="mt-4 text-[15px] font-semibold text-text">{title}</h2>
          <p className="mt-1.5 text-[14px] leading-[22px] text-text-muted">{body}</p>
        </div>
      ))}
    </section>
  );
}
