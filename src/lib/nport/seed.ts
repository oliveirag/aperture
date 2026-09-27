// CLI-only fixture ingestion. Not imported by the server runtime.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadFixture, saveFixture, withLiveLock, type Fixture } from "../../../scripts/lib/fixtures";
import { assertNumericProvenance, type FilingProvenance, type RetrievedProvenance } from "../provenance";
import { TARGET_FUNDS, equity, parseNport, positionKey, resolveFund, sourcedProfile, type ParsedFund, type Mapping } from "./index";
import { mappingJob, parseMappings, secFallback } from "./mapping";
import { parseTrustSchedule, trustProfile, trustSource } from "./trust";
import { classifyProfile, classificationsFromSubmissions } from "./sectors";
import { validateSeed, type SectorClassification } from "./contract";

const location = (provider: string, name: string) => `scripts/fixtures/${provider}/${name}.json`;
async function optionalFixture(provider: string, name: string): Promise<Fixture | undefined> {
  try { return await loadFixture(location(provider, name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}
const source = (f: Fixture): RetrievedProvenance => {
  if (f.provider === "user-import") throw new Error("ETF fixtures require provider retrieval, not user input");
  return { kind: "retrieved", provider: f.provider, endpoint: f.endpoint, retrievedAt: f.retrievedAt };
};
async function inputs() {
  const funds = JSON.parse((await loadFixture(location("sec-nport", "fund-tickers"))).body);
  const filings: { parsed: ParsedFund; fixture: Fixture; filing: FilingProvenance }[] = [];
  const blocked: Record<string, { status: "unavailable"; reason: string }> = {};
  for (const ticker of TARGET_FUNDS) {
    const identity = resolveFund(ticker, funds);
    const fixture = await optionalFixture("sec-nport", `${ticker.toLowerCase()}-nport`);
    if (!identity || !fixture) {
      blocked[ticker] = { status: "unavailable", reason: !identity ? "Not in SEC mutual-fund series/class list; verified issuer holdings required" : "No recorded NPORT filing available" };
      continue;
    }
    const parsed = parseNport(fixture.body, identity);
    const path = new URL(fixture.endpoint).pathname;
    const digits = path.match(/\/([0-9]{18})\/primary_doc.xml$/)?.[1];
    if (!digits) throw new Error("Invalid NPORT fixture accession path");
    const accession = `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
    // Filing dates come from actual submissions/search, never today's date.
    const search = await optionalFixture("sec-edgar", `${ticker.toLowerCase()}-search`);
    const hit = search && JSON.parse(search.body).hits.hits.find((h: { _source: { adsh: string } }) => h._source.adsh === accession)?._source;
    let filedAt = hit?.file_date;
    let form = hit?.form;
    if (!filedAt) {
      const submissions = JSON.parse((await loadFixture(location("sec-nport", `submissions-${Number(identity.cik)}`))).body).filings.recent;
      const index = submissions.accessionNumber.indexOf(accession);
      filedAt = submissions.filingDate[index]; form = submissions.form[index];
    }
    if (!filedAt || !/^NPORT-P(?:\/A)?$/.test(form)) throw new Error("Missing NPORT filing metadata");
    filings.push({ parsed, fixture, filing: { cik: identity.cik, accession, form, filedAt, url: fixture.endpoint } });
  }
  return { filings, blocked };
}
export async function runSeed(args: string[]) {
  if (args.some(a => !["--capture-mappings", "--check"].includes(a))) throw new Error("Usage: node scripts/seed-etfs.mjs [--capture-mappings|--check]");
  const { filings, blocked } = await inputs();
  const positions = filings.flatMap(f => f.parsed.positions);
  const sec = await loadFixture(location("sec-edgar", "equity-tickers"));
  const mappings: Map<string, Mapping> = secFallback(positions, JSON.parse(sec.body), source(sec));
  const keys = [...new Set(positions.filter(equity).map(positionKey))].filter(key => !key.startsWith("NAME:")).sort();
  let unavailableBatches = 0;
  async function populate(keys: string[]) {
    for (let index = 0; index < keys.length; index += 10) {
      const batch = keys.slice(index, index + 10);
      const body = JSON.stringify(batch.map(mappingJob));
      const name = `mapping-${createHash("sha256").update(body).digest("hex").slice(0, 24)}`;
      let fixture = await optionalFixture("openfigi", name);
      const invalid = !fixture && await optionalFixture("openfigi", `${name}-invalid`);
      if (!fixture && !invalid && args.includes("--capture-mappings")) {
        // One keyless batch per lock, >= 2.6s spacing including release. Never nests captureFixture.
        fixture = await withLiveLock(async () => {
          await new Promise(resolve => setTimeout(resolve, 2600));
          const endpoint = "https://api.openfigi.com/v3/mapping";
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error(`OpenFIGI HTTP ${response.status}; stop rather than retrying a rate limit`);
          const raw = await response.text();
          if (raw.length > 2 * 1024 * 1024) throw new Error("Oversized OpenFIGI response");
          const retrievedAt = new Date().toISOString();
          try { parseMappings(batch, JSON.parse(raw), { kind: "retrieved", provider: "openfigi", endpoint, retrievedAt }); }
          catch {
            // Preserve unexpected real responses, but never treat them as valid mappings.
            await saveFixture(location("openfigi", `${name}-invalid`), { provider: "openfigi", endpoint, retrievedAt, body: raw });
            console.warn(`OpenFIGI malformed response for ${name}; identifiers remain unmatched/SEC-fallback`);
            return undefined;
          }
          return saveFixture(location("openfigi", name), { provider: "openfigi", endpoint, retrievedAt, body: raw });
        });
        if (fixture) console.log(`OpenFIGI ${Math.min(index + 10, keys.length)}/${keys.length} identifiers captured ${fixture.retrievedAt}`);
        // Give other workstreams a chance to acquire the shared lock between batches.
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      if (!fixture) { unavailableBatches++; continue; }
      for (const [key, mapping] of parseMappings(batch, JSON.parse(fixture.body), source(fixture))) mappings.set(key, mapping);
    }
  }
  await populate(keys);
  // A CUSIP may have changed or be absent in FIGI; try the filing's ISIN once,
  // without fuzzy ticker/company matching or silently discarding the position.
  const secondary = positions.filter(p => equity(p) && !mappings.has(positionKey(p)) && p.isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(p.isin));
  await populate([...new Set(secondary.map(p => `ISIN:${p.isin}`))].filter(key => !keys.includes(key)).sort());
  for (const position of secondary) {
    const mapping = mappings.get(`ISIN:${position.isin}`);
    if (mapping) mappings.set(positionKey(position), mapping);
  }
  const profiles: Record<string, ReturnType<typeof sourcedProfile> | ReturnType<typeof trustProfile>> = {};
  for (const ticker of ["SPY", "DIA"] as const) {
    const fixture = await loadFixture(location("sec-edgar", `${ticker.toLowerCase()}-trust-n30d`));
    const submissions = await loadFixture(location("sec-edgar", `${ticker.toLowerCase()}-trust-submissions`));
    const evidence = trustSource(ticker, fixture, submissions);
    const parsed = parseTrustSchedule(ticker, fixture.body, evidence);
    const mapped = secFallback(parsed.positions, JSON.parse(sec.body), source(sec));
    const profile = trustProfile(ticker, parsed, mapped, evidence);
    const { provenance, holdingsSource: _source, ...data } = profile;
    void _source;
    assertNumericProvenance(data, provenance);
    profiles[ticker] = profile;
    delete blocked[ticker];
    console.log(`${ticker}: SEC N-30D ${profile.asOf}; ${profile.coverage.positionCount} rows; mapped ${(profile.coverage.mappedWeight * 100).toFixed(4)}%; reconciled=${profile.coverage.reconciled}`);
  }
  for (const { parsed, fixture, filing } of filings) {
    const profile = sourcedProfile(parsed, mappings, { ...source(fixture), asOf: parsed.asOf, filing });
    const { provenance, holdingsSource: _source, ...data } = profile;
    void _source;
    assertNumericProvenance(data, provenance);
    profiles[parsed.identity.ticker] = profile;
    console.log(`${profile.ticker}: ${profile.coverage.mappedPositions}/${profile.coverage.positionCount} positions; mapped ${(profile.coverage.mappedWeight * 100).toFixed(4)}%; unmatched ${(profile.coverage.unmatchedWeight * 100).toFixed(4)}%; reconciled=${profile.coverage.reconciled}; asOf=${profile.asOf}`);
  }
  // No invented generation timestamp: output is deterministic from immutable fixtures.
  // Existing Shock consumers read raw symbol/description/last_updated fields.
  // Keep these string aliases during integration; weights and evidence remain identical.
  const classifications = new Map<string, SectorClassification>();
  for (const name of ["aapl-submissions-2026-09-27", ..."amzn brk-b bxp googl hckt jpm meta msft nvda rddt td tsm wal xom zion mcd".split(" ").map(t => `${t}-submissions`)]) {
    const fixture = await loadFixture(location("sec-edgar", name));
    for (const [ticker, classification] of classificationsFromSubmissions(JSON.parse(fixture.body), source(fixture))) {
      if (classifications.has(ticker)) throw new Error(`Conflicting SEC classifications for ${ticker}`);
      classifications.set(ticker, classification);
    }
  }
  const compatible = Object.fromEntries(Object.entries(profiles).map(([ticker, profile]) => [ticker, classifyProfile(profile, classifications)]));
  const root = { ...compatible, _meta: { schemaVersion: 2, generator: "node scripts/seed-etfs.mjs", blocked, mappingCoverage: { unavailableBatches } } };
  validateSeed(root);
  const output = `${JSON.stringify(root, null, 2)}\n`;
  const out = "src/data/etf-seed.json";
  if (args.includes("--check")) {
    if (await readFile(out, "utf8") !== output) throw new Error("ETF seed is not reproducible; regenerate from fixtures");
  } else await writeFile(out, output);
  console.log(`Seed: ${Object.keys(profiles).length}/${TARGET_FUNDS.length} funds; blocked=${Object.keys(blocked).join(",")}; missing OpenFIGI batches=${unavailableBatches}`);
}
