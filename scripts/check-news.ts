// Offline: node --import tsx scripts/check-news.ts. --live uses the shared provider lock.
import assert from "node:assert/strict";
import { loadFixture, withLiveLock } from "./lib/fixtures";
import { assertProvenance } from "../src/lib/provenance";
import { parseFinnhubNews, parseSecAtom, parseSecSubmissions, parseGdeltNews } from "../src/lib/news/parsers";
import { deduplicateNews, forHeldTickers, isPromoOrOpinion, safeArticleUrl } from "../src/lib/news/normalize";
import { getFinnhubNews, getSecCurrentEvents, getSecCompanyEvents, getMacroEvents, heldTickerFeed } from "../src/lib/news/feeds";
import { adaptCompanyNews, sourceEvidence } from "../src/lib/news/parsers";

async function main() {
  if (process.argv.includes("--live")) {
    await withLiveLock(async () => {
      let failed = false;
      const selected = process.argv.find(arg => arg.startsWith("--provider="))?.slice("--provider=".length);
      if (selected && !["finnhub", "sec-edgar", "gdelt"].includes(selected)) throw new Error("Unknown news provider selection");
      for (const [name, run] of [
        ["finnhub AAPL", () => getFinnhubNews("AAPL")],
        ["sec-edgar AAPL 8-K", () => getSecCompanyEvents("0000320193")],
        ["sec-edgar current Atom", () => getSecCurrentEvents({ "0001405513": ["UNL"] })],
        ["gdelt macro", () => getMacroEvents()],
      ] as const) {
        if (selected && !name.startsWith(selected + " ")) continue;
        try {
          const feed = await run();
          assert.ok(feed.items.length, `${name}: no usable events`);
          for (const item of feed.items) assertProvenance(item.provenance);
          const first = feed.items[0];
          console.log(JSON.stringify({ name, status: "ok", count: feed.items.length, retrievedAt: feed.provenance.retrievedAt, headline: first.headline, publishedAt: first.publishedAt, observedAt: first.observedAt, url: first.url }));
        } catch (error) { failed = true; console.error(`${new Date().toISOString()} ${name} BLOCKED: ${(error as Error).message}`); }
      }
      if (failed) throw new Error("Live news check has blocked providers (not a pass)");
    });
    return;
  }
  // Real provider captures only; mutations below are explicit adversarial inputs, not fixtures.
  const fn = await loadFixture("scripts/fixtures/finnhub/news-aapl.json");
  const sec = await loadFixture("scripts/fixtures/sec-edgar/news-aapl-submissions.json");
  const atom = await loadFixture("scripts/fixtures/sec-edgar/news-current-8k.json");
  const raw: unknown[] = JSON.parse(fn.body);
  const news = parseFinnhubNews(raw, "AAPL", fn);
  assert.ok(news.length > 0 && news.length < raw.length, "filter actual promotional Finnhub stories");
  assert.ok(news.every(n => n.tickers.includes("AAPL") && n.publishedAt && n.provenance.retrievedAt === fn.retrievedAt));
  assert.ok(!news.some(n => /Investment Split Between Alphabet|Stocks That I'm Buying Now/.test(n.headline)));
  assert.equal(parseFinnhubNews([{ ...(raw[0] as object), headline: "Company announces quarterly results", datetime: NaN }], "AAPL", fn).length, 0);
  assert.throws(() => parseFinnhubNews(raw, "AAPL", { ...fn, endpoint: "https://attacker.example/api/v1/company-news" }));
  assert.throws(() => parseFinnhubNews({ error: "denied" }, "AAPL", fn));
  assert.throws(() => parseFinnhubNews(raw, "AAPL", { ...fn, retrievedAt: "2026-02-30T00:00:00Z" }));
  const filings = parseSecSubmissions(JSON.parse(sec.body), sec);
  assert.ok(filings.length > 0);
  assert.ok(filings.every(n => n.eventType === "filing-8k" && n.tickers.includes("AAPL") && n.provenance.filing?.cik === "0000320193"));
  const current = parseSecAtom(atom.body, atom, { "0001405513": ["UNL"] });
  assert.ok(current.length > 0);
  assert.equal(current[0].headline, "8-K - United States 12 Month Natural Gas Fund, LP (0001405513) (Filer)");
  assert.equal(current[0].publishedAt, "2026-09-25T21:30:12.000Z");
  assert.deepEqual(current[0].tickers, ["UNL"]);
  assert.throws(() => parseSecAtom('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + atom.body, atom));
  assert.equal(parseSecAtom(atom.body.replaceAll("https://www.sec.gov/Archives/", "https://evil.example/Archives/"), atom).length, 0);
  assert.throws(() => parseSecSubmissions({ error: "blocked" }, sec));
  assert.throws(() => parseSecSubmissions(JSON.parse(sec.body), { ...sec, endpoint: "https://data.sec.gov/submissions/CIK0000000001.json" }));
  assert.throws(() => parseSecAtom(atom.body, { ...atom, endpoint: "https://www.sec.gov.evil.example/cgi-bin/browse-edgar" }));
  assert.throws(() => parseGdeltNews({ error: "429" }, { endpoint: "https://api.gdeltproject.org/api/v2/doc/doc", retrievedAt: fn.retrievedAt }));
  const stale = parseFinnhubNews(raw, "AAPL", { ...fn, stale: true });
  assert.ok(stale.every(n => n.provenance.stale && n.provenance.retrievedAt === fn.retrievedAt));
  assert.deepEqual(adaptCompanyNews(JSON.parse(fn.body), "AAPL", fn), news);
  const factual = { ...(raw[0] as object), headline: "Company announces quarterly results" };
  for (const datetime of [Infinity, 0, -1, Number.MAX_SAFE_INTEGER, Date.parse(fn.retrievedAt) / 1000 + 86400]) assert.deepEqual(parseFinnhubNews([{ ...factual, datetime }], "AAPL", fn), []);
  assert.deepEqual(parseFinnhubNews([{ ...factual, url: "javascript:alert(1)" }], "AAPL", fn), []);
  for (const n of [...news, ...filings, ...current]) assertProvenance(n.provenance);
  for (const title of ["Opinion: Taiwan policy", "Sponsored: a better portfolio", "Should you buy Apple?", "3 stocks to buy now", "This stock could make you a millionaire", "My top pick for 2027", "Apple: A Strong Buy", "Apple price target raised"]) assert.equal(isPromoOrOpinion(title), true, title);
  assert.equal(isPromoOrOpinion("Apple reports quarterly earnings and announces dividend"), false);
  assert.equal(isPromoOrOpinion("Apple quarterly commentary", "SeekingAlpha"), true);
  assert.equal(isPromoOrOpinion("Apple quarterly commentary", "The MotleyFool"), true);
  assert.equal(isPromoOrOpinion("Intuit vs. Oracle: Which Technology Stock Is a Better Buy in 2026?"), true, "actual latest Finnhub headline is stock-picking, not news");
  assert.ok(!news.some(n => /Which Technology Stock Is a Better Buy/.test(n.headline)));
  for (const url of ["javascript:alert(1)", "http://news.example/a", "https://user:pass@news.example/a", "https://127.0.0.1/a", "https://localhost/a", "https://[::1]/a", "https://news.example:8443/a"]) assert.equal(safeArticleUrl(url), null);
  assert.equal(safeArticleUrl("https://news.example/story?id=12&utm_source=x&token=secret#top"), "https://news.example/story?id=12");
  const first = news[0];
  const duplicate = { ...first, url: first.url + "&utm_source=test" };
  assert.equal(deduplicateNews([first, duplicate]).length, 1);
  const near = { ...first, id: "adversarial-distinct-url", url: "https://news.example/another", headline: first.headline + " — report" };
  assert.equal(deduplicateNews([first, near]).length, 1);
  const reverse = { ...first, id: "adversarial-opposite-url", url: "https://news.example/opposite", headline: "Not " + first.headline };
  assert.equal(deduplicateNews([first, reverse]).length, 2, "negation changes are not duplicates");
  assert.deepEqual(forHeldTickers([...news, ...current], ["UNL"]).map(n => n.id), [current[0].id]);
  assert.equal(deduplicateNews([first, { ...near, tickers: ["OTHER"] }]).length, 2, "near-headline matching must not merge unrelated issuers");
  assert.equal(deduplicateNews([first, { ...near, publishedAt: "2020-01-01T00:00:00Z" }]).length, 2, "recurring headlines on distant dates remain distinct");
  assert.equal(deduplicateNews([first, { ...near, headline: first.headline + " 123" }]).length, 2, "numeric revisions remain distinct");
  const combined = await heldTickerFeed(["AAPL"], [
    { name: "finnhub", load: async () => ({ items: news, provenance: sourceEvidence("finnhub", fn) }) },
    { name: "gdelt", load: async () => { throw new Error("DO NOT LEAK PRIVATE ERROR"); } },
  ]);
  assert.equal(combined.items.length, news.length);
  assert.deepEqual(combined.issues, [{ source: "gdelt", status: "unavailable", message: "News source unavailable; no substitute generated" }]);
  await assert.rejects(getFinnhubNews("../../secret"), /Invalid/);
  await assert.rejects(getSecCompanyEvents("../../secret"), /Invalid/);
  try {
    const gdelt = await loadFixture("scripts/fixtures/gdelt/news-macro.json");
    const macro = parseGdeltNews(JSON.parse(gdelt.body), gdelt);
    assert.ok(macro.length > 0);
    assert.ok(macro.every(n => n.publishedAt === null && n.observedAt && n.tickers.length === 0 && n.eventType === "macro"));
    for (const n of macro) assertProvenance(n.provenance);
    console.log(`GDELT real fixture: ${macro.length} stories; seen time is NOT publication time`);
  } catch (error) {
    // Missing captured response is explicitly blocked; never invent a provider-shaped fixture.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    console.log("GDELT fixture BLOCKED: capture unavailable; parser not fixture-verified");
    if (!process.argv.includes("--available-fixtures")) process.exitCode = 1;
  }
  console.log(`Available real-fixture checks OK: ${news.length} Finnhub, ${filings.length} company 8-Ks, ${current.length} Atom entries; URL/time/filter/dedup checks. Missing providers remain blocked.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
