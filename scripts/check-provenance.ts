import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditApiProvenance } from "../src/lib/api-provenance";
import { withLiveLock } from "./lib/fixtures";

// Coverage is deliberately explicit: this is NOT the mission-wide completion gate yet.
export const UNVERIFIED = ["/api/outlook", "/api/ic/facts", "/api/ic/run POST+GET", "/api/ic/listen", "/api/price", "/api/market", "/api/search (non-numeric)"];
export const OTHER_OWNERS = ["/api/shock/* (D)", "/api/radar/* (B/E)", "/api/news/* (E)", "/api/import/* (F/G)", "/api/snap/* (parent)", "/api/ask (parent)"];
const request = (path: string, holdings: unknown[]) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings }) });
async function main() {
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "GEMINI_API_KEY", "GEMINI_API_KEYS", "ALPHA_VANTAGE_API_KEY", "FINNHUB_API_KEY"]) process.env[name] = "";
  process.env.APERTURE_LOCAL_VERIFICATION = "1";
  const dir = await mkdtemp(join(tmpdir(), "aperture-provenance-"));
  process.env.APERTURE_CACHE_DIR = dir;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Fixture check attempted unrecorded network access"); };
  try {
    const { POST: aperture } = await import("../src/app/api/aperture/route");
    const { POST: performance } = await import("../src/app/api/performance/route");
    const { apertureInputs, parseHoldings } = await import("../src/lib/xray/live");
    const portfolios = [
      [{ticker:"AAPL",shares:10,price:200},{ticker:"VOO",shares:5,price:500}],
      ["NVDA","AAPL","MSFT","VOO","QQQ","VTI","USD"].map(ticker=>({ticker,shares:10,price:100})),
      Array.from({length:25},(_,i)=>({ticker:`REVIEWED ${i}`,kind:"opaque",shares:0,marketValue:100+i})),
      ["BRK.B","GOOG","GOOGL","TSM","VFIAX","USD","DELISTED","OPTION CONTRACT"].map(ticker=>({ticker,kind:ticker==="USD"?"cash":"opaque",shares:0,marketValue:250})),
      [{ticker:"QQQ",shares:2,price:500}],
    ];
    for (const [i, holdings] of portfolios.entries()) {
      const response = await aperture(request("/api/aperture", holdings));
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.ok(auditApiProvenance(payload).numericFields > 0, "empty responses do not count");
      assert.ok(payload.total > 0);
      console.log(`covered /api/aperture portfolio ${i+1}`);
    }
    for (const endpoint of ["https://evil.example/facts", "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"]) {
      const source = {kind:"retrieved",provider:"sec-xbrl",endpoint,retrievedAt:"2026-09-27T00:00:00Z"};
      for (const provenance of [source,{kind:"computed",formula:"verified by client",inputs:[source]}]) {
        const holdings = [{ticker:"UNKNWN",kind:"stock",shares:0,marketValue:1234,provenance}];
        const inputs = await apertureInputs(parseHoldings(holdings));
        assert.equal(inputs[0].kind,"opaque","client stock label is not identity proof");
        assert.equal(inputs[0].marketValue,1234);
        assert.equal(inputs[0].provenance?.kind,"assumption");
        for (const handler of [aperture, performance]) {
          const response = await handler(request("/api/test",holdings));
          assert.equal(response.status,200);
          const payload = await response.json();
          assert.ok(!JSON.stringify(payload).includes(endpoint),"client source claim must not survive");
          assert.ok(auditApiProvenance(payload).numericFields > 0);
        }
      }
    }
    assert.throws(()=>auditApiProvenance({value:1}),/Missing provenance/);
    assert.throws(()=>auditApiProvenance({numericProvenance:{"/absent":{kind:"assumption",source:"test",rationale:"orphan"}}}),/Orphan/);
    assert.throws(()=>auditApiProvenance({error:"unavailable"}),/error response/);
    console.log("Scoped fixture checks PASS. UNVERIFIED:",UNVERIFIED.join(", "),"OTHER OWNERS:",OTHER_OWNERS.join(", "));
    if (process.argv.includes("--complete")) throw new Error("Mission coverage incomplete: inventory remains unverified");
  } finally { globalThis.fetch = originalFetch; await rm(dir,{recursive:true,force:true}); }
}
(process.argv.includes("--live") ? withLiveLock(async()=>{throw new Error("Live provenance coverage not implemented; no live success claimed");},{waitMs:0}) : main()).catch(error=>{console.error(error);process.exitCode=1;});
