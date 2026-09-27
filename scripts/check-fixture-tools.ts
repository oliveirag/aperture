import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withLiveLock, saveFixture, loadFixture } from "./lib/fixtures";

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
    release();
    assert.equal(await first, 1);
    await assert.rejects(withLiveLock(async () => { throw new Error("expected"); }, { lockPath }), /expected/);
    assert.equal(await withLiveLock(async () => 3, { lockPath }), 3);
    const input = { provider: "fred" as const, endpoint: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", retrievedAt: "2026-09-27T00:00:00.000Z", body: "DATE,DGS10\n2026-09-25,4.1\n" };
    const filename = path.join(dir, "sample.json");
    await saveFixture(filename, input);
    assert.deepEqual(await loadFixture(filename), { ...input, schemaVersion: 1, sha256: (await import("node:crypto")).createHash("sha256").update(input.body).digest("hex") });
    await assert.rejects(saveFixture(filename, input), /exist/i);
    await assert.rejects(saveFixture(path.join(dir, "unsafe.json"), { ...input, endpoint: `${input.endpoint}&api_key=private` }), /provenance/i);
    process.env.FINNHUB_API_KEY = "fixture-tool-test-secret";
    await assert.rejects(saveFixture(path.join(dir, "secret.json"), { ...input, body: "fixture-tool-test-secret" }), /secret/i);
    delete process.env.FINNHUB_API_KEY;
    const stored = JSON.parse(await readFile(filename, "utf8"));
    await writeFile(filename, JSON.stringify({ ...stored, body: "tampered" }));
    await assert.rejects(loadFixture(filename), /digest/i);
    console.log("fixture tools OK: mutual exclusion, cleanup, immutable capture, credentials rejected and digest verification");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
