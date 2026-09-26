// IC Room demo content: one ticker (AMD), one thesis, a scripted pre-mortem and memo.
// Excerpts are concise paraphrases of themes in the named documents. Numbers match the demo canon (GUI-39).

export type IcLevel = "beginner" | "intermediate" | "advanced";

// Same shape as SourceLike in src/components/shared/source-drawer.tsx.
export type IcFact = {
  id: string;
  title: string;
  docType: "10-K" | "10-Q" | "8-K" | "ETF holdings" | "Fed data" | "News";
  issuer: string;
  date: string;
  section?: string;
  excerpt: string;
  highlight?: string;
  url: string;
};

// A fact id, or "FIT" for the portfolio-fit table computed from the X-Ray.
export type IcRef = "F1" | "F2" | "F3" | "F4" | "F5" | "FIT";

export type AssumptionStatus = "supported" | "contested" | "unresolved";

export type EvidenceLine = { text: string; factId: IcRef };

export type Assumption = {
  id: string;
  text: string;
  status: AssumptionStatus;
  for: EvidenceLine[];
  against: EvidenceLine[];
};

export type MemoPoint = { text: string; refs: IcRef[] };

export type FitRow = {
  label: string;
  kind: "usd" | "weight" | "drawdown";
  before: number;
  after: number;
};

// Ticker under review
export const IC_TICKER = {
  ticker: "AMD",
  name: "Advanced Micro Devices",
  color: "#E5484D",
  owned: false,
  lookthroughWeight: 0.004,
  lookthroughNote: "0.4% through VOO and QQQ",
} as const;

// Hypothetical position size (display only)
export const IC_AMOUNT = 10000;

// Memo date
export const IC_DATE = "2026-09-26";

// Prefilled thesis, also restored by the preset chip
export const IC_THESIS = "AMD takes meaningful data-center GPU share from NVIDIA over the next two years.";

// Fact pack checklist, in order
export const FACT_PACK_STEPS = [
  "Reading AMD 10-K (FY2025)",
  "Pulling 8 quarters of fundamentals",
  "Searching news from the last 14 days",
  "Checking your look-through exposure",
] as const;

const AMD_10K_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AMD&type=10-K";

// Every fact the debate and memo may cite
export const IC_FACTS: IcFact[] = [
  {
    id: "F1",
    title: "AMD Form 10-K (FY2025)",
    docType: "10-K",
    issuer: "Advanced Micro Devices, Inc.",
    date: "2026-02-04",
    section: "Item 1. Business; Item 1A",
    excerpt:
      "Data Center is our fastest-growing segment. We continue to expand ROCm software support for major AI frameworks and models.",
    highlight: "fastest-growing segment",
    url: AMD_10K_URL,
  },
  {
    id: "F2",
    title: "Cloud providers broaden Instinct GPU availability",
    docType: "News",
    issuer: "Industry news summary",
    date: "2026-09-12",
    excerpt:
      "Two large cloud providers made AMD Instinct-based GPU instances generally available to customers this year, citing demand for a second accelerator supplier.",
    highlight: "second accelerator supplier",
    url: "https://www.amd.com/en/newsroom.html",
  },
  {
    id: "F3",
    title: "NVIDIA Form 10-K (FY2026)",
    docType: "10-K",
    issuer: "NVIDIA Corporation",
    date: "2026-02-25",
    section: "Item 1. Business",
    excerpt:
      "Our CUDA platform and libraries are used by millions of developers, and most leading AI frameworks are optimized for our architecture.",
    highlight: "optimized for our architecture",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA&type=10-K",
  },
  {
    id: "F4",
    title: "AMD Form 10-K (FY2025)",
    docType: "10-K",
    issuer: "Advanced Micro Devices, Inc.",
    date: "2026-02-04",
    section: "Item 1A. Risk Factors",
    excerpt:
      "A limited number of customers account for a significant portion of our Data Center revenue, and new export licensing requirements could restrict shipments of our accelerators to certain regions.",
    highlight: "limited number of customers",
    url: AMD_10K_URL,
  },
  {
    id: "F5",
    title: "Advanced packaging capacity outlook",
    docType: "News",
    issuer: "Industry news summary",
    date: "2026-08-28",
    excerpt:
      "Foundry partners are adding advanced packaging capacity through 2027, but most of it is already allocated to the largest AI chip buyers.",
    highlight: "already allocated",
    url: "https://www.tsmc.com/english/news-events",
  },
];

