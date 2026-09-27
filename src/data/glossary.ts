// Plain-English definitions shown as tooltips at every level (underlined most visibly for Beginner).
export const GLOSSARY = {
  ETF: "A fund you buy like one stock that holds a basket of many companies.",
  "look-through": "Adding up what your funds hold inside so you see every company you really own.",
  concentration: "How much of your money depends on a single company or sector.",
  overlap: "The share of two funds that holds the same companies.",
  sector: "A group of companies in the same line of business, like technology or banks.",
  "10-K": "The detailed annual report a public company files with the SEC.",
  "10-Q": "The shorter quarterly report a public company files with the SEC.",
  "risk factor": "A section of a filing where a company lists what could hurt its business.",
  CRE: "Commercial real estate: offices, stores, warehouses and other buildings used by businesses.",
  REIT: "A company that owns income-producing real estate and pays most of its profit to shareholders.",
  "regional bank": "A mid-sized bank that lends mostly in one part of the country, often for real estate.",
  severity: "How large the shock is, for example a 20% fall in property values.",
  "stress test": "Checking how a portfolio would hold up if something bad happened.",
  thesis: "The reason you believe an investment will work out.",
  "investment committee": "A group that debates an investment and writes a memo before deciding.",
  coverage: "How much of a fund we can see inside. The part we can't see is unknown, not empty.",
  sensitivity: "An assumed size of reaction: how much a stock is set to move for each 1% move in the shock. A setting, not a forecast.",
  "historical range": "How far this price has moved over past periods of the same length. It describes the past; it is not a prediction.",
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
