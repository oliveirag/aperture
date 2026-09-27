// Compatibility shim: the level now lives in the persisted experience store (src/lib/experience/store.ts).
export type { Level } from "@/lib/experience/policy";
export { useExperience as useLevel } from "@/lib/experience/store";
