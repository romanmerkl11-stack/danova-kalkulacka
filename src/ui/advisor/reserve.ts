import type { CalcResult } from "../../engine/types";
import { round2 } from "../../engine/money";
import { iso, todayIso } from "./dates";

export interface Reserve {
  year: number;
  /** termín úhrady dane a nedoplatku ZP: 31. 3. nasledujúceho roka */
  deadline: string;
  tax: number;
  zpSettlement: number;
  total: number;
  /** počet mesiacov (vrátane aktuálneho) do termínu, 0 = po termíne */
  monthsLeft: number;
  /** mesačná suma na odkladanie; null ak treba platiť hneď */
  monthly: number | null;
  payNow: boolean;
  includeZp: boolean;
  /** zvýšenie mesačných odvodov od budúceho roka (informatívne) */
  increase: { spNow: number; zpNow: number; spNext: number; zpNext: number; spDiff: number; zpDiff: number } | null;
}

/**
 * Rezerva = (daň na úhradu + nedoplatok ZP) / počet mesiacov od tohto mesiaca po marec Y+1 (vrátane).
 * Zamestnanec: iba daň. Ak je termín (31. 3. Y+1) preč, suma sa má zaplatiť hneď.
 */
export function computeReserve(r: CalcResult, now: Date): Reserve {
  const Y = r.year;
  const includeZp = r.profile !== "zamestnanec";
  const tax = Math.max(0, r.summary.taxToPay);
  const zpSettlement = includeZp ? Math.max(0, r.next.zpSettlement) : 0;
  const total = round2(tax + zpSettlement);
  const deadline = iso(Y + 1, 3, 31);
  const today = todayIso(now);
  const payNow = total > 0 && today > deadline;
  // ak je rok výpočtu v budúcnosti, odkladá sa od januára roka Y
  const fromY = Math.max(now.getFullYear(), Y);
  const fromM = now.getFullYear() < Y ? 1 : now.getMonth() + 1;
  const monthsLeft = today > deadline ? 0 : Math.max(1, (Y + 1 - fromY) * 12 + 3 - fromM + 1);
  const monthly = total <= 0 || payNow ? (total <= 0 ? 0 : null) : round2(total / monthsLeft);
  let increase: Reserve["increase"] = null;
  // neznáme sadzby budúceho roka → nárast odvodov neukazovať (nie je to 0 €, audit F02)
  if (includeZp && r.next.paramsStatus !== "chýbajú") {
    const last = r.months[r.months.length - 1];
    const spNow = last?.sp ?? 0;
    const zpNow = last?.zp ?? 0;
    increase = {
      spNow,
      zpNow,
      spNext: r.next.spFromJuly,
      zpNext: r.next.zpMonthly,
      spDiff: round2(r.next.spFromJuly - spNow),
      zpDiff: round2(r.next.zpMonthly - zpNow),
    };
  }
  return { year: Y, deadline, tax, zpSettlement, total, monthsLeft, monthly, payNow, includeZp, increase };
}
