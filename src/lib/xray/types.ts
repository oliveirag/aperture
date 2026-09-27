import type { Flag, LeveledText, SectorSlice, Source } from "@/types/demo";
import type { Provenance } from "@/lib/provenance";

// "Direct", or the ticker of the ETF the money flows through.
export type Via = string;

export type XSource = { via: Via; value: number };

// One underlying company (or an opaque ETF) and every path that reaches it.
export type XExposure = { ticker: string; name: string; color: string; value: number; sources: XSource[] };

export type MapPosition = { id: string; ticker: string; category: string; value: number; weight: number; color: string };

export type MapExposure = {
  id: string;
  name: string;
  ticker?: string; // absent for groups (Layers icon)
  color?: string;
  note?: string;
  value: number;
  weight: number;
  sources: XSource[];
};

export type Connector = { id: string; from: string; to: string; value: number; etf: boolean };

export type XOverlap = { a: string; b: string; overlap: number; sharedCompanies: number; aValue: number; bValue: number; bCount: number };

// Everything the X-Ray page draws. The demo portfolio gets the curated canon; an imported one gets it computed.
export interface XrayModel {
  mode: "demo" | "live";
  total: number;
  // Shared immutable valuation for header, X-Ray, Shock and IC consumers.
  valuation?: {
    currency: "USD"; total: number; status: "sourced" | "source-unavailable"; provenance?: Provenance;
    positions: { ticker: string; shares: number; price: number; value: number; kind: "stock" | "etf" | "opaque" | "cash"; provenance?: Provenance }[];
  };
  positionsCount: number;
  underlyingCompanies: number;
  headline: LeveledText;
  subline: LeveledText;
  map: { positions: MapPosition[]; exposures: MapExposure[]; connectors: Connector[]; drawOrder: string[]; pinId: string; maxPosition: number };
  topTen: XExposure[];
  // ETF columns in the advanced True Top 10 (at most three).
  etfColumns: string[];
  sectors: SectorSlice[];
  sectorSources?: { ticker: string; method: string; provenance?: Provenance; status: "sourced" | "source-unavailable" }[];
  overlaps: XOverlap[];
  flags: Flag[];
  sources: Source[];
  // Positions shown as themselves because no ETF holdings were available.
  opaque: string[];
}
