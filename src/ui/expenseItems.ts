import type { ExpenseItem } from "../engine/types";

/** Ročný súčet riadkov (mesačná suma × počet mesiacov), zaokrúhlený na centy. */
export function expenseTotal(items: ExpenseItem[] | undefined): number {
  if (!items) return 0;
  let cents = 0;
  for (const it of items) {
    const m = Number.isFinite(it.monthly) ? Math.max(0, it.monthly) : 0;
    const n = Number.isFinite(it.months) ? Math.min(12, Math.max(1, Math.round(it.months))) : 12;
    cents += Math.round(m * 100) * n;
  }
  return cents / 100;
}

export const EXPENSE_PRESETS: readonly string[] = ["Nájom", "Voda", "Plyn", "Elektrina", "Telefón", "Internet/TV"];
/** výdavky prenajímateľa (nájom je tu príjem, nie výdavok) */
export const RENTAL_EXPENSE_PRESETS: readonly string[] = ["Voda", "Plyn", "Elektrina", "Internet/TV", "Fond opráv", "Poistenie", "Daň z nehnuteľnosti"];
