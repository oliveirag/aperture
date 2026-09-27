import { BookOpen } from "lucide-react";
import { DetailCard } from "./card";

// Plain-language note on concentration; opens by default for Beginner, one tap away at other levels.
export function LearnCard() {
  return (
    <DetailCard title="Learn" headline="Why concentration matters" className="lg:col-span-12">
      <div className="mt-2 flex gap-3">
        <BookOpen aria-hidden className="mt-1 size-4 shrink-0 text-text-subtle" />
        <p className="max-w-[72ch] text-[15px] leading-6 text-text-muted">
          When one company is a big slice of your money, one bad quarter for that company moves your whole portfolio.
          Spreading across different companies and sectors softens that.
        </p>
      </div>
    </DetailCard>
  );
}
