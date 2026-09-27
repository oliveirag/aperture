import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadFixture, withLiveLock } from "./lib/fixtures";
import { FILERS, fixturePath } from "./check-sec";

async function check() {
  if (!process.argv.includes("--live")) process.env.APERTURE_CACHE_DIR = await mkdtemp(path.join(tmpdir(), "aperture-quotes-"));
  const sec = await import("../src/lib/sec");
  const verify = await import("../src/lib/radar/verify");
  const { sentencesOf } = await import("../src/lib/radar/text-diff");
  assert.equal(typeof verify.sourceQuote, "function", "render source slices, not normalized model wording");
  assert.throws(() => verify.parseProposed({ changes: [{ kind: "new", label: "Exposure increased 25%", severity: "low" }] }), /numeric claim/, "Gemini-authored numeric claims are refused");
  const checkText = (text: string, form: "10-K" | "20-F", name: string) => {
    const section = sec.extractSection(text, form);
    assert(section.found);
    const sentences = sentencesOf(section.text).filter(s => s.text.length >= 50 && s.text.length < 450).slice(0, 12);
    assert(sentences.length > 0);
    for (const s of sentences) {
      const proposed = s.text.toUpperCase().replace(/\s+/g, " ");
      const quote = verify.sourceQuote(proposed, text);
      assert(quote && text.includes(quote), `${name} rendered quote must be an exact source slice`);
      const changes = verify.verifyChanges([{ kind: "new", label: name, summary: "", category: "", severity: "low", latestExcerpt: proposed, priorExcerpt: null, keyPhrases: [] }], text, "");
      assert.equal(changes.kept.length, 1);
      assert.equal(changes.kept[0].current, quote, "verifier must render the source spelling/punctuation/spacing");
      assert.equal(verify.sourceQuote(`${s.text} unsupported invented continuation`, text), null);
      assert.equal(verify.verifyChanges([{ kind: "new", label: name, summary: "", category: "", severity: "low", latestExcerpt: s.text, priorExcerpt: null, keyPhrases: [] }], text, text).kept.length, 0);
    }
    return sentences.length;
  };
  if (process.argv.includes("--live")) {
    await withLiveLock(async () => {
      const pair = sec.filingPair(await sec.listFilings("0000320193"));
      assert(pair);
      const text = await sec.filingText(pair.latest);
      const count = checkText(text, "10-K", "AAPL");
      console.log("LIVE exact quotes PASS", new Date().toISOString(), pair.latest.url, count);
    });
  } else {
    let count = 0;
    const { filingFactsFromText } = await import("../src/lib/ic/facts");
    const { passageFromText } = await import("../src/lib/shock/filing-evidence");
    for (const [symbol, cik] of FILERS) {
      const fixture = await loadFixture(fixturePath(`${symbol}-annual`));
      const text = sec.htmlToText(fixture.body);
      count += checkText(text, symbol === "tsm" ? "20-F" : "10-K", symbol);
      if (symbol === "tsm") continue; // shared SourceDocType and Shock form still domestic-only
      const submissions = await loadFixture(fixturePath(symbol === "aapl" ? "aapl-submissions-2026-09-27" : `${symbol}-submissions`));
      const filing = sec.parseFilings(JSON.parse(submissions.body).filings.recent, cik, submissions).find(f => f.form === "10-K")!;
      assert.equal(filing.form, "10-K");
      const domestic = { ...filing, form: "10-K" as const };
      for (const fact of filingFactsFromText({ cik, ticker: symbol, name: symbol }, symbol, domestic, text)) {
        assert(fact.quoteVerified && fact.excerpt && text.includes(fact.excerpt), `${symbol} actual IC rendered excerpt`);
        assert.equal(fact.url, fixture.endpoint);
      }
      for (const driver of ["oil", "usd", "import-costs", "chip-supply"] as const) {
        const passage = passageFromText(symbol, symbol, domestic, text, driver);
        if (passage) assert(text.includes(passage.text), `${symbol} actual Shock ${driver} rendered quote`);
      }
    }
    console.log("Exact rendered filing quotes PASS", FILERS.length, "real filers", count, "quotes, mutations and same-source new-quote refusals");
  }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
