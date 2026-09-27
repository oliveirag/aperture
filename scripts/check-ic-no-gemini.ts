import assert from "node:assert/strict";

async function main() {
  process.env.GEMINI_API_KEY = "";
  process.env.GEMINI_API_KEYS = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  process.env.KV_REST_API_URL = "";
  process.env.KV_REST_API_TOKEN = "";
  const { POST } = await import("../src/app/api/ic/run/route");
  const request = (body: unknown) => new Request("http://localhost/api/ic/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const invalid = await POST(request({ ticker: "", thesis: "Research risks", amount: 1000, holdings: [{ ticker: "AAPL", shares: 10 }] }));
  assert.equal(invalid.status, 400, "Missing Gemini keys must not disable the rules-based IC route before input validation");
  assert.equal((await invalid.json()).error, "Invalid ticker");
  for (const body of [null, [], "AAPL", 1]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400, "Non-object bodies must not throw or start provider requests");
  }
  console.log("IC no-Gemini route OK: rules-based path remains available, invalid JSON shapes fail before providers");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
