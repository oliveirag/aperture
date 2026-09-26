import { NextStepCTA } from "@/components/shared/next-step-cta";
import { XrayView } from "@/features/xray";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <XrayView />
      <NextStepCTA
        href="/shock"
        label="Stress-test these exposures"
        description="See how a commercial real estate shock travels into your holdings."
      />
    </div>
  );
}
