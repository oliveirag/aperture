import assert from "node:assert/strict";

async function main() {
  for (const key of ["GEMINI_API_KEY", "GEMINI_API_KEYS", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) process.env[key] = "";
  const { POST } = await import("../src/app/api/ask/route");
  const request = (body: unknown) => new Request("http://localhost/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  for (const body of [null, [], "AAPL", 1]) assert.equal((await POST(request(body))).status, 400);
  const context = { portfolio: { portfolio: { totalValueUsd: 1000 } }, scenario: { question: "oil rises", assumption: "User assumes a 20% oil increase", impacts: [{ ticker: "XOM", returnFraction: 0.1, dollar: 25 }], notModeled: [{ ticker: "KRE", weight: 0.5 }], evidence: [] } };
  const response = await POST(request({ question: "What does this oil scenario do?", level: "advanced", context }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Ask-Offline"), "1");
  const text = await response.text();
  assert.match(text, /Not modeled: KRE \(50\.0% of your portfolio\)/);
  assert.doesNotMatch(text, /\[object Object\]|NaN|undefined/);
  assert.match(text, /Calculated effect: \+\$25 \(2\.5% of your portfolio\)/);
  console.log("Ask no-Gemini route OK: real scenario context shape preserves unknown holding ticker and weight");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
