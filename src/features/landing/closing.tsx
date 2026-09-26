import { Reveal } from "@/components/shared/reveal";
import { TryDemoLink } from "./try-demo-link";

// Black closing band before the footer, in the place of an email capture: one sentence and one action.
export function Closing() {
  return (
    <section className="theme-dark border-b border-border py-28 lg:py-36">
      <Reveal className="bx-container grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <div>
          <p className="eyebrow">Start here</p>
          <h2 className="display mt-10 max-w-[20ch] text-[40px] leading-[1.25] text-text sm:text-[48px]">
            Import a screenshot and see what you actually own.
          </h2>
        </div>
        <div className="lg:justify-self-end">
          <TryDemoLink />
        </div>
      </Reveal>
    </section>
  );
}
