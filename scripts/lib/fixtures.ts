import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { assertProvenance, publicSourceUrl, type Provider } from "../../src/lib/provenance";

export type Fixture = {
  schemaVersion: 1;
  provider: Provider;
  endpoint: string;
  retrievedAt: string;
  sha256: string;
  body: string;
};
type Capture = Omit<Fixture, "schemaVersion" | "sha256">;
const digest = (body: string) => createHash("sha256").update(body).digest("hex");
const SECRET_NAMES = ["FINNHUB_API_KEY", "ALPHA_VANTAGE_API_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "SUPABASE_SERVICE_ROLE_KEY", "FRED_API_KEY", "OPENFIGI_API_KEY"];
const HOSTS: Partial<Record<Provider, readonly string[]>> = {
  "sec-edgar": ["www.sec.gov", "data.sec.gov", "efts.sec.gov"],
  "sec-xbrl": ["data.sec.gov"], "sec-nport": ["www.sec.gov", "data.sec.gov"],
  finnhub: ["finnhub.io"], "alpha-vantage": ["www.alphavantage.co"],
  fred: ["fred.stlouisfed.org", "api.stlouisfed.org"], fdic: ["banks.data.fdic.gov", "api.fdic.gov"],
  stooq: ["stooq.com"], gdelt: ["api.gdeltproject.org"], openfigi: ["api.openfigi.com"],
  eia: ["www.eia.gov"], usitc: ["www.usitc.gov"],
  "issuer-file": ["www.ishares.com", "www.ssga.com", "www.invesco.com", "investor.vanguard.com", "fund-docs.vanguard.com", "www.schwabassetmanagement.com", "ark-funds.com"],
};

function assertProviderUrl(provider: Provider, value: string) {
  let target: URL;
  try { target = new URL(value); } catch { throw new Error("Fixture endpoint is not an approved public provider"); }
  if (target.protocol !== "https:" || target.username || target.password || target.port || !HOSTS[provider]?.includes(target.hostname)) throw new Error("Fixture endpoint is not an approved public provider");
}

export async function withLiveLock<T>(run: () => Promise<T>, options: { lockPath?: string; waitMs?: number } = {}): Promise<T> {
  const lockPath = options.lockPath ?? path.join(homedir(), ".cache", "aperture-live.lock");
  const waitMs = options.waitMs ?? 120_000;
  if (!Number.isFinite(waitMs) || waitMs < 0) throw new Error("Invalid live lock wait");
  await mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + waitMs;
  let handle: Awaited<ReturnType<typeof open>>;
  for (;;) {
    try { handle = await open(lockPath, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        let owner = "owner unavailable";
        try {
          const info = JSON.parse(await readFile(lockPath, "utf8"));
          if (Number.isSafeInteger(info.pid) && info.pid > 0 && typeof info.acquiredAt === "string" && Number.isFinite(Date.parse(info.acquiredAt))) owner = `pid ${info.pid}, acquired ${new Date(info.acquiredAt).toISOString()}`;
        } catch { owner = "owner metadata unavailable"; }
        throw new Error(`Live provider lock is held (${owner}); retry later. Never remove another worker's lock.`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  let failure: { error: unknown } | undefined;
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
    return await run();
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    const results = await Promise.allSettled([handle.close(), unlink(lockPath)]);
    const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
    if (errors.length) throw new AggregateError([...(failure ? [failure.error] : []), ...errors], "Live lock operation or cleanup failed");
  }
}

function validateCapture(input: Capture) {
  assertProvenance({ kind: "retrieved", provider: input.provider, endpoint: input.endpoint, retrievedAt: input.retrievedAt });
  assertProviderUrl(input.provider, input.endpoint);
  if (typeof input.body !== "string") throw new Error("Fixture body must be raw text");
  const text = JSON.stringify(input);
  for (const name of SECRET_NAMES) {
    for (const secret of (process.env[name] ?? "").split(",").map(value => value.trim()).filter(Boolean)) {
      if (text.includes(secret) || text.includes(encodeURIComponent(secret))) throw new Error("Fixture contains a configured secret; capture refused");
    }
  }
}

export async function saveFixture(filename: string, input: Capture): Promise<Fixture> {
  validateCapture(input);
  const fixture: Fixture = { provider: input.provider, endpoint: input.endpoint, retrievedAt: input.retrievedAt, body: input.body, schemaVersion: 1, sha256: digest(input.body) };
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(fixture, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return fixture;
}

export async function loadFixture(filename: string): Promise<Fixture> {
  const fixture = JSON.parse(await readFile(filename, "utf8")) as Fixture;
  validateCapture(fixture);
  if (fixture.schemaVersion !== 1 || digest(fixture.body) !== fixture.sha256) throw new Error("Fixture digest or schema mismatch");
  return fixture;
}

export async function captureFixture(provider: Provider, name: string, url: string, headers: Record<string, string> = {}): Promise<Fixture> {
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(name)) throw new Error("Invalid fixture name");
  assertProviderUrl(provider, url);
  const target = new URL(url);
  if (provider.startsWith("sec-") && !Object.entries(headers).some(([key, value]) => key.toLowerCase() === "user-agent" && /\S+@\S+/.test(value))) throw new Error("SEC capture requires a descriptive contact User-Agent");
  return withLiveLock(async () => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    let response: Response;
    try {
      response = await fetch(target, { headers, redirect: "error", signal: AbortSignal.timeout(30_000), cache: "no-store" });
    } catch { throw new Error(`${provider} fixture request failed`); }
    if (!response.ok) throw new Error(`${provider} fixture HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`${provider} fixture has no body`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32 * 1024 * 1024) throw new Error(`${provider} fixture exceeds 32 MiB`);
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return saveFixture(path.join(process.cwd(), "scripts", "fixtures", provider, `${name}.json`), {
      provider, endpoint: publicSourceUrl(url), retrievedAt: new Date().toISOString(), body: Buffer.concat(chunks).toString("utf8"),
    });
  });
}
