import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallback } from "@/features/account/auth-callback";

export const metadata: Metadata = { title: "Signing in" };

export default function Page() {
  return (
    <Suspense>
      <AuthCallback />
    </Suspense>
  );
}
