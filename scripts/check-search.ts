// Proves ticker search ranking. Run: npx -y tsx scripts/check-search.ts
import assert from "node:assert/strict";
import { rank, type SearchResult } from "../src/lib/search";

const s = (ticker: string, name: string): SearchResult => ({ ticker, name, type: "stock" });
// Source order is SEC's (largest first); ranking puts exact and prefix matches first, then keeps that order.
const pool = [s("MSFT", "Microsoft Corp"), s("AAPL", "Apple Inc."), s("AMAT", "Applied Materials Inc"), s("APP", "AppLovin Corp"), s("APLE", "Apple Hospitality REIT"), s("BRK.B", "Berkshire Hathaway Inc"), s("BRKR", "Bruker Corp")];
assert.equal(rank(pool, "appl")[0].ticker, "AAPL");
assert.equal(rank(pool, "apple")[0].ticker, "AAPL");
assert.equal(rank(pool, "AAPL")[0].ticker, "AAPL");
assert.deepEqual(rank(pool, "brk").slice(0, 2).map((r) => r.ticker), ["BRK.B", "BRKR"]);
assert.equal(rank(pool, "micro")[0].ticker, "MSFT");
// Duplicates and non-US symbols are dropped; at most 8 results.
assert.deepEqual(rank([s("AAPL", "Apple"), s("AAPL", "Apple"), s("AAPL.MX", "Apple Mexico")], "aapl").map((r) => r.ticker), ["AAPL"]);
assert.ok(rank(Array.from({ length: 20 }, (_, i) => s(`A${String.fromCharCode(65 + i)}`, "Alpha")), "a").length <= 8);
console.log("search OK");
