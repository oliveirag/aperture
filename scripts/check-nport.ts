import assert from "node:assert/strict";
import { captureFixture, loadFixture, saveFixture, withLiveLock } from "./lib/fixtures";

const targets = "SPY VOO IVV VTI QQQ KRE XLK XLF XLE SMH SOXX VNQ IWM DIA ARKK SCHD VGT XLRE".split(" ");
const fixture = (provider: string, name: string) => `scripts/fixtures/${provider}/${name}.json`;

async function capture() {
  const headers = { "User-Agent": process.env.SEC_USER_AGENT ?? "" };
  const funds = JSON.parse((await loadFixture(fixture("sec-nport", "fund-tickers"))).body);
  for (const ticker of targets) {
    const row = funds.data.find((r: unknown[]) => r[3] === ticker);
    if (!row) { console.log(`${ticker}: no mutual-fund class/series (issuer source required)`); continue; }
    const name = `${ticker.toLowerCase()}-search`;
    try {
      const search = await loadFixture(fixture("sec-edgar", name)).catch(() => captureFixture("sec-edgar", name,
        `https://efts.sec.gov/LATEST/search-index?q=${row[1]}&forms=NPORT-P&dateRange=custom&startdt=2026-01-01&enddt=2026-09-27`, headers));
      const hits = JSON.parse(search.body).hits.hits.map((h: { _source: { period_ending: string; file_date: string; adsh: string } }) => h._source)
        .sort((a: { period_ending: string; file_date: string }, b: { period_ending: string; file_date: string }) => b.period_ending.localeCompare(a.period_ending) || b.file_date.localeCompare(a.file_date));
      if (!hits.length) throw new Error("No NPORT search hits");
      const hit = hits[0];
      const xml = await loadFixture(fixture("sec-nport", `${ticker.toLowerCase()}-nport`)).catch(() => captureFixture("sec-nport", `${ticker.toLowerCase()}-nport`,
        `https://www.sec.gov/Archives/edgar/data/${row[0]}/${hit.adsh.replace(/-/g, "")}/primary_doc.xml`, headers));
      console.log(ticker, xml.retrievedAt, hit.adsh, xml.body.match(/<repPdDate>(.*?)<\/repPdDate>/)?.[1], (xml.body.match(/<invstOrSec>/g) ?? []).length);
    } catch (error) { console.error(ticker, error instanceof Error ? error.message : "capture failed"); process.exitCode = 1; }
  }
}