// What would have to be true, with evidence both ways
export const ASSUMPTIONS: Assumption[] = [
  {
    id: "A1",
    text: "Hyperscalers run AMD Instinct GPUs in production, not just pilots.",
    status: "supported",
    for: [{ text: "Two large cloud providers made Instinct instances generally available this year.", factId: "F2" }],
    against: [{ text: "NVIDIA still supplies the large majority of data-center accelerators.", factId: "F3" }],
  },
  {
    id: "A2",
    text: "ROCm is good enough that switching away from CUDA isn't a blocker.",
    status: "contested",
    for: [{ text: "AMD keeps expanding ROCm support for major AI frameworks.", factId: "F1" }],
    against: [{ text: "Most AI tooling is built and tuned for CUDA first.", factId: "F3" }],
  },
  {
    id: "A3",
    text: "AMD can secure enough advanced packaging capacity to ship at scale.",
    status: "unresolved",
    for: [{ text: "Foundry partners are adding packaging capacity through 2027.", factId: "F5" }],
    against: [{ text: "Most new capacity is already allocated to the largest buyers.", factId: "F5" }],
  },
  {
    id: "A4",
    text: "Export controls hurt AMD no more than NVIDIA.",
    status: "contested",
    for: [{ text: "AMD's China data-center exposure is smaller than NVIDIA's.", factId: "F4" }],
    against: [{ text: "New licensing rules could restrict AMD accelerator shipments too.", factId: "F4" }],
  },
];

// Debate statements
export const BULL_STATEMENT =
  "Cloud providers want a second GPU supplier, and AMD is the one shipping at scale. Data Center is already its fastest-growing segment. It doesn't need to win outright: a modest share of a very large market moves AMD's revenue meaningfully.";

export const BEAR_STATEMENT =
  "Share gains at the margin aren't a thesis. Most AI code is still built for CUDA, and AMD's data-center revenue leans on a few buyers. For this portfolio the bigger problem is correlation: AMD falls in the same scenario as NVIDIA, which is already your largest exposure.";

// The chair's memo
export const MEMO = {
  stance: "Worth deeper research",
  summary: {
    beginner:
      "AMD could be worth researching, but buying it would put even more of your money into the same AI-chip story as NVIDIA, which is already your biggest exposure.",
    intermediate:
      "Worth deeper research. The share-gain story is plausible but depends on software adoption that isn't proven yet, and adding AMD would concentrate your portfolio further in AI chips.",
    advanced:
      "Stance: worth deeper research. The thesis rests on production-scale hyperscaler adoption (A1, supported) and ROCm parity (A2, contested). A $10,000 position lifts AI-linked exposure from 31.2% to 35.5% and deepens the AI-capex drawdown from −5.5% to −6.8%, so sizing and correlation matter more than the thesis.",
  } satisfies Record<IcLevel, string>,
  bull: [
    { text: "Data Center is AMD's fastest-growing segment, and cloud providers want a second supplier.", refs: ["F1", "F2"] },
    { text: "Each ROCm release widens framework support and lowers switching costs.", refs: ["F1"] },
    { text: "A modest share of a very large market still moves AMD's revenue.", refs: ["F2"] },
  ] satisfies MemoPoint[],
  bear: [
    { text: "CUDA's ecosystem keeps share gains at the margins, mostly in inference.", refs: ["F3"] },
    { text: "A handful of hyperscalers drive revenue; one paused order changes the year.", refs: ["F4"] },
    { text: "For you, AMD is the same bet as NVIDIA: if AI spending slows, both fall together.", refs: ["FIT"] },
  ] satisfies MemoPoint[],
  keyRisks: [
    "Customer concentration in a few hyperscalers",
    "Export licensing on accelerators",
    "Advanced packaging supply",
  ],
  watch: [
    "Next earnings: Data Center growth and GPU revenue commentary",
    "Hyperscaler capex guidance",
    "ROCm adoption outside the largest AI labs",
  ],
  chairNote:
    "Adding $10,000 of AMD would take your AI-linked exposure from 31.2% to 35.5%. You'd be adding to the same risk that already drives your largest position.",
} as const;

// Before → after if the $10,000 position were added. Pre-computed from the X-Ray canon.
export const PORTFOLIO_FIT: FitRow[] = [
  { label: "Portfolio value", kind: "usd", before: 148420, after: 158420 },
  { label: "AMD look-through", kind: "weight", before: 0.004, after: 0.067 },
  { label: "NVIDIA look-through", kind: "weight", before: 0.176, after: 0.165 },
  { label: "Semiconductors", kind: "weight", before: 0.213, after: 0.263 },
  { label: "AI-linked exposure (NVDA, MSFT, AVGO, AMD)", kind: "weight", before: 0.312, after: 0.355 },
  { label: "Technology sector", kind: "weight", before: 0.498, after: 0.53 },
  { label: "AI capex pullback Shock Test at 30%", kind: "drawdown", before: -0.055, after: -0.068 },
];

export const PORTFOLIO_FIT_NOTE = "Computed from your X-Ray";
