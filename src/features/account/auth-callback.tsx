"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Wordmark } from "@/components/shared/lens-mark";
import { startAccount, useAccount } from "@/lib/account";

// Only same-site paths are allowed as a post-sign-in destination.
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/xray");

// Google sends the user back here; supabase-js exchanges the ?code for a session (PKCE), then we move on.
export function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const status = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.signIn);
  const [timedOut, setTimedOut] = useState(false);
  const providerError = params.get("error_description") ?? params.get("error");
  const next = safeNext(params.get("next"));

  useEffect(() => startAccount(), []);
  useEffect(() => {
    if (status === "signed-in") router.replace(next);
  }, [status, next, router]);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(t);
  }, []);

  const failed = providerError || status === "disabled" || (timedOut && status !== "signed-in");
  const message = providerError ?? (status === "disabled" ? "Accounts aren't set up on this deployment." : "Sign-in didn't complete.");

  return (
    <main className="bx-container flex min-h-dvh flex-col">
      <header className="flex h-24 items-center">
        <Link href="/" aria-label="Lookthrough home">
          <Wordmark />
        </Link>
      </header>
      <section className="flex flex-1 flex-col justify-center pb-24">
        {failed ? (
          <div className="flex max-w-[52ch] flex-col gap-6">
            <p className="flex items-start gap-3 text-[20px] font-light text-text">
              <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0 text-sev-medium" />
              {message}
            </p>
            <p className="text-[15px] text-text-muted">Nothing is lost. You can keep exploring without an account; portfolios stay in this tab.</p>
            <div className="flex flex-wrap gap-3">
              {status !== "disabled" ? (
                <button type="button" onClick={() => void signIn(next)} className="inline-flex h-10 items-center bg-text px-4 text-[14px] font-medium text-bg hover:bg-text/85">
                  Try signing in again
                </button>
              ) : null}
              <Link href={next} className="inline-flex h-10 items-center border border-border-strong px-4 text-[14px] text-text hover:bg-surface-1">
                Continue without an account
              </Link>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-3 text-[20px] font-light text-text-muted" aria-live="polite">
            <LoaderCircle aria-hidden className="size-5 animate-spin text-accent" />
            Signing you in…
          </p>
        )}
      </section>
    </main>
  );
}
