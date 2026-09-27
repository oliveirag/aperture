"use client";

import { createContext, useContext } from "react";
import {
  ASSUMPTIONS,
  BEAR_STATEMENT,
  BULL_STATEMENT,
  FACT_PACK_STEPS,
  IC_AMOUNT,
  IC_DATE,
  IC_FACTS,
  IC_THESIS,
  IC_TICKER,
  MEMO,
  PORTFOLIO_FIT,
  PORTFOLIO_FIT_NOTE,
} from "@/data/ic-room";
import type { IcRunData } from "@/lib/ic/types";

// The scripted AMD run in the shared run shape. Its numbers are canon (scripts/check-canon.ts).
export const DEMO_RUN: IcRunData = {
  ticker: { ticker: IC_TICKER.ticker, name: IC_TICKER.name, color: IC_TICKER.color, apertureNote: IC_TICKER.apertureNote },
  thesis: IC_THESIS,
  amount: IC_AMOUNT,
  date: IC_DATE,
  factSteps: [...FACT_PACK_STEPS],
  facts: IC_FACTS,
  assumptions: ASSUMPTIONS,
  bullStatement: BULL_STATEMENT,
  bearStatement: BEAR_STATEMENT,
  memo: {
    stance: MEMO.stance,
    summary: MEMO.summary,
    bull: [...MEMO.bull],
    bear: [...MEMO.bear],
    keyRisks: [...MEMO.keyRisks],
    watch: [...MEMO.watch],
    chairNote: MEMO.chairNote,
  },
  fit: PORTFOLIO_FIT,
  fitNote: PORTFOLIO_FIT_NOTE,
};

// The run the stage and memo draw: the demo script, or a live run as it streams in.
export const IcDataContext = createContext<IcRunData>(DEMO_RUN);

export function useIcData() {
  return useContext(IcDataContext);
}
