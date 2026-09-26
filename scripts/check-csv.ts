// Proves the CSV import parser on broker-shaped exports. Run: npx -y tsx scripts/check-csv.ts
import assert from "node:assert/strict";
import { parseNumber, parsePositionsCsv } from "../src/features/import/csv";

assert.equal(parseNumber("$1,234.56"), 1234.56);
assert.equal(parseNumber("(12.50)"), -12.5);
assert.equal(parseNumber("+3.1"), 3.1);
assert.equal(parseNumber("--"), null);
assert.equal(parseNumber("n/a"), null);

// Fidelity: header first, two accounts share NVDA, money market, pending activity, quoted disclaimer footer.
const fidelity = `﻿Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value
Z123,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$1520.33
Z123,Individual,NVDA,NVIDIA CORP,110,$225.07,+$0.49,"$24,757.70"
Z123,Individual,VOO,VANGUARD S&P 500 ETF,75,$710.79,+$3.80,"$53,309.25"
Z456,Roth IRA,NVDA,NVIDIA CORP,10,$225.07,+$0.49,"$2,250.70"
Z456,Roth IRA,BRK/B,BERKSHIRE HATHAWAY INC CLASS B,12,$505.48,+$0.30,"$6,065.76"
Z456,Roth IRA,Pending Activity,,,,,$-120.00

"The data and information in this spreadsheet is provided to you solely for your use, and is not for distribution."`;
const f = parsePositionsCsv(fidelity);
assert.equal(f.error, null);
assert.deepEqual(f.rows, [
  { ticker: "NVDA", name: "NVIDIA CORP", shares: 120, marketValue: 27008.4 },
  { ticker: "VOO", name: "VANGUARD S&P 500 ETF", shares: 75, marketValue: 53309.25 },
  { ticker: "BRK.B", name: "BERKSHIRE HATHAWAY INC CLASS B", shares: 12, marketValue: 6065.76 },
]);
assert.deepEqual(f.skipped.map((s) => s.reason), ["Cash or money market", "Cash or money market"]);

// Schwab: title and blank line above the header, an option row, cash and total rows.
const schwab = `"Positions for account Individual ...123 as of 09:41 AM ET, 2026/09/25"

"Symbol","Description","Quantity","Price","Price Change %","Market Value","Day Change %"
"AAPL","APPLE INC","50","$341.07","1.53%","$17,053.50","1.53%"
"AAPL 01/15/2027 350.00 C","CALL APPLE INC $350","1","$12.10","","$1,210.00",""
"KO","COCA-COLA CO","80","$87.81","-0.33%","$7,024.80","-0.33%"
"Cash & Cash Investments","--","--","--","--","$2,410.11","--"
"Account Total","--","--","--","--","$27,698.41","--"`;
const s = parsePositionsCsv(schwab);
assert.deepEqual(s.rows.map((r) => [r.ticker, r.shares]), [["AAPL", 50], ["KO", 80]]);
assert.deepEqual(s.skipped.map((x) => x.reason), ["Option or bond (not supported)", "Cash or money market", "Cash or money market"]);

// Plain file without a header, semicolon-separated.
const bare = parsePositionsCsv("msft;20\nqqq;60.5\n");
assert.deepEqual(bare.rows, [{ ticker: "MSFT", shares: 20, marketValue: null }, { ticker: "QQQ", shares: 60.5, marketValue: null }]);

// Value-only column still imports (shares come from price server-side).
const valueOnly = parsePositionsCsv("Ticker,Market Value\nSCHD,\"$4,982\"\n");
assert.deepEqual(valueOnly.rows, [{ ticker: "SCHD", shares: null, marketValue: 4982 }]);
assert.equal(parsePositionsCsv("Symbol,Name,Shares\nKO,Coca-Cola,3\n").rows[0].name, "Coca-Cola");

// Garbage.
assert.ok(parsePositionsCsv("hello world\nthis is not a portfolio").error);
assert.ok(parsePositionsCsv("Symbol,Quantity\n").error);

console.log("csv OK");
