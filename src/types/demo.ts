export type Level = "beginner" | "intermediate" | "advanced";
export type LeveledText = Record<Level, string>;
export type SourceDocType = "10-K" | "10-Q" | "8-K" | "ETF holdings" | "Fed data" | "News" | "Market data";
// The one source shape: the Source drawer, Shock evidence, Radar filings and IC facts all use it.
export interface Source { id: string; title: string; docType: SourceDocType; issuer: string; date: string; section?: string; excerpt: string; highlight?: string; url: string }
export interface Holding { ticker: string; name: string; type: "stock" | "etf"; shares: number; price: number; value: number; category: string; color: string }
export interface ExposureSource { via: "Direct" | "VOO" | "QQQ" | "KRE"; value: number }
export interface Exposure { ticker: string; name: string; color: string; value: number; sources: ExposureSource[] }
export interface EtfLookthrough { ticker: string; holdingsCount: number; top: { ticker: string; name: string; weight: number }[]; sourceId: string }
export interface SectorSlice { sector: string; weight: number }
export interface Overlap { a: string; b: string; overlap: number; sharedCompanies: number }
export interface Flag { id: string; kind: "company" | "sector"; label: string; weight: number; threshold: number }
export interface PerformancePoint { date: string; value: number }
export type ScenarioId = "cre" | "ai-capex";
export interface ShockNode { id: string; label: string; sublabel?: string; kind: "driver" | "channel" | "holding"; x: number; y: number; ticker?: string }
export interface ShockEdge { id: string; from: string; to: string; label: string; weight: number; method: string; sourceId: string }
export interface ShockImpact { ticker: string; baseReturn: number; baseDollar: number; pathEdgeIds: string[]; pathLabel: string }
export interface ShockScenario { id: ScenarioId; label: string; shortLabel: string; description: string; baseSeverity: number; minSeverity: number; maxSeverity: number; severityLabel: string; keywords: string[]; nodes: ShockNode[]; edges: ShockEdge[]; impacts: ShockImpact[]; notModeled: string[]; sources: Source[]; headline: LeveledText }
