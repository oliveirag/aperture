import { NextStepCTA } from "@/components/shared/next-step-cta";
import { XrayDetails } from "@/features/xray/details";
import { XrayHero } from "@/features/xray/hero";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-10">
        <XrayHero />
        <XrayDetails />
      </div>
      <NextStepCTA
        href="/shock"
        label="Stress-test these exposures"
        description="See how a commercial real estate shock travels into your holdings."
      />
    </div>
  );
}
