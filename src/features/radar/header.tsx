"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Term } from "@/components/shared/term";

export function RadarHeader({ headline }: { headline: string }) {
  return (
    <PageHeader
      eyebrow="Filing Radar"
      headline={headline}
      subline={
        <>
          We compare each company&apos;s latest <Term term="10-K">10-K</Term> or <Term term="10-Q">10-Q</Term> with the
          prior one and flag new or changed <Term term="risk factor">risk factors</Term>.
        </>
      }
    />
  );
}
