import assert from "node:assert/strict";
import { loadFixture, withLiveLock } from "./lib/fixtures";
import { assertNumericProvenance, type Provenance } from "../src/lib/provenance";

const fields = ["LNRECONS", "LNREMULT", "LNRENRES", "LNLSGR"] as const;
function row(body: string): Record<string, unknown> {
  const parsed = JSON.parse(body);
  assert.equal(parsed.data?.length, 1, "The recorded query must identify one institution/report");
  assert.ok(parsed.data[0].data && typeof parsed.data[0].data === "object");
  return parsed.data[0].data;
}
const name = (value: unknown) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/NATIONALASSOCIATION$/, "NA");

async function main() {
  const report = await loadFixture("scripts/fixtures/fdic/zion-financials-2026q2.json");
  const institution = await loadFixture("scripts/fixtures/fdic/zion-institution-2026-09-27.json");
  const sec = await loadFixture("scripts/fixtures/sec-edgar/zion-submissions.json");
  for (const fixture of [report, institution]) {
    assert.equal(fixture.provider, "fdic");
    assert.equal(new URL(fixture.endpoint).origin, "https://api.fdic.gov");
  }
  const data = row(report.body), bank = row(institution.body), issuer = JSON.parse(sec.body);
  assert.equal(data.CERT, 2270);
  assert.equal(bank.CERT, data.CERT);
  assert.equal(data.REPDTE, "20260630");
  assert.equal(new URL(report.endpoint).searchParams.get("filters"), "CERT:2270 AND REPDTE:20260630");
  assert.equal(issuer.stateOfIncorporation, bank.STALP);
  const jurisdiction = ` /${issuer.stateOfIncorporation}/`;
  assert.ok(issuer.name.endsWith(jurisdiction));
  assert.equal(name(bank.NAME), name(issuer.name.slice(0, -jurisdiction.length)), "Use the verified legal entity name, allowing only the separately verified SEC jurisdiction suffix");
  assert.ok(issuer.tickers.includes("ZION"));
  assert.equal(bank.STALP, issuer.addresses.business.stateOrCountry);
  assert.equal(String(bank.ZIP).slice(0, 5), String(issuer.addresses.business.zipCode).slice(0, 5));
  for (const field of fields) assert.ok(typeof data[field] === "number" && Number.isSafeInteger(data[field]) && (data[field] as number) >= 0, field);
  const numerator = Number(data.LNRECONS) + Number(data.LNREMULT) + Number(data.LNRENRES);
  const denominator = Number(data.LNLSGR);
  assert.equal(numerator, 23684000);
  assert.equal(denominator, 62557386);
  assert.ok(denominator > 0 && numerator <= denominator);
  const source: Provenance = { kind: "retrieved", provider: "fdic", endpoint: report.endpoint, retrievedAt: report.retrievedAt, asOf: "2026-06-30" };
  const ratio = numerator / denominator;
  assertNumericProvenance({ ratio }, { "/ratio": { kind: "computed", formula: "(LNRECONS + LNREMULT + LNRENRES) / LNLSGR; same certificate/report; native monetary units cancel", inputs: [source] } });
  if (process.argv.includes("--live")) await withLiveLock(async () => {
    for (const fixture of [report, institution]) {
      const response = await fetch(fixture.endpoint, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(Buffer.byteLength(text) < 256_000);
      const current = row(text), original = row(fixture.body);
      for (const field of fixture === report ? ["CERT", "REPDTE", ...fields] : ["CERT", "NAME", "STALP", "ZIP"]) assert.deepEqual(current[field], original[field], `Provider revision or identity change: ${field}`);
      console.log(JSON.stringify({ provider: "fdic", endpoint: fixture.endpoint, retrievedAt: new Date().toISOString(), certificate: current.CERT, reportDate: current.REPDTE ?? null }));
    }
  });
  console.log(JSON.stringify({ check: "FDIC source/identity and broad secured-loan ratio", mode: process.argv.includes("--live") ? "live" : "real-fixture-replay", certificate: data.CERT, asOf: source.asOf, numerator, denominator, ratio, retrievedAt: source.retrievedAt, limitation: "Broad secured-loan measure includes owner-occupied lending; not regulatory CRE/capital concentration, loss rate or stock sensitivity. Production channel integration remains separate." }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "FDIC check failed"); process.exitCode = 1; });
