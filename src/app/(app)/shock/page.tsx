import { NextStepCTA } from "@/components/shared/next-step-cta";
import { ShockTest } from "@/features/shock";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <ShockTest />
      <NextStepCTA
        href="/radar"
        label="See what changed in their filings"
        description="Four filings, ranked by how much of your money they touch."
      />
    </div>
  );
}
