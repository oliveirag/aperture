type Check = (value: unknown) => boolean;
const text: Check = value => typeof value === "string";
const finite: Check = value => typeof value === "number" && Number.isFinite(value);
const fraction: Check = value => finite(value) && (value as number) >= 0 && (value as number) <= 1;
const nonnegative: Check = value => finite(value) && (value as number) >= 0;
const count: Check = value => nonnegative(value) && Number.isSafeInteger(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const list = (check: Check): Check => value => Array.isArray(value) && value.length <= 500 && value.every(check);
const shape = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => value => object(value)
  && Object.entries(required).every(([key, check]) => check(value[key]))
  && Object.entries(optional).every(([key, check]) => value[key] === undefined || check(value[key]));

const position = shape({ ticker: text, valueUsd: nonnegative, weight: fraction }, { name: text, category: text });
const exposure = shape({ ticker: text, name: text, valueUsd: nonnegative, weight: fraction, paths: list(shape({ via: text, weight: fraction })) });
const portfolioContext = shape({}, {
  portfolio: shape({}, { kind: text, totalValueUsd: nonnegative, positionsCount: count, underlyingCompanies: count, positions: list(position) }),
  apertureTop10: list(exposure),
  sectors: list(shape({ sector: text, weight: fraction })),
  concentrationFlags: list(shape({ label: text, weight: fraction })),
  etfOverlaps: list(shape({ a: text, b: text, overlapByWeight: fraction, sharedCompanies: count })),
  filingRadar: list(shape({ ticker: text, company: text, severity: text, change: text, filing: text, apertureWeight: fraction })),
  icMemos: list(shape({ ticker: text, date: text, memo: shape({ stance: text, summary: value => object(value) && Object.values(value).every(text) }, { keyRisks: list(text) }) })),
});
const scenario = shape({ question: text, assumption: text }, {
  evidence: list(shape({ text })),
  impacts: list(shape({ ticker: text, returnFraction: finite, dollar: finite }, { path: text })),
  modeledShare: fraction,
  notModeled: list(value => text(value) || shape({ ticker: text, weight: fraction })(value)),
});

export function validAskContext(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!object(value)) return false;
  return value.scenario === undefined ? portfolioContext(value) : scenario(value.scenario) && portfolioContext(value.portfolio);
}
