// Shared, client-safe limits. The analysis routes (X-Ray refresh, Shock, scenario research, performance, IC fit)
// price every position live, so they accept at most this many positions per request.
export const MAX_POSITIONS = 50;

export const tooManyPositionsMessage = (count: number, what: string) =>
  `${what} supports up to ${MAX_POSITIONS} positions; this portfolio has ${count}. Its X-Ray is complete, but ${what} can't run on it yet. Nothing was estimated.`;
