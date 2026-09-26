import { Wordmark } from "@/components/shared/lens-mark";
import { PageHeader } from "@/components/shared/page-header";

// Stub. GUI-40 replaces this file; keep the export name.
export function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1200px] flex-col gap-16 px-8 py-8">
      <Wordmark />
      <PageHeader eyebrow="Landing" headline="Landing coming together" />
    </main>
  );
}
