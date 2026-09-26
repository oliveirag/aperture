import Link from "next/link";
import { CircleArrow } from "./circle-arrow";

// Closing call to action: hairline above, a serif line to the next step, and the circle arrow.
export function NextStepCTA({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="group flex w-full items-center justify-between gap-8 border-t border-text pt-8">
      <span className="min-w-0">
        <span className="eyebrow">Next</span>
        <span className="display mt-5 block text-[32px] leading-[1.2] text-text sm:text-[40px]">
          <span className="link-underline pb-1">{label}</span>
        </span>
        <span className="mt-3 block text-[17px] text-text-muted">{description}</span>
      </span>
      <CircleArrow size={56} className="text-text" />
    </Link>
  );
}
