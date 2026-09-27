import assert from "node:assert/strict";
import { assertProvenance, assertNumericProvenance, publicSourceUrl, type Provenance } from "../src/lib/provenance";

const retrieved: Provenance = { kind: "retrieved", provider: "finnhub", endpoint: "https://finnhub.io/api/v1/quote?symbol=AAPL", retrievedAt: "2026-09-27T06:00:00.000Z", asOf: "2026-09-25" };
const computed: Provenance = { kind: "computed", formula: "shares × price", inputs: [retrieved] };
assert.doesNotThrow(() => assertProvenance(retrieved));
assert.doesNotThrow(() => assertProvenance(computed));
assert.doesNotThrow(() => assertProvenance({ kind: "retrieved", provider: "user-import", retrievedAt: retrieved.retrievedAt, source: "User-reviewed typed positions, row 1" }));
assert.throws(() => assertProvenance({ kind: "retrieved", provider: "user-import", retrievedAt: retrieved.retrievedAt }));
assert.throws(() => assertProvenance({ ...computed, formula: "x".repeat(8193) }));
assert.doesNotThrow(() => assertProvenance({ kind: "assumption", rationale: "User-selected driver shock", source: "User scenario input" }));
for (const value of [null, {}, { ...retrieved, retrievedAt: "yesterday" }, { ...retrieved, provider: "made-up" }, { ...retrieved, endpoint: "javascript:alert(1)" }, { ...retrieved, endpoint: "https://user:password@finnhub.io/quote" }, { ...retrieved, endpoint: "https://finnhub.io/quote?token=private" }, { ...retrieved, asOf: "2026-02-30" }, { ...computed, inputs: [] }, { ...computed, formula: "" }, { kind: "assumption", rationale: "x" }]) {
  assert.throws(() => assertProvenance(value), /provenance/i);
}
const filing = { cik: "0000320193", accession: "0000320193-25-000079", form: "10-K", filedAt: "2025-10-31", url: "https://www.sec.gov/Archives/edgar/data/320193/filing.htm", section: "Item 1A", tag: "us-gaap:Revenues" };
assert.doesNotThrow(() => assertProvenance({ ...retrieved, filing }));
for (const patch of [{ cik: "apple" }, { filedAt: "2026-02-30" }, { section: 1 }, { tag: {} }, { url: "https://sec.gov/?pwd=secret" }]) assert.throws(() => assertProvenance({ ...retrieved, filing: { ...filing, ...patch } }));
for (const suffix of ["?pwd=secret", "?sig=secret", "?session=secret", "#token=secret"]) assert.throws(() => assertProvenance({ ...retrieved, endpoint: `https://finnhub.io/quote${suffix}` }));
for (const time of ["25:00:00", "24:00:00", "12:60:00", "12:00:60"]) assert.throws(() => assertProvenance({ ...retrieved, retrievedAt: `2026-09-27T${time}Z` }));
assert.throws(() => assertNumericProvenance({ total: 1 }, { "/total": computed, "/removed": retrieved }), /orphan/i);
const cycle: { kind: string; formula: string; inputs: unknown[] } = { kind: "computed", formula: "cycle", inputs: [] };
cycle.inputs.push(cycle);
assert.throws(() => assertProvenance(cycle), /provenance/i);
const payload = { total: 100, rows: [{ price: 10, shares: 10 }], "a/b": { "~x": 1 } };
const evidence = { "/total": computed, "/rows/0/price": retrieved, "/rows/0/shares": retrieved, "/a~1b/~0x": computed };
assert.doesNotThrow(() => assertNumericProvenance(payload, evidence));
assert.throws(() => assertNumericProvenance(payload, { "/total": computed }), /\/rows\/0\/price/);
assert.throws(() => assertNumericProvenance({ total: Infinity }, { "/total": computed }), /finite/);
assert.throws(() => assertNumericProvenance({ total: NaN }, { "/total": computed }), /finite/);
assert.equal(publicSourceUrl("https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=private#secret"), "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL");
assert.equal(publicSourceUrl("https://finnhub.io/quote?symbol=AAPL&access_token=private&other=private"), "https://finnhub.io/quote?symbol=AAPL");
assert.throws(() => publicSourceUrl("https://user:password@finnhub.io/quote"));
assert.throws(() => publicSourceUrl("file:///etc/passwd"));
console.log("provenance contract OK: required sources, timestamps, formulas, assumptions, numeric paths and secret-free URLs");
