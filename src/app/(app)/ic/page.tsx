import { NextStepCTA } from "@/components/shared/next-step-cta";
import { IcRoom } from "@/features/ic-room";

export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <IcRoom />
      <NextStepCTA href="/xray" label="Back to your X-Ray" description="Your portfolio, seen through." />
    </div>
  );
}
