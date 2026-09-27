import { assertProvenance, type Provenance } from "../provenance";
import { equity, normalizeSymbol, positionKey, validSymbol, type Mapping, type Position } from "./index";

type FigiResult = { data?: { ticker?: string; exchCode?: string; marketSector?: string; securityType2?: string; shareClassFIGI?: string }[]; error?: string; warning?: string };
export function mappingJob(key: string) {
  const [kind, idValue] = key.split(":");
  if ((kind === "CUSIP" && /^[A-Z0-9*@#]{9}$/.test(idValue)) || (kind === "ISIN" && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(idValue))) {
    return { idType: kind === "CUSIP" ? "ID_CUSIP" : "ID_ISIN", idValue, exchCode: "US" };
  }
  throw new Error("Invalid OpenFIGI identifier");
}
export function parseMappings(keys: string[], raw: unknown, provenance: Provenance): Map<string, Mapping> {
  assertProvenance(provenance);
  if (provenance.kind !== "retrieved" || provenance.provider !== "openfigi" || provenance.endpoint !== "https://api.openfigi.com/v3/mapping") throw new Error("Untrusted OpenFIGI provenance");
  if (!Array.isArray(raw) || raw.length !== keys.length) throw new Error("OpenFIGI response length mismatch");
  const result = new Map<string, Mapping>();
  raw.forEach((entry: FigiResult, index) => {
    if (!entry || entry.error || entry.warning || !Array.isArray(entry.data)) return;
    // Never select the first listing or a derivative merely because its symbol looks familiar.
    const candidates = entry.data.filter(item => item.exchCode === "US" && item.marketSector === "Equity" && ["Common Stock", "Depositary Receipt", "REIT"].includes(item.securityType2 ?? ""));
    const symbols = new Set(candidates.map(item => normalizeSymbol(item.ticker ?? "")).filter(validSymbol));
    const classes = new Set(candidates.map(item => item.shareClassFIGI).filter(Boolean));
    if (symbols.size === 1 && classes.size <= 1) result.set(keys[index], { ticker: [...symbols][0], identifier: keys[index], method: "openfigi", provenance });
  });
  return result;
}
const nameKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function secFallback(positions: Position[], raw: unknown, provenance: Provenance): Map<string, Mapping> {
  assertProvenance(provenance);
  if (provenance.kind !== "retrieved" || provenance.provider !== "sec-edgar" || provenance.endpoint !== "https://www.sec.gov/files/company_tickers.json") throw new Error("Untrusted SEC ticker provenance");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid SEC ticker list");
  const names = new Map<string, Set<string>>();
  for (const row of Object.values(raw) as { title?: string; ticker?: string }[]) {
    if (typeof row.title !== "string" || typeof row.ticker !== "string") throw new Error("Invalid SEC ticker row");
    const name = nameKey(row.title);
    const set = names.get(name) ?? new Set<string>();
    set.add(normalizeSymbol(row.ticker)); names.set(name, set);
  }
  const result = new Map<string, Mapping>();
  const conflicts = new Set<string>();
  for (const position of positions) {
    if (!equity(position)) continue;
    // Exact issuer AND security-title identity only. No fuzzy company matching or class guessing.
    // Multi-class issuers in SEC's list stay unresolved until identifier mapping succeeds.
    if (nameKey(position.name) !== nameKey(position.title)) continue;
    const tickers = names.get(nameKey(position.name));
    if (tickers?.size === 1 && validSymbol([...tickers][0])) {
      const key = positionKey(position);
      const ticker = [...tickers][0];
      if (result.has(key) && result.get(key)!.ticker !== ticker) conflicts.add(key);
      result.set(key, { ticker, method: "sec-name", provenance });
    }
  }
  for (const key of conflicts) result.delete(key);
  return result;
}
