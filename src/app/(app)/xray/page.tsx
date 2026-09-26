import { XrayDetails } from "@/features/xray/details";
import { XrayHero } from "@/features/xray/hero";

export default function Page() {
  return (
    <div className="flex flex-col gap-10">
      <XrayHero />
      <XrayDetails />
    </div>
  );
}
