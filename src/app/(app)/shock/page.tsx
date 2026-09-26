import { ShockImpact } from "@/features/shock/impact";
import { ShockStage } from "@/features/shock/stage";

export default function Page() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ShockStage />
      <ShockImpact />
    </div>
  );
}
