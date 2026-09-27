import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withLiveLock, saveFixture, loadFixture, captureFixture } from "./lib/fixtures";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "aperture-fixture-test-"));
  try {
    const lockPath = path.join(dir, "live.lock");
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = withLiveLock(async () => { entered(); await held; return 1; }, { lockPath });
    await started;
    await assert.rejects(withLiveLock(async () => 2, { lockPath, waitMs: 0 }), /lock/i);
    const child = `require('./scripts/lib/fixtures').withLiveLock(async()=>1, {lockPath:${JSON.stringify(lockPath)},waitMs:0}).then(()=>process.exitCode=2).catch(()=>process.exitCode=7)`;
    await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "-e", child]), error => (error as { code: number }).code === 7);
    release();
    assert.equal(await first, 1);
    await assert.rejects(withLiveLock(async () => { throw new Error("expected"); }, { lockPath }), /expected/);
    assert.equal(await withLiveLock(async () => 3, { lockPath }), 3);
    await assert.rejects(withLiveLock(async () => { await unlink(lockPath); throw new Error("primary failure"); }, { lockPath }), error => error instanceof AggregateError && error.errors.some((item: Error) => item.message === "primary failure"));
    const real = await loadFixture(path.join(process.cwd(), "scripts/fixtures/sec-edgar/aapl-submissions-2026-09-27.json"));
    assert.equal(JSON.parse(real.body).name, "Apple Inc.");
    assert.ok(JSON.parse(real.body).filings.recent.accessionNumber.length > 0);
    const input = { provider: "fred" as const, endpoint: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", retrievedAt: "2026-09-27T00:00:00.000Z", body: "DATE,DGS10\n2026-09-25,4.1\n" };
    const filename = path.join(dir, "sample.json");
    await saveFixture(filename, input);
    assert.deepEqual(await loadFixture(filename), { ...input, schemaVersion: 1, sha256: (await import("node:crypto")).createHash("sha256").update(input.body).digest("hex") });
    await assert.rejects(saveFixture(filename, input), /exist/i);
    await assert.rejects(saveFixture(path.join(dir, "unsafe.json"), { ...input, endpoint: `${input.endpoint}&api_key=private` }), /provenance/i);
    await assert.rejects(saveFixture(path.join(dir, "wrong-provider.json"), { ...input, provider: "finnhub" }), /provider/i);
    for (const url of ["https://user:pass@finnhub.io/quote", "https://finnhub.io:8443/quote", "http://finnhub.io/quote", "https://127.0.0.1/", "https://finnhub.io.evil.test/quote"]) await assert.rejects(captureFixture("finnhub", "test", url), /approved/i);
    await assert.rejects(captureFixture("finnhub", "../escape", "https://finnhub.io/quote"), /name/i);
    await assert.rejects(captureFixture("sec-edgar", "test", "https://www.sec.gov/x"), /User-Agent/i);
    await assert.rejects(captureFixture("user-import", "test", "https://www.sec.gov/x"), /approved/i);
    const originalKey = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = "fixture-tool-test-secret";
    await assert.rejects(saveFixture(path.join(dir, "secret.json"), { ...input, body: "fixture-tool-test-secret" }), /secret/i);
    if (originalKey === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = originalKey;
    const stored = JSON.parse(await readFile(filename, "utf8"));
    await writeFile(filename, JSON.stringify({ ...stored, body: "tampered" }));
    await assert.rejects(loadFixture(filename), /digest/i);
    console.log("fixture tools OK: mutual exclusion, cleanup, immutable capture, credentials rejected and digest verification");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