async function checks() {
  const { resolveFund, parseNport, reconcile } = await import("../src/lib/nport/index");
  const fundFixture = await loadFixture(fixture("sec-nport", "fund-tickers"));
  const fund = resolveFund("QQQ", JSON.parse(fundFixture.body));
  assert.equal(fund?.seriesId, "S000101292");
  assert.equal(fund?.classId, "C000271435");
  assert.equal(resolveFund("SPY", JSON.parse(fundFixture.body)), null);
  const duplicate = JSON.parse(fundFixture.body);
  duplicate.data.push(duplicate.data.find((row: unknown[]) => row[3] === "QQQ"));
  assert.throws(() => resolveFund("QQQ", duplicate), /Ambiguous/);
  const xml = await loadFixture(fixture("sec-nport", "qqq-nport"));
  const parsed = parseNport(xml.body, fund!);
  assert.equal(parsed.asOf, "2026-06-30");
  assert.equal(parsed.positions.length, 105);
  assert.equal(parsed.positions[0].cusip, "G25839104");
  assert.equal(parsed.positions[0].isin, "GB00BDCPN049");
  assert.throws(() => parseNport(xml.body, { ...fund!, seriesId: "S000004310" }), /series/i);
  assert.throws(() => parseNport(xml.body.replace("0.193257295011", "NaN"), fund!), /weight|number/i);
  const report = reconcile(parsed, new Map());
  assert.equal(report.holdings.length, 0);
  assert.ok(report.unmatched.length >= 105);
  assert.ok(Math.abs(report.coverage.accountedWeight - 1) <= 0.005);
  assert.equal(report.coverage.mappedWeight, 0);
  const { parseMappings, secFallback } = await import("../src/lib/nport/mapping");
  const figi = await loadFixture(fixture("openfigi", "aapl-ccep"));
  const mappings = parseMappings(["CUSIP:037833100", "ISIN:GB00BDCPN049"], JSON.parse(figi.body), { kind: "retrieved", provider: "openfigi", endpoint: figi.endpoint, retrievedAt: figi.retrievedAt });
  assert.equal(mappings.get("CUSIP:037833100")?.ticker, "AAPL");
  assert.equal(mappings.get("ISIN:GB00BDCPN049")?.ticker, "CCEP");
  const ambiguous = JSON.parse(figi.body);
  ambiguous[0].data.push({ ...ambiguous[0].data[0], ticker: "OTHER", shareClassFIGI: "different" });
  assert.equal(parseMappings(["CUSIP:037833100", "ISIN:GB00BDCPN049"], ambiguous, mappings.get("CUSIP:037833100")!.provenance).has("CUSIP:037833100"), false);
  assert.throws(() => parseMappings(["CUSIP:037833100"], JSON.parse(figi.body), mappings.get("CUSIP:037833100")!.provenance), /length/i);
  const sec = await loadFixture(fixture("sec-edgar", "equity-tickers"));
  const fallback = secFallback(parsed.positions, JSON.parse(sec.body), { kind: "retrieved", provider: "sec-edgar", endpoint: sec.endpoint, retrievedAt: sec.retrievedAt });
  assert.equal(fallback.get("CUSIP:037833100")?.ticker, "AAPL");
  const { parseTrustSchedule, trustProfile, trustSource } = await import("../src/lib/nport/trust");
  for (const ticker of ["SPY", "DIA"] as const) {
    const filing = await loadFixture(fixture("sec-edgar", `${ticker.toLowerCase()}-trust-n30d`));
    const submissions = await loadFixture(fixture("sec-edgar", `${ticker.toLowerCase()}-trust-submissions`));
    const evidence = trustSource(ticker, filing, submissions);
    const schedule = parseTrustSchedule(ticker, filing.body, evidence);
    assert.equal(schedule.positions.length, ticker === "SPY" ? 503 : 30);
    assert.equal(schedule.netAssets, ticker === "SPY" ? 648531405608 : 42843688951);
    assert.equal(schedule.asOf, ticker === "SPY" ? "2026-03-31" : "2026-04-30");
    assert.equal(schedule.positions.find(p => p.name === "NVIDIA Corp.")?.valueUsd, ticker === "SPY" ? 49143150005 : 1059862785);
    const result = trustProfile(ticker, schedule, new Map(), evidence);
    assert.equal(result.coverage.fullHoldings, true);
    assert.equal(result.coverage.reconciled, true);
    assert.equal(result.holdingsSource.filing?.form, "N-30D");
    assert.equal(result.provider, "sec-edgar");
    assert.equal(result.coverage.mappedWeight, 0);
    assert.ok(result.unmatched.length > schedule.positions.length);
    assert.throws(() => parseTrustSchedule(ticker === "SPY" ? "DIA" : "SPY", filing.body, evidence), /source|identity/);
    const damaged = filing.body.replace(/NVIDIA\s+Corp\./g, "");
    assert.notEqual(damaged, filing.body);
    assert.throws(() => parseTrustSchedule(ticker, damaged, evidence), /holding|schedule|total/i);
    const originalValue = ticker === "SPY" ? "49,143,150,005" : "1,059,862,785";
    const inconsistent = filing.body.replace(originalValue, "1,000,000,000");
    assert.notEqual(inconsistent, filing.body);
    assert.throws(() => parseTrustSchedule(ticker, inconsistent, evidence), /total|balance/i);
    assert.throws(() => parseTrustSchedule(ticker, filing.body, { ...evidence, asOf: "1999-01-01" }), /date/i);
  }
  // Private-only regression checks for the old restricted workbooks. A clean
  // publication branch can omit those bytes and still reproduce the SEC seed.
  if (process.argv.includes("--private-issuer")) {
    const { parseIssuer } = await import("../src/lib/nport/issuer");
    const diaFile = await loadFixture(fixture("issuer-file", "dia-xlsx-base64"));
    const dia = parseIssuer("DIA", diaFile.body, { kind: "retrieved", provider: "issuer-file", endpoint: diaFile.endpoint, retrievedAt: diaFile.retrievedAt });
    assert.equal(dia.asOf, "2026-09-24");
    assert.equal(dia.holdings.length, 30);
    assert.equal(dia.unmatched.find(p => p.name === "US DOLLAR")?.weight, 0.224468 / 100);
    assert.equal(dia.coverage.reconciled, true);
    assert.equal(dia.holdingsSource.provider, "issuer-file");
    assert.equal(dia.holdingsSource.filing, undefined);
    assert.throws(() => parseIssuer("SPY", diaFile.body, dia.holdingsSource), /ticker|source/i);
  }
  const { assertNumericProvenance } = await import("../src/lib/provenance");
  const { getEtfProfile, parseProfile, etfAvailability } = await import("../src/lib/etf");
  for (const ticker of targets) {
    const profile = await getEtfProfile(ticker);
    assert.ok(profile, `${ticker} full-source profile missing`);
    assert.equal(profile.ticker, ticker);
    assert.equal(profile.coverage?.fullHoldings, true);
    assert.equal(profile.coverage?.reconciled, true);
    const sum = profile.holdings.reduce((total, p) => total + p.weight, 0) + profile.unmatched!.reduce((total, p) => total + p.weight, 0);
    assert.ok(Math.abs(sum - 1) <= 0.005, ticker);
    const { provenance, holdingsSource: _source, ...data } = profile;
    void _source;
    assertNumericProvenance(data, provenance!);
    assert.ok(profile.asOf <= profile.holdingsSource!.retrievedAt.slice(0, 10));
    assert.ok(profile.holdingsSource.filing);
    assert.equal(profile.provider, ["SPY", "DIA"].includes(ticker) ? "sec-edgar" : "sec-nport");
    assert.ok(profile.holdings.every(h => typeof h.weight === "number" && h.symbol === h.ticker && h.description === h.name));
  }
  const before = (await getEtfProfile("QQQ"))!;
  assert.equal(before.schemaVersion, 2, "Every sourced record carries the canonical version");
  const { validateSourcedProfile } = await import("../src/lib/nport/contract");
  const validated = validateSourcedProfile("QQQ", before);
  assert.equal(typeof validated.holdings[0].weight, "number");
  assert.equal(validated.holdings[0].symbol, validated.holdings[0].ticker);
  for (const bad of [
    { ...before, schemaVersion: 3 }, { ...before, holdingsSource: undefined },
    { ...before, coverage: undefined }, { ...before, provenance: {} },
    { ...before, ticker: "SPY" },
    { ...before, holdings: [{ ...before.holdings[0], weight: "0.1" }] },
    { ...before, sectors: [{ sector: "Technology", weight: -1 }] },
  ]) {
    assert.throws(() => validateSourcedProfile("QQQ", bad), /Invalid|provenance/i);
    assert.equal(parseProfile("QQQ", bad, "seed"), null, "Malformed sourced data cannot downgrade to legacy");
  }
  assert.equal(parseProfile("QQQ", { holdingsSource: null, holdings: [{ symbol: "AAPL", description: "Apple", weight: "0.1" }] }, "seed"), null);
  assert.equal(parseProfile("QQQ", { holdings: before.holdings }, "seed"), null, "Stripped sourced records cannot downgrade through compatibility aliases");
  assert.equal(parseProfile("QQQ", { holdings: 7 }, "seed"), null);
  assert.equal(parseProfile("QQQ", { holdings: [null] }, "seed"), null);
  assert.ok(validated.sectorCoverage.classifiedWeight > 0);
  assert.ok(validated.sectorCoverage.unclassifiedWeight > 0);
  assert.ok(Math.abs(validated.sectorCoverage.classifiedWeight + validated.sectorCoverage.unclassifiedWeight - validated.coverage.accountedWeight) < 1e-10);
  for (const sector of validated.sectors) {
    const constituents = validated.holdings.filter(h => h.sector === sector.sector);
    assert.ok(constituents.length > 0);
    assert.ok(Math.abs(sector.weight - constituents.reduce((sum, h) => sum + h.weight, 0)) < 1e-10);
    assert.ok(constituents.every(h => h.classification?.source.provider === "sec-edgar"));
  }
  const { validateSeed } = await import("../src/lib/nport/contract");
  const root = (await import("../src/data/etf-seed.json")).default;
  assert.equal(Object.keys(validateSeed(root).profiles).length, 18);
  assert.throws(() => validateSeed({ ...root, _meta: { ...root._meta, schemaVersion: 1 } }), /version/i);
  const voo = (await getEtfProfile("VOO"))!;
  const mcd = voo.holdings.find(h => h.ticker === "MCD")!;
  assert.equal(mcd.classification?.sic, "5812");
  assert.equal(mcd.sector, "Consumer Discretionary");
  assert.ok(mcd.weight > 0);
  const { knownPlan, researchScenario, REFERENCES } = await import("../src/lib/shock/research-model");
  const { table } = researchScenario(knownPlan("oil rises 20%")!, [REFERENCES.oil!]);
  const sectorWeight = voo.sectors.find(s => s.sector === mcd.sector)!.weight;
  const namedClassifiedWeight = voo.holdings.filter(h => h.sector === mcd.sector && table.entities[h.ticker]).reduce((sum, h) => sum + h.weight, 0);
  assert.ok(sectorWeight - namedClassifiedWeight > 0, "A real sourced constituent supports oil-sector residual, independent of legacy Alpha mixes");
  assert.equal(validated.holdings.find(h => h.ticker === "NVDA")?.sector, "Technology");
  assert.equal(validated.holdings.find(h => h.ticker === "GOOGL")?.sector, undefined, "Ambiguous SIC 7370 is not an invented GICS assignment");
  const { classificationsFromSubmissions } = await import("../src/lib/nport/sectors");
  const nvda = await loadFixture(fixture("sec-edgar", "nvda-submissions"));
  const classification = classificationsFromSubmissions(JSON.parse(nvda.body), { kind: "retrieved", provider: "sec-edgar", endpoint: nvda.endpoint, retrievedAt: nvda.retrievedAt });
  assert.equal(classification.get("NVDA")?.sector, "Technology");
  assert.throws(() => classificationsFromSubmissions(JSON.parse(nvda.body), { kind: "retrieved", provider: "sec-edgar", endpoint: "https://data.sec.gov/submissions/CIK0000320193.json", retrievedAt: nvda.retrievedAt }), /identity|source/i);
  const clock = Date.now;
  try {
    Date.now = () => Date.parse(before.holdingsSource!.retrievedAt) + 2 * 86400000;
    const stale = (await getEtfProfile("QQQ"))!;
    assert.equal(stale.holdingsSource?.stale, true);
    assert.equal(stale.holdingsSource?.retrievedAt, before.holdingsSource?.retrievedAt);
    assert.equal(stale.provenance?.["/holdings/0/weight"].stale, true);
    assert.equal(stale.holdings.find(h => h.ticker === "NVDA")?.classification?.source.stale, true);
    stale.holdings[0].weight = 99;
  } finally { Date.now = clock; }
  assert.deepEqual((await getEtfProfile("QQQ"))!.holdings, before.holdings, "Callers must not mutate the committed snapshot");
  assert.equal(await getEtfProfile("NO_SUCH_FUND"), null);
  assert.equal(etfAvailability("NO_SUCH_FUND").available, false);
  assert.equal(parseProfile("TEST", { holdings: [{ symbol: "AAPL", description: "Apple", weight: "Infinity" }] }, "live"), null);
  const { readXml } = await import("../src/lib/nport/xml");
  assert.throws(() => readXml('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>'), /Unsafe/);
  assert.throws(() => readXml("<a><b></a>"), /Mismatched/);
  assert.throws(() => parseNport(xml.body.slice(0, -30), fund!), /XML/);
  // A real iShares attempt returned HTTP 200 HTML instead of holdings. It must
  // never become a successful holdings profile just because the status was OK.
  if (process.argv.includes("--private-issuer")) {
    const wrongContent = await loadFixture(fixture("issuer-file", "ivv-holdings"));
    assert.throws(() => parseNport(wrongContent.body, fund!), /XML|NPORT/);
  }
  const wrongSecContent = await loadFixture(fixture("sec-edgar", "spy-trust-n30d"));
  assert.throws(() => parseNport(wrongSecContent.body, fund!), /XML|NPORT/);
  const badWeight = parseNport(xml.body.replace("0.193257295011", "5.193257295011"), fund!);
  assert.equal(reconcile(badWeight, new Map()).coverage.reconciled, false);
  console.log("NPORT/UIT fixture checks passed: 18 funds, canonical v2, SIC sector residuals, provenance, mapping ambiguity, signed reconciliation and hostile inputs");
}

