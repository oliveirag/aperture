"use client";

import { createContext, useContext } from "react";
import type { ShockModel } from "./use-shock-model";

export const ShockModelContext = createContext<ShockModel | null>(null);

export function useShockData(): ShockModel {
  const model = useContext(ShockModelContext);
  if (!model) throw new Error("useShockData outside ShockModelContext");
  return model;
}
