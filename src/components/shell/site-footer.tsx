import Link from "next/link";
import { Wordmark } from "@/components/shared/lens-mark";
import { NAV_ITEMS } from "./nav-items";

// Closing black band: wordmark left, link columns right, disclosure along the bottom hairline.
export function SiteFooter() {
  return (
    <footer className="theme-dark">
      <div className="bx-container grid gap-12 pt-20 pb-12 md:grid-cols-[1fr_auto]">
        <div>
          <Wordmark />
          <p className="mt-6 max-w-[36ch] text-[15px] leading-6 text-text-muted">
            See what you actually own. Built for the Blackstone challenge at ShellHacks 2026.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-16 gap-y-10">
          <FooterColumn title="Explore" links={NAV_ITEMS} />
          <div>
            <h2 className="text-[17px] font-normal text-text">Disclosure</h2>
            <p className="mt-5 max-w-[26ch] text-[14px] leading-6 text-text-muted">
              Educational tool. Not investment advice. Live, reference and illustrative data are labeled in each view.
            </p>
          </div>
        </div>
      </div>
      <div className="bx-container">
        <p className="border-t border-border py-6 text-[13px] text-text-subtle">© 2026 Aperture. Investing involves risk, including loss of capital.</p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-[17px] font-normal text-text">{title}</h2>
      <ul className="mt-5 flex flex-col gap-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="link-underline pb-0.5 text-[14px] text-text">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
