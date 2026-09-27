import { assertProvenance, type Provenance } from "./provenance";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const escapePointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])])) : value;

function assertMetadata(value: unknown, depth = 0): void {
  if (depth > 40) throw new Error("Excessively nested provenance metadata");
  if (typeof value === "number") throw new Error("Numeric data cannot be hidden in provenance metadata");
  if (value && typeof value === "object") for (const child of Object.values(value)) assertMetadata(child, depth + 1);
}

export function auditApiProvenance(payload: unknown): { numericFields: number; evidence: ReadonlyMap<string, Provenance> } {
  if (object(payload) && (payload.type === "error" || payload.error !== undefined)) throw new Error("Cannot verify an error response as successful provenance coverage");
  const evidence = new Map<string, Provenance>();
  const numbers = new Map<string, number>();
  let visited = 0;
  const add = (pointer: string, source: unknown) => {
    assertProvenance(source);
    assertMetadata(source);
    const prior = evidence.get(pointer);
    if (prior && JSON.stringify(canonical(prior)) !== JSON.stringify(canonical(source))) throw new Error(`Conflicting provenance at ${pointer}`);
    evidence.set(pointer, source);
  };
  const addMap = (base: string, value: unknown) => {
    if (!object(value)) throw new Error(`Invalid numeric provenance map at ${base}`);
    for (const [relative, source] of Object.entries(value)) {
      if (relative !== "" && !relative.startsWith("/")) throw new Error(`Invalid provenance JSON pointer at ${base}`);
      add(`${base}${relative}`, source);
    }
  };
  const visit = (value: unknown, pointer: string, depth: number) => {
    if (++visited > 100_000 || depth > 64) throw new Error("API provenance audit payload exceeds traversal limits");
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Expected finite number at ${pointer}`);
      numbers.set(pointer, value);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (object(value)) {
      if (value.numericProvenance !== undefined) addMap(pointer, value.numericProvenance);
      if (value.provenance !== undefined) {
        if (object(value.provenance) && value.provenance.kind !== undefined) {
          assertProvenance(value.provenance);
          assertMetadata(value.provenance);
          if (typeof value.value === "number") add(`${pointer}/value`, value.provenance);
        } else {
          if (!object(value.provenance)) throw new Error(`Invalid provenance container at ${pointer}`);
          const keys = Object.keys(value.provenance);
          const pointers = keys.filter(key => key === "" || key.startsWith("/"));
          if (pointers.length === keys.length) addMap(Object.hasOwn(value, "data") ? `${pointer}/data` : pointer, value.provenance);
          else {
            if (pointers.length) throw new Error(`Mixed provenance map and source registry at ${pointer}`);
            for (const source of Object.values(value.provenance)) { assertProvenance(source); assertMetadata(source); }
          }
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance" && key !== "numericProvenance") visit(child, `${pointer}/${escapePointer(key)}`, depth + 1);
    }
  };
  visit(payload, "", 0);
  for (const pointer of numbers.keys()) if (!evidence.has(pointer)) throw new Error(`Missing provenance at ${pointer}`);
  for (const pointer of evidence.keys()) if (!numbers.has(pointer)) throw new Error(`Orphan provenance at ${pointer}`);
  return { numericFields: numbers.size, evidence };
}
