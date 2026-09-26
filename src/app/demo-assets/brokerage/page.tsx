import type { Metadata } from "next";
import { SampleBrokerageScreenshot } from "@/features/import/sample-screenshot";

export const metadata: Metadata = { title: "Brokerage screenshot · Lookthrough", robots: { index: false } };

// Renders only the sample brokerage screen on white so scripts/capture.mjs can save it as a PNG.
export default function Page() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white">
      <div id="capture" className="bg-white p-6">
        <SampleBrokerageScreenshot />
      </div>
    </div>
  );
}
