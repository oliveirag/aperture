import { NextStepCTA } from "@/components/shared/next-step-cta";
import { ShockTest } from "@/features/shock";
import { ShockViewTabs } from "@/features/shock/view-tabs";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <ShockViewTabs active="flow" />
      <ShockTest />
      <NextStepCTA
        href="/radar"
        label="See what changed in their filings"
        description="Four filings, ranked by how much of your money they touch."
      />
    </div>
  );
}
