// Pure: the identity of "whose analysis is this". Conversations, memos, scenario results and reading state are only
// valid for one account and one portfolio; anything built under another scope must not be shown or sent onward.
import { HOLDINGS } from "@/data/portfolio";
import { portfolioKey } from "@/lib/shock/research-model";

type Position = { ticker: string; shares: number; price: number };

export function scopeKeyOf(userId: string | null, imported: Position[] | null, snapshotId: string | null) {
  return `${userId ?? "guest"}|${snapshotId ?? "-"}|${portfolioKey(imported ?? HOLDINGS)}`;
}
