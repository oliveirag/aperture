// Real SEC fixtures only. --capture records missing files; --live never records synthetic cache entries.
import assert from "node:assert/strict";
import { assertProvenance } from "../src/lib/provenance";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureFixture, loadFixture, withLiveLock } from "./lib/fixtures";

export const FILERS = [
  ["aapl", "0000320193"], ["msft", "0000789019"], ["nvda", "0001045810"],
  ["amzn", "0001018724"], ["googl", "0001652044"], ["meta", "0001326801"],
  ["tsm", "0001046179"], ["bxp", "0001037540"], ["zion", "0000109380"],
  ["wal", "0001212545"], ["xom", "0000034088"], ["jpm", "0000019617"],
  ["brk-b", "0001067983"], ["hckt", "0001057379"], ["rddt", "0001713445"],
] as const;
const dir = path.join(process.cwd(), "scripts/fixtures/sec-edgar");
export const fixturePath = (name: string, provider = "sec-edgar") => path.join(process.cwd(), "scripts/fixtures", provider, `${name}.json`);
async function recorded(name: string, url: string, provider: "sec-edgar" | "sec-xbrl" = "sec-edgar") {
  const file = fixturePath(name, provider);
  try { await access(file); return await loadFixture(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const fixture = await captureFixture(provider, name, url, { "User-Agent": process.env.SEC_USER_AGENT ?? "" });
  console.log("CAPTURE", name, fixture.retrievedAt, fixture.sha256);
  return fixture;
}
async function capture() {
  for (const [symbol, cik] of FILERS) {
    const f = symbol === "aapl" ? await loadFixture(path.join(dir, "aapl-submissions-2026-09-27.json")) : await recorded(`${symbol}-submissions`, `https://data.sec.gov/submissions/CIK${cik}.json`);
    const data = JSON.parse(f.body);
    const recent = data.filings.recent;
    const i = recent.form.findIndex((form: string) => form === (symbol === "tsm" ? "20-F" : "10-K"));
    assert(i >= 0, `${symbol} annual filing`);
    const accession = recent.accessionNumber[i];
    await recorded(`${symbol}-annual`, `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${recent.primaryDocument[i]}`);
    if (symbol === "bxp") {
      const j = recent.form.findIndex((form: string, n: number) => form === "8-K" && recent.items[n]?.includes("1.01"));
      assert(j >= 0);
      await recorded("bxp-item-1.01", `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${recent.accessionNumber[j].replace(/-/g, "")}/${recent.primaryDocument[j]}`);
    }
    if (symbol === "aapl") {
      for (const [form, name] of [["10-Q", "quarterly"], ["8-K", "current"]]) {
        const j = recent.form.indexOf(form);
        await recorded(`aapl-${name}`, `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${recent.accessionNumber[j].replace(/-/g, "")}/${recent.primaryDocument[j]}`);
      }
      for (const item of ["5.02", "8.01"]) {
        const j = recent.form.findIndex((form: string, n: number) => form === "8-K" && recent.items[n]?.includes(item));
        assert(j >= 0, `AAPL ${item} current report exists`);
        await recorded(`aapl-item-${item}`, `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${recent.accessionNumber[j].replace(/-/g, "")}/${recent.primaryDocument[j]}`);
      }
      const short = recent.form.findIndex((form: string, n: number) => form === "10-Q" && recent.reportDate[n] === "2025-12-27");
      assert(short >= 0);
      await recorded("aapl-quarterly-short", `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${recent.accessionNumber[short].replace(/-/g, "")}/${recent.primaryDocument[short]}`);
      const history = data.filings.files[0];
      await recorded("aapl-history", `https://data.sec.gov/submissions/${history.name}`);
    }
  }
  const td = await recorded("td-submissions", "https://data.sec.gov/submissions/CIK0000947263.json");
  const tdRows = JSON.parse(td.body).filings.recent;
  const tdIndex = tdRows.form.indexOf("40-F");
  assert(tdIndex >= 0);
  await recorded("td-annual", `https://www.sec.gov/Archives/edgar/data/947263/${tdRows.accessionNumber[tdIndex].replace(/-/g, "")}/${tdRows.primaryDocument[tdIndex]}`);
  for (const [symbol, cik] of [FILERS[0], FILERS[6], FILERS[8]]) {
    await recorded(`${symbol}-companyfacts`, `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, "sec-xbrl");
  }
  await recorded("revenue-frame", "https://data.sec.gov/api/xbrl/frames/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax/USD/CY2025Q1.json", "sec-xbrl");
  await recorded("taiwan-search", "https://efts.sec.gov/LATEST/search-index?q=Taiwan&dateRange=custom&startdt=2024-01-01&enddt=2026-09-27&ciks=0001045810&forms=10-K");
}
async function inspect() {
  const { htmlToText, extractItem } = await import("../src/lib/sec");
  for (const [symbol] of FILERS.filter(([s]) => !process.env.SEC_INSPECT || s === process.env.SEC_INSPECT)) {
    const f = await loadFixture(fixturePath(`${symbol}-${process.env.SEC_INSPECT_FORM ?? "annual"}`));
    const text = htmlToText(f.body);
    console.log("STUB", symbol, extractItem(text, "10-K", "7").text.slice(0, 600), extractItem(text, "10-K", "7A").text.slice(0, 600));
    console.log(symbol, text.length, [...text.matchAll(/(?:^|\n)[ \t]*(?:ITEM\s*\d+[^\n]{0,150}|(?:1A|7A|7|1)\.[^\n]{0,100})/gi)].map(m => [m.index, m[0]]));
  }
}
async function fixtureChecks() {
  process.env.APERTURE_CACHE_DIR = await mkdtemp(path.join(tmpdir(), "aperture-sec-"));
  const sec = await import("../src/lib/sec");
  const aapl = await loadFixture(path.join(dir, "aapl-submissions-2026-09-27.json"));
  assert.equal(typeof sec.parseFilings, "function", "SEC must expose the same pure filing parser used by live history");
  const filings = sec.parseFilings(JSON.parse(aapl.body).filings.recent, "0000320193", { endpoint: aapl.endpoint, retrievedAt: aapl.retrievedAt });
  assert(filings.some(f => f.form === "8-K" && f.items.length > 0), "8-K item numbers retained");
  assert(filings.some(f => f.form === "10-K"));
  console.log("SEC submissions forms/items: PASS", filings.length);
  const history = await loadFixture(fixturePath("aapl-history"));
  const older = sec.parseFilings(JSON.parse(history.body), "0000320193", history);
  assert(older.some(f => f.form.endsWith("/A")), "historical amendments retained");
  const all = sec.dedupeFilings([...filings, ...older, ...filings]);
  assert.equal(new Set(all.map(f => f.accession)).size, all.length);
  assert(sec.latestFilingPair(all, "10-K"));
  assert.throws(() => sec.normalizeCik("../1"));
  // Manually reviewed item heading offsets in htmlToText output, including the NEXT heading.
  // These are independent golden boundaries, not snapshots generated by extractItem.
  const golden: Record<string, number[]> = {
    aapl: [8533, 24544, 92603, 104075, 122115, 125139], msft: [7498, 48733, 129972, 141833, 193510, 195482],
    nvda: [10269, 58360, 172784, 183189, 217218, 221456], amzn: [5903, 19381, 79842, 85919, 132051, 138196],
    googl: [10890, 34597, 119542, 128671, 180903, 188842], meta: [18257, 42768, 237844, 287354, 347699, 353643],
    bxp: [19149, 89830, 187482, 218560, 353419, 358985], zion: [16033, 50959, 105540, 117978, 274524, 274758],
    wal: [13125, 55128, 142963, 156029, 290429, 299998], xom: [5774, 12391, 48082, 93100, 93367, 93804],
    jpm: [6855, 46006, 158215, 163377, 163774, 164047], "brk-b": [6782, 133202, 155000, 174754, 295419, 296948],
    hckt: [8696, 28195, 61060, 71633, 100386, 101915], rddt: [16123, 51809, 257353, 267633, 312108, 314660],
  };
  for (const [symbol] of FILERS) {
    const fixture = await loadFixture(fixturePath(`${symbol}-annual`));
    const text = sec.htmlToText(fixture.body);
    const specs: [string, number, number][] = symbol === "tsm"
      ? [["3", 15714, 76802], ["4", 76802, 130465], ["5", 130506, 167015], ["11", 308193, 313737]]
      : [["1", golden[symbol][0], golden[symbol][1]], ["1A", golden[symbol][1], golden[symbol][2]], ["7", golden[symbol][3], golden[symbol][4]], ["7A", golden[symbol][4], golden[symbol][5]]];
    for (const [item, start, end] of specs) {
      const section = sec.extractItem(text, symbol === "tsm" ? "20-F" : "10-K", item);
      assert(section.found, `${symbol} Item ${item} located`);
      assert.equal(section.start, start + 1, `${symbol} Item ${item} starts at body not TOC`);
      assert.equal(section.text, text.slice(start, end).trim(), `${symbol} Item ${item} exact golden boundary`);
      assert.equal(text.slice(section.start!, section.end!), section.text);
      if (["xom", "jpm"].includes(symbol) && ["7", "7A"].includes(item)) assert.equal(section.status, "incorporated-by-reference", `${symbol} ${item} stub is labeled`);
    }
  }
  console.log("SEC golden boundaries: PASS (15 real filers, 60 sections)");
  const quarter = sec.htmlToText((await loadFixture(fixturePath("aapl-quarterly"))).body);
  const qRisk = sec.extractItem(quarter, "10-Q", "1A", "II");
  assert(qRisk.found && qRisk.text === quarter.slice(58776, 77859).trim(), "10-Q Part II risk golden boundaries");
  assert(sec.extractItem(quarter, "10-Q", "2", "I").found, "10-Q Part I MD&A");
  const current = sec.htmlToText((await loadFixture(fixturePath("aapl-current"))).body);
  assert.equal(sec.extractItem(current, "8-K", "2.02").text, current.slice(2298, 2938).trim(), "8-K earnings item golden bounds");
  for (const [name, item] of [["aapl-item-5.02", "5.02"], ["aapl-item-8.01", "8.01"], ["bxp-item-1.01", "1.01"]]) {
    const text = sec.htmlToText((await loadFixture(fixturePath(name))).body);
    const section = sec.extractItem(text, "8-K", item);
    assert(section.found && text.includes(section.text), `${name} real 8-K item`);
  }
  const shortText = sec.htmlToText((await loadFixture(fixturePath("aapl-quarterly-short"))).body);
  const shortRisk = sec.extractItem(shortText, "10-Q", "1A", "II");
  assert(shortRisk.found && shortRisk.text.length < 2000, "short 10-Q Part II risk updates must not disappear");
  const foreign = await loadFixture(fixturePath("td-submissions"));
  const foreignFilings = sec.parseFilings(JSON.parse(foreign.body).filings.recent, "0000947263", foreign);
  assert(foreignFilings.some(f => f.form === "40-F"));
  const foreignText = sec.htmlToText((await loadFixture(fixturePath("td-annual"))).body);
  assert.equal(sec.extractItem(foreignText, "40-F", "1A").status, "unsupported", "40-F never misclassified as a domestic item layout");
  for (const symbol of ["aapl", "tsm", "zion"]) {
    const fixture = await loadFixture(fixturePath(`${symbol}-companyfacts`, "sec-xbrl"));
    const data = JSON.parse(fixture.body);
    const points = sec.parseCompanyFacts(data, fixture);
    assert(points.some(p => p.periodType === "instant") && points.some(p => p.periodType === "duration"));
    assert(points.some(p => !p.frame), "unframed comparative facts retained");
    for (const p of points) assertProvenance(p.provenance);
    const newest = sec.latestReported(points);
    const reversed = sec.latestReported([...points].reverse());
    assert.equal(reversed.length, newest.length);
    newest.forEach((p, i) => assert.deepEqual(reversed[i], p, "restatement choice independent of array order"));
    const restated = newest.find(p => points.some(q => q.tag === p.tag && q.unit === p.unit && q.start === p.start && q.end === p.end && q.value !== p.value && q.filedAt < p.filedAt));
    assert(restated, `${symbol} real restatement/split comparative fixture`);
    const versions = points.filter(p => p.tag === restated.tag && p.unit === restated.unit && p.start === restated.start && p.end === restated.end);
    assert.equal(restated.filedAt, versions.map(p => p.filedAt).sort().at(-1), "newest filed comparative wins");
    assert(versions.some(p => p.value !== restated.value), "genuine changed comparative, not manufactured test data");
    const facts = sec.fundamentalsFromFacts(data, fixture)!;
    assert(facts.annualRevenue!.length > 0 && facts.annualNetIncome!.length > 0 && facts.operatingCashFlow.length > 0, `${symbol} annual metrics`);
    if (symbol === "tsm") assert.equal(facts.revenue.length, 0, "20-F annual-only facts never labeled quarters");
    else assert(facts.revenue.length > 0 && facts.netIncome.length > 0, `${symbol} quarterly metrics`);
    if (symbol === "zion") {
      assert.notEqual(facts.revenue.at(-1)?.tag, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "bank total net revenue must not be the ASC606 fee-only subtotal");
    }
    for (const field of [facts.revenue, facts.netIncome, facts.operatingIncome!, facts.capex!, facts.eps!, facts.operatingCashFlow]) {
      assert.equal(new Set(field.map(p => p.end)).size, field.length);
      for (const p of field) { assert(p.tag && p.unit && p.provenance && p.start); assertProvenance(p.provenance); }
    }
    assert(facts.eps!.every(p => p.provenance?.kind === "retrieved"), "EPS never derived by subtraction");
    if (symbol === "aapl") {
      assert(facts.revenue.some(p => p.provenance?.kind === "computed" && p.provenance.inputs.length === 2), "FY minus nine-month YTD derives Q4 with both inputs");
      const partial = structuredClone(data);
      delete partial.facts["us-gaap"].LongTermDebtNoncurrent;
      assert.equal(sec.fundamentalsFromFacts(partial, fixture)?.debt, null, "missing debt component must not become a zero-valued component");
      for (const list of [facts.revenue, facts.operatingCashFlow]) for (const p of list) assert(!("body" in p.provenance!), "fixture metadata is never spread into numeric provenance");
    }
    assert.equal(facts.segments?.status, "unavailable", "no invented companyfacts segments");
    const last = facts.revenue.at(-1) ?? facts.annualRevenue?.at(-1);
    console.log("SEC XBRL PASS", symbol, last?.value, last?.unit, last?.end, last?.accn, fixture.retrievedAt);
  }
  const frame = await loadFixture(fixturePath("revenue-frame", "sec-xbrl"));
  const rows = sec.parseFrame(JSON.parse(frame.body), frame);
  assert(rows.some(p => p.cik === "0000320193"));
  assert(rows.every(p => p.form === null), "frames omit form; do not invent it");
  const search = await loadFixture(fixturePath("taiwan-search"));
  const results = sec.parseFilingSearch(JSON.parse(search.body), search);
  assert(results.hits.length > 0 && results.hits.every(h => h.cik === "0001045810"));
  assert(results.hits.every(h => h.evidenceStatus === "document-match-not-verified-quote"));
  console.log("SEC frames/search: PASS", rows.length, results.hits.length);
  const raw = await loadFixture(fixturePath("aapl-annual"));
  const annual = filings.find(f => f.form === "10-K")!;
  await assert.rejects(sec.filingText({ ...annual, url: "https://example.com/" }), /invalid/);
  await assert.rejects(sec.filingText({ ...annual, url: annual.indexUrl }), /unavailable/);
  assert.throws(() => sec.filingSearchUrl({ query: "Taiwan", ciks: ["../123"], startDate: "2025-01-01", endDate: "2026-01-01" }));
  assert.equal(typeof sec.parseSegmentRevenue, "function", "inline-XBRL tagged segment parser");
  const segments = sec.parseSegmentRevenue(raw.body, annual, raw);
  assert.equal(segments.status, "available");
  assert(segments.facts.length > 5);
  const latestSegments = segments.facts.filter(p => p.end === annual.reportDate && p.dimensions.length === 2 && p.dimensions.some(d => d.axis === "us-gaap:StatementBusinessSegmentsAxis"));
  assert.equal(latestSegments.length, 5, "five real Apple reportable segments");
  assert.equal(latestSegments.reduce((sum, p) => sum + p.value, 0), 416161000000, "Apple FY2025 segment revenue reconciles to reported consolidated revenue");
  for (const p of latestSegments) assertProvenance(p.provenance);
  const geographical = segments.facts.filter(p => p.end === annual.reportDate && p.dimensions.length === 1 && p.dimensions[0].axis === "srt:StatementGeographicalAxis");
  assert.equal(geographical.length, 3);
  assert.equal(geographical.reduce((sum, p) => sum + p.value, 0), 416161000000);
  console.log("SEC tagged segments/geography: PASS", latestSegments.map(p => [p.dimensions.find(d => d.axis === "us-gaap:StatementBusinessSegmentsAxis")!.member, p.value]));
}
async function liveChecks() {
  await withLiveLock(async () => {
    const sec = await import("../src/lib/sec");
    const filings = await sec.listFilingHistory("0000320193");
    assert(filings.some(f => f.filedAt < "2010-01-01"));
    const f = await sec.fundamentals("0000320193");
    assert(f?.revenue.length);
    console.log("LIVE SEC", new Date().toISOString(), "AAPL", filings.length, "filings; earliest", filings.at(-1)?.filedAt, "revenue", JSON.stringify(f.revenue.at(-1)));
    const annual = filings.find(f => f.form === "10-K")!;
    const text = await sec.filingText(annual);
    assert(sec.extractItem(text, "10-K", "1A").found);
    const segments = await sec.filingSegments(annual);
    assert.equal(segments.status, "available");
    console.log("LIVE segments", new Date().toISOString(), annual.accession, segments.facts.length, "tagged facts");
    const search = await sec.searchFilingEvidence({ query: "Taiwan", ciks: ["0001045810"], forms: ["10-K"], startDate: "2024-01-01", endDate: "2026-09-27" });
    assert(search.evidence.length > 0 && search.evidence.every(e => e.quoteVerified));
    console.log("LIVE EFTS", search.provenance.retrievedAt, search.total, "matches", search.evidence.map(e => ({ accession: e.filing.accession, url: e.url, quoteVerified: e.quoteVerified, quote: e.quote })));
    const frame = await sec.xbrlFrame("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "CY2025Q1");
    assert(frame.some(p => p.cik === "0000320193"));
    console.log("LIVE frame", new Date().toISOString(), frame.length, "companies", frame.find(p => p.cik === "0000320193"));
  });
}
if (process.argv[1]?.endsWith("check-sec.ts")) {
  const run = process.argv.includes("--capture") ? capture : process.argv.includes("--inspect") ? inspect : process.argv.includes("--live") ? liveChecks : fixtureChecks;
  run().catch(error => { console.error(error); process.exitCode = 1; });
}
