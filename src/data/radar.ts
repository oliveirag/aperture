import type { SourceLike } from "@/components/shared/source-drawer";

// Filing Radar demo content. Excerpts are concise paraphrases of themes in the named filings.

export type Severity = "high" | "medium" | "low";

export type RadarChange = {
  kind: "new" | "changed" | "removed";
  label: string;
  prior?: string;
  current: string;
  highlight: string[];
};

export type RadarCard = {
  id: string;
  ticker: string;
  company: string;
  color: string;
  filingType: "10-K" | "10-Q";
  filedAt: string;
  priorFiledAt: string;
  severity: Severity;
  category: string;
  title: string;
  summary: string;
  whyItMatters: string;
  exposureWeight: number;
  changes: RadarChange[];
  source: SourceLike;
};

const NVDA_EXPORT_CURRENT =
  "U.S. export controls now require licenses for our data center products to China and additional regions, and we may be unable to replace lost revenue from affected customers.";
const BXP_REFI_CURRENT =
  "A significant amount of our indebtedness matures through 2027, and refinancing at prevailing interest rates would increase our interest expense and could reduce cash available for distributions.";
const MSFT_CAPEX_CURRENT =
  "If demand for AI services develops more slowly than our capacity, these investments may not generate expected returns and could reduce our operating margins.";
const AAPL_DMA_CURRENT =
  "Changes to our App Store terms and fees in the EU, made to comply with the Digital Markets Act, may affect App Store revenue and developer relationships.";

