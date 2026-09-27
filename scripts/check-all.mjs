import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const checks = (await readdir(directory)).filter(name => /^check-.*\.ts$/.test(name)).sort();
if (!checks.length) throw new Error("No release check scripts found");
const env = { ...process.env, APERTURE_LOCAL_VERIFICATION: "1", NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION: "1", APERTURE_CACHE_DIR: "", NEXT_RUNTIME: "" };
for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "GEMINI_API_KEY", "GEMINI_API_KEYS", "FINNHUB_API_KEY", "ALPHA_VANTAGE_API_KEY", "FRED_API_KEY", "OPENFIGI_API_KEY"]) env[name] = "";
for (const check of checks) {
  console.log(`\nCHECK ${check}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(directory, check)], { cwd: path.dirname(directory), env, stdio: "inherit", timeout: 120_000 });
  if (result.error || result.status !== 0) {
    console.error(`FAIL ${check}: ${result.error?.message ?? `exit ${result.status ?? result.signal}`}`);
    process.exit(result.status || 1);
  }
}
console.log(`\nPASS: all ${checks.length} release checks (offline, isolated provider/storage credentials)`);
