// Deterministic, offline seed generation from SHA-256-verified real fixtures.
// node scripts/seed-etfs.mjs                 regenerate (no network, no keys)
// node scripts/seed-etfs.mjs --check         prove byte-for-byte reproducibility
// node --env-file=/absolute/path/.env.local scripts/seed-etfs.mjs --capture-mappings
// The opt-in capture path uses keyless OpenFIGI, live locks and <= 25 requests/min.
// Follow .devin/skills/aperture-workstream/SKILL.md for remote-write isolation.
import { tsImport } from "tsx/esm/api";
const imported = await tsImport("../src/lib/nport/seed.ts", import.meta.url);
await (imported.runSeed ?? imported.default.runSeed)(process.argv.slice(2));
