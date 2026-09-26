import { NextStepCTA } from "@/components/shared/next-step-cta";
import { RadarPage } from "@/features/radar";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <RadarPage />
      <NextStepCTA
        href="/ic"
        label="Pressure-test your next idea"
        description="Run an investment committee on AMD before you buy."
      />
    </div>
  );
}
