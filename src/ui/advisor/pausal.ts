import { calculate } from "../../engine/calc";
import { round2 } from "../../engine/money";
import type { CalcInput, CalcResult } from "../../engine/types";
import type { ParamSet } from "../../params/types";

export interface Scenario {
  tax: number;
  odvody: number;
  /** odhad odvodov SP + ZP na celý budúci rok */
  nextOdvody: number;
  net: number;
}

export interface PausalComparison {
  pausal: Scenario;
  actual: Scenario;
  /** > 0 = paušál je výhodnejší o túto sumu čistého príjmu */
  pausalAdvantage: number;
  better: "pausal" | "actual" | "same";
}

/** odhad: 6 mesiacov súčasný SP + 6 mesiacov SP od júla + 12 × ZP */
export function nextYearOdvody(r: CalcResult): number {
  const last = r.months[r.months.length - 1];
  return round2(6 * (last?.sp ?? 0) + 6 * r.next.spFromJuly + 12 * r.next.zpMonthly);
}

const scenario = (r: CalcResult): Scenario => ({
  tax: r.summary.tax,
  odvody: round2(r.summary.sp + r.summary.zp),
  nextOdvody: nextYearOdvody(r),
  net: r.summary.net,
});

export function compareExpenses(input: CalcInput, params: ParamSet, actualExpenses: number): PausalComparison {
  const a = structuredClone(input);
  a.expenses = { ...a.expenses, mode: "pausal" };
  const b = structuredClone(input);
  b.expenses = { mode: "actual", actual: Math.max(0, actualExpenses) };
  const pausal = scenario(calculate(a, params));
  const actual = scenario(calculate(b, params));
  const adv = round2(pausal.net - actual.net);
  return { pausal, actual, pausalAdvantage: adv, better: adv > 0 ? "pausal" : adv < 0 ? "actual" : "same" };
}
