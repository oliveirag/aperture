// Server-only: tickers someone has run Filing Radar on. Webhook events only refresh these (plus saved holdings),
// so a news burst for an unrelated company costs nothing.
import { kv } from "@/lib/cache";

const KEY = "lt:radar:tracked";
const local = new Set<string>();

export function track(ticker: string) {
  if (local.has(ticker)) return;
  local.add(ticker);
  void kv([["SADD", KEY, ticker]]);
}

// The tracked subset of `tickers`, from this instance and the persistent store.
export async function trackedAmong(tickers: string[]): Promise<Set<string>> {
  const out = new Set(tickers.filter((t) => local.has(t)));
  const rest = tickers.filter((t) => !out.has(t));
  if (rest.length) {
    const res = await kv([["SMISMEMBER", KEY, ...rest]]);
    const flags = res?.[0];
    if (Array.isArray(flags)) rest.forEach((t, i) => flags[i] === 1 && out.add(t));
  }
  return out;
}
