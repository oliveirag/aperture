import { Wordmark } from "@/components/shared/lens-mark";
import { PageHeader } from "@/components/shared/page-header";

// Stub. GUI-41 replaces this file; keep the export name.
export function ImportFlow() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1120px] flex-col gap-16 px-8 py-8">
      <Wordmark />
      <PageHeader eyebrow="Import" headline="Import coming together" />
    </main>
  );
}
