import Link from "next/link";
import { Wordmark } from "@/components/shared/lens-mark";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { SiteFooter } from "@/components/shell/site-footer";
import { Closing } from "./closing";
import { Hero } from "./hero";
import { Pillars } from "./pillars";
import { Scale } from "./scale";
import { Steps } from "./steps";
import { TryDemoLink } from "./try-demo-link";

// The front page, built like an editorial homepage: black hero, white "about", black two-up,
// a marquee, white steps, a black closing band and the footer.
export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="theme-dark">
        <header className="bx-container flex h-24 items-center justify-between gap-8 lg:h-[132px]">
          <Link href="/" aria-label="Aperture home">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-9">
              {NAV_ITEMS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="link-underline pb-1 text-[17px] font-light text-text">
                    {label}
                  </Link>
                </li>
              ))}
              <li className="border-l border-border pl-9">
                <TryDemoLink variant="nav" />
              </li>
            </ul>
          </nav>
          <TryDemoLink variant="nav" className="lg:hidden" />
        </header>
        <main>
          <Hero />
        </main>
      </div>
      <Scale />
      <Pillars />
      <Steps />
      <Closing />
      <SiteFooter />
    </div>
  );
}