export const RADAR_CARDS: RadarCard[] = [
  {
    id: "nvda",
    ticker: "NVDA",
    company: "NVIDIA",
    color: "#76B900",
    filingType: "10-K",
    filedAt: "2026-02-25",
    priorFiledAt: "2025-02-26",
    severity: "high",
    category: "Regulatory · Export controls",
    title: "Export-control risk expanded to more products and regions",
    summary:
      "NVIDIA's latest 10-K broadens its export-control risk: licensing now covers more data-center products and destinations, and it warns that lost sales may not be replaced elsewhere.",
    whyItMatters:
      "NVIDIA is 17.6% of your money across NVDA, QQQ and VOO. A hit here moves three of your positions at once.",
    exposureWeight: 0.176,
    changes: [
      {
        kind: "changed",
        label: "Export restrictions now cover more products and regions",
        prior: "We may be subject to export restrictions on certain of our products to certain customers in China.",
        current: NVDA_EXPORT_CURRENT,
        highlight: ["additional regions", "unable to replace lost revenue"],
      },
      {
        kind: "new",
        label: "Customers may switch to unrestricted competitors",
        current:
          "Customers affected by licensing requirements may shift to competing products that are not subject to the same restrictions.",
        highlight: ["shift to competing products"],
      },
    ],
    source: {
      id: "r-nvda-10k",
      title: "NVIDIA Form 10-K (FY2026)",
      docType: "10-K",
      issuer: "NVIDIA Corporation",
      date: "2026-02-25",
      section: "Item 1A. Risk Factors",
      excerpt: NVDA_EXPORT_CURRENT,
      highlight: "unable to replace lost revenue",
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA&type=10-K",
    },
  },
  {
    id: "bxp",
    ticker: "BXP",
    company: "BXP",
    color: "#C9A66B",
    filingType: "10-K",
    filedAt: "2026-02-27",
    priorFiledAt: "2025-02-28",
    severity: "high",
    category: "Liquidity · Refinancing",
    title: "New warning on refinancing debt that matures through 2027",
    summary:
      "BXP added a risk that debt maturing through 2027 may need to be refinanced at much higher rates, while office occupancy stays below pre-2020 levels.",
    whyItMatters:
      "BXP is 8.6% of your portfolio and your largest loss in the commercial real estate Shock Test (−$2,862 at a 20% decline).",
    exposureWeight: 0.086,
    changes: [
      {
        kind: "new",
        label: "Refinancing at higher rates",
        current: BXP_REFI_CURRENT,
        highlight: ["matures through 2027", "increase our interest expense"],
      },
      {
        kind: "changed",
        label: "Hybrid work described as a lasting drag",
        prior: "Hybrid work arrangements may affect demand for office space.",
        current:
          "Sustained hybrid work arrangements have reduced demand for office space in certain markets and may continue to pressure occupancy and rental rates.",
        highlight: ["have reduced demand", "continue to pressure occupancy"],
      },
    ],
    source: {
      id: "r-bxp-10k",
      title: "BXP, Inc. Form 10-K (FY2025)",
      docType: "10-K",
      issuer: "BXP, Inc.",
      date: "2026-02-27",
      section: "Item 1A. Risk Factors",
      excerpt: BXP_REFI_CURRENT,
      highlight: "matures through 2027",
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=BXP&type=10-K",
    },
  },
  {
    id: "msft",
    ticker: "MSFT",
    company: "Microsoft",
    color: "#5B9BD5",
    filingType: "10-K",
    filedAt: "2026-07-30",
    priorFiledAt: "2025-07-30",
    severity: "medium",
    category: "Capital spending · AI infrastructure",
    title: "AI infrastructure spending now flagged as a margin risk",
    summary:
      "Microsoft now warns that heavy AI data-center investment may not earn expected returns and could pressure margins if demand grows more slowly than capacity.",
    whyItMatters: "Microsoft is 11.4% of your money and sits in your AI data-center Shock Test.",
    exposureWeight: 0.114,
    changes: [
      {
        kind: "changed",
        label: "Capacity vs demand risk made explicit",
        prior: "We are investing in AI infrastructure to support demand for our cloud services.",
        current: MSFT_CAPEX_CURRENT,
        highlight: ["may not generate expected returns", "reduce our operating margins"],
      },
    ],
    source: {
      id: "r-msft-10k",
      title: "Microsoft Form 10-K (FY2026)",
      docType: "10-K",
      issuer: "Microsoft Corporation",
      date: "2026-07-30",
      section: "Item 1A. Risk Factors",
      excerpt: MSFT_CAPEX_CURRENT,
      highlight: "may not generate expected returns",
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT&type=10-K",
    },
  },
  {
    id: "aapl",
    ticker: "AAPL",
    company: "Apple",
    color: "#B4B4BC",
    filingType: "10-Q",
    filedAt: "2026-08-01",
    priorFiledAt: "2026-05-02",
    severity: "low",
    category: "Legal · App Store",
    title: "Updated App Store regulation language",
    summary:
      "Apple refreshed its App Store regulatory disclosures to reflect new developer-terms changes in the EU. No new risk category.",
    whyItMatters: "Apple is 12.9% of your money. This is an update to an existing risk, not a new one.",
    exposureWeight: 0.129,
    changes: [
      {
        kind: "changed",
        label: "EU developer terms updated",
        prior: "Changes to our App Store terms in the EU may affect revenue.",
        current: AAPL_DMA_CURRENT,
        highlight: ["Digital Markets Act"],
      },
    ],
    source: {
      id: "r-aapl-10q",
      title: "Apple Form 10-Q (Q3 FY2026)",
      docType: "10-Q",
      issuer: "Apple Inc.",
      date: "2026-08-01",
      section: "Part II, Item 1A",
      excerpt: AAPL_DMA_CURRENT,
      highlight: "Digital Markets Act",
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=10-Q",
    },
  },
];

export const RADAR_HEADLINE: Record<"beginner" | "intermediate" | "advanced", string> = {
  beginner: "Two companies you own changed how they describe their biggest risks.",
  intermediate: "2 high-severity changes in companies that make up 26.2% of your money.",
  advanced:
    "2 high, 1 medium, 1 low severity changes across 4 filings; high-severity names are 26.2% of look-through exposure.",
};

// NVDA 17.6% + BXP 8.6%
export const HIGH_SEVERITY_EXPOSURE = 0.262;

export const RADAR_LAST_CHECKED = "Sep 26, 2026, 6:00 AM";

export const NEW_ITEM_PRIOR = "Not present in the prior filing.";
