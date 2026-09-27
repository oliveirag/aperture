// Pure: which experience level wins when a device and an account disagree. The most recent explicit choice wins;
// a device default that was never chosen never overwrites an account's saved choice.
import { isLevel, type Level } from "./policy";

export type LocalChoice = { level: Level; chosenAt: string | null };
export type ProfileChoice = { level: Level | null; updatedAt: string | null };
export type Resolution = { level: Level; writeProfile: boolean };

const time = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null);

export function resolveLevel(local: LocalChoice, profile: ProfileChoice | null): Resolution {
  const localAt = time(local.chosenAt);
  if (!profile || !isLevel(profile.level)) return { level: local.level, writeProfile: true };
  const profileAt = time(profile.updatedAt);
  // Only an explicit local choice can win over a saved one.
  if (localAt !== null && (profileAt === null || localAt > profileAt)) {
    return { level: local.level, writeProfile: local.level !== profile.level };
  }
  return { level: profile.level, writeProfile: false };
}