async function captureIssuer() {
  throw new Error("SSGA capture disabled: site terms restrict public redistribution. Use SEC --capture-trusts; do not publish the private workbook history.");
}
async function liveChecks() {
  await withLiveLock(async () => {
    const { resolveFund, parseNport } = await import("../src/lib/nport/index");
    const { parseMappings } = await import("../src/lib/nport/mapping");
    const { parseTrustSchedule, trustSource } = await import("../src/lib/nport/trust");
    const headers = { "User-Agent": process.env.SEC_USER_AGENT ?? "" };
    if (!/\S+@\S+/.test(headers["User-Agent"])) throw new Error("Live SEC check requires SEC_USER_AGENT contact");
    const funds = JSON.parse((await loadFixture(fixture("sec-nport", "fund-tickers"))).body);
    for (const ticker of targets.filter(t => !["SPY", "DIA"].includes(t))) {
      const recorded = await loadFixture(fixture("sec-nport", `${ticker.toLowerCase()}-nport`));
      const identity = resolveFund(ticker, funds)!;
      assert.match(recorded.endpoint, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/primary_doc\.xml$/);
      await new Promise(resolve => setTimeout(resolve, 150));
      const response = await fetch(recorded.endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(30000), cache: "no-store" });
      assert.equal(response.status, 200, `${ticker} live SEC response`);
      const actual = parseNport(await response.text(), identity);
      const expected = parseNport(recorded.body, identity);
      assert.equal(actual.positions.length, expected.positions.length);
      assert.equal(actual.netAssets, expected.netAssets);
      console.log(`LIVE sec-nport ${ticker} asOf=${actual.asOf} positions=${actual.positions.length} netAssets=${actual.netAssets} retrievedAt=${new Date().toISOString()}`);
    }
    for (const ticker of ["SPY", "DIA"] as const) {
      const recorded = await loadFixture(fixture("sec-edgar", `${ticker.toLowerCase()}-trust-n30d`));
      const submissions = await loadFixture(fixture("sec-edgar", `${ticker.toLowerCase()}-trust-submissions`));
      const source = trustSource(ticker, recorded, submissions);
      const expected = parseTrustSchedule(ticker, recorded.body, source);
      await new Promise(resolve => setTimeout(resolve, 150));
      const response = await fetch(recorded.endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(30000), cache: "no-store" });
      assert.equal(response.status, 200);
      const retrievedAt = new Date().toISOString();
      const actual = parseTrustSchedule(ticker, await response.text(), { ...source, retrievedAt });
      assert.deepEqual(actual, expected);
      console.log(`LIVE sec-edgar ${ticker} form=N-30D asOf=${actual.asOf} positions=${actual.positions.length} netAssets=${actual.netAssets} retrievedAt=${retrievedAt}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2600));
    const endpoint = "https://api.openfigi.com/v3/mapping";
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ idType: "ID_CUSIP", idValue: "037833100", exchCode: "US" }]), redirect: "error", signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    const retrievedAt = new Date().toISOString();
    const mapped = parseMappings(["CUSIP:037833100"], await response.json(), { kind: "retrieved", provider: "openfigi", endpoint, retrievedAt });
    assert.equal(mapped.get("CUSIP:037833100")?.ticker, "AAPL");
    console.log(`LIVE openfigi CUSIP:037833100=AAPL retrievedAt=${retrievedAt}`);
  });
}
async function adoptSubmissions() {
  // Read-only reuse of B's exact captures; saveFixture preserves body/metadata and
  // recalculates the same digest. No fixture synthesis or B worktree writes.
  const directory = process.argv[process.argv.indexOf("--adopt-submissions") + 1];
  if (!directory?.startsWith("/")) throw new Error("Absolute B SEC fixture directory required");
  for (const name of "amzn brk-b bxp googl hckt jpm meta msft nvda rddt td tsm wal xom zion".split(" ")) {
    const original = await loadFixture(`${directory}/${name}-submissions.json`);
    let copied;
    try { copied = await loadFixture(fixture("sec-edgar", `${name}-submissions`)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      copied = await saveFixture(fixture("sec-edgar", `${name}-submissions`), original);
    }
    assert.deepEqual(copied, original);
    console.log(`Reused ${name} ${copied.retrievedAt} sha256=${copied.sha256}`);
  }
}
async function captureTrusts() {
  const headers = { "User-Agent": process.env.SEC_USER_AGENT ?? "" };
  for (const [ticker, cik] of [["spy", "884394"], ["dia", "1041130"]]) {
    const name = `${ticker}-trust-submissions`;
    const f = await captureFixture("sec-edgar", name, `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`, headers);
    const recent = JSON.parse(f.body).filings.recent;
    const index = recent.form.findIndex((form: string) => form === "N-30D");
    if (index < 0) throw new Error(`${ticker}: no N-30D schedule`);
    const endpoint = `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[index].replace(/-/g, "")}/${recent.primaryDocument[index]}`;
    const report = await captureFixture("sec-edgar", `${ticker}-trust-n30d`, endpoint, headers);
    console.log(`TRUST ${ticker} form=${recent.form[index]} accession=${recent.accessionNumber[index]} reportDate=${recent.reportDate[index]} filed=${recent.filingDate[index]} retrievedAt=${report.retrievedAt} bytes=${report.body.length}`);
  }
}
async function main() {
  if (process.argv.includes("--adopt-submissions")) await adoptSubmissions();
  else if (process.argv.includes("--capture-trusts")) await captureTrusts();
  else if (process.argv.includes("--capture")) await capture();
  else if (process.argv.includes("--capture-issuer")) await captureIssuer();
  else if (process.argv.includes("--live")) await liveChecks();
  else await checks();
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "NPORT check failed"); process.exitCode = 1; });
