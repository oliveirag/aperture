import { NextStepCTA } from "@/components/shared/next-step-cta";
import { ShockImpact } from "@/features/shock/impact";
import { ShockStage } from "@/features/shock/stage";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ShockStage />
        <ShockImpact />
      </div>
      <NextStepCTA
        href="/radar"
        label="See what changed in their filings"
        description="Four filings, ranked by how much of your money they touch."
      />
    </div>
  );
}
