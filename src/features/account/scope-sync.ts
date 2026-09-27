"use client";

import { useEffect } from "react";
import { useAsk } from "@/features/ask/store";
import { useIcMemos } from "@/features/ic-room/memos";
import { useResearch } from "@/features/shock/research-store";
import { useDisclosures } from "@/lib/experience/disclosure";
import { useSnapshots } from "@/lib/imports/snapshot-store";
import { usePortfolio } from "@/lib/portfolio-store";
import { scopeKeyOf } from "@/lib/scope";
import { useAccount } from "./store";

export function currentScope() {
  const { imported } = usePortfolio.getState();
  return scopeKeyOf(useAccount.getState().userId, imported, useSnapshots.getState().snapshot?.id ?? null);
}

// Mounted once: when the account or the portfolio changes, everything built for the previous one is cleared, so an
// answer, memo or scenario about one portfolio never reaches another (or another person's session).
export function useScopeSync() {
  const userId = useAccount((s) => s.userId);
  const imported = usePortfolio((s) => s.imported);
  const hydrated = usePortfolio((s) => s.hydrated);
  const snapshotId = useSnapshots((s) => s.snapshot?.id ?? null);
  const scope = scopeKeyOf(userId, imported, snapshotId);

  useEffect(() => {
    if (!hydrated) return;
    const previous = useDisclosures.getState().scope;
    useDisclosures.getState().reset(scope);
    if (!previous || previous === scope) return;
    useAsk.getState().resetScope(scope, "Started a new conversation because the portfolio or account changed.");
    useIcMemos.getState().clear();
    useResearch.setState({ result: null });
  }, [scope, hydrated]);
}
