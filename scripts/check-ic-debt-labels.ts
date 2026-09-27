import assert from "node:assert/strict";
import { loadFixture } from "./lib/fixtures";
import { fundamentalsFromFacts } from "../src/lib/sec/xbrl";
import { fundamentalFacts, type Fact } from "../src/lib/ic/facts";
import { evaluate } from "../src/lib/ic/rules";

async function main() {
  const fixture = await loadFixture("scripts/fixtures/sec-xbrl/aapl-companyfacts.json");
  const fundamentals = fundamentalsFromFacts(JSON.parse(fixture.body), fixture);
  assert.ok(fundamentals?.debt);
  const facts: Fact[] = fundamentalFacts({ cik: "0000320193", ticker: "AAPL", name: "Apple Inc." }, "Apple", fundamentals).map((fact, index) => ({ ...fact, id: `F${index + 1}` }));
  const noDebt = evaluate("Apple", facts.filter(fact => fact.signal?.kind !== "debt"), []);
  assert.ok(!noDebt.assumptions.some(item => item.text === "The balance sheet can carry the business" && item.status === "supported"), "Missing debt is unknown, not evidence that operating cash covers it");
  const stressed = facts.map(fact => fact.signal?.kind === "cash" ? { ...fact, signal: { ...fact.signal, latest: fundamentals.debt!.value / 5 } } : fact);
  const result = evaluate("Apple", stressed, []);
  const debtPoint = result.bear.find(point => point.risk === "Heavy debt load");
  assert.ok(debtPoint);
  assert.ok(debtPoint.text.startsWith(fundamentals.debtLabel!), "Use the actual reported measure, not a fabricated total-debt label");
  assert.doesNotMatch(debtPoint.text, /^Total debt/);
  assert.equal(debtPoint.refs.length, 2);
  const unstressed = evaluate("Apple", facts, []);
  const balance = unstressed.assumptions.find(item => item.text === "The balance sheet can carry the business");
  assert.ok(balance?.for.some(line => line.text.includes(fundamentals.debtLabel!)));
  assert.ok(!JSON.stringify(balance).includes("comfortably"), "A four-year cash-flow multiple is not a solvency guarantee");
  console.log("IC debt labels OK: real XBRL measure retained; missing debt never implies coverage");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
