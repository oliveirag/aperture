import { ShockTest } from "@/features/shock";
import { ShockViewTabs } from "@/features/shock/view-tabs";
export default function Page() {
  return <div className="flex flex-col gap-8"><ShockViewTabs active="flow" /><ShockTest /></div>;
}
