// Pomocné funkcie pre záložku „Rýchly výpočet“.
import { calculate, defaultInput } from "../engine/calc";
import { eur } from "../engine/money";
import type { ParamSet } from "../params/types";
import type { CalcInput, LimitInfo } from "../engine/types";

export interface QuickState {
  year: number;
  income: number;
  /** null = automaticky (paušál + poistné) */
  expenses: number | null;
  /** mesačné odvody, ktoré naozaj platím; null/chýba = automaticky (minimum, resp. podľa DP) */
  spH1?: number | null;
  spH2?: number | null;
  zp?: number | null;
}

/** Stav bez ručne zadaných odvodov (na zobrazenie automatických súm). */
export const withoutOwnContributions = (q: QuickState): QuickState => ({ ...q, spH1: null, spH2: null, zp: null });

function applyContributions(i: CalcInput, q: QuickState) {
  i.insurance.spJanJun = q.spH1 ?? null;
  i.insurance.spJulDec = q.spH2 ?? null;
  i.insurance.zpMonthlyAmount = q.zp ?? null;
}

export const SLIDER_STEP = 100;
export const SLIDER_MIN_MAX = 120000;

/** CalcInput z rýchleho stavu. `withOverride=false` vráti vždy automatické výdavky. */
export function buildQuickInput(q: QuickState, withOverride = true): CalcInput {
  const i = defaultInput(q.year);
  i.income.mode = "annual";
  i.income.annual = Math.max(0, q.income);
  applyContributions(i, q);
  if (withOverride && q.expenses !== null) i.overrides = { ...i.overrides, vydavky: Math.max(0, q.expenses) };
  return i;
}

/** Limity odvodené od príjmov / obratu (nie od základu dane). */
export function incomeLimits(limits: LimitInfo[]): LimitInfo[] {
  return limits
    .filter((l) => l.measure === "príjmy" || l.measure.startsWith("obrat"))
    .sort((a, b) => a.limit - b.limit);
}

export function sliderMax(limits: LimitInfo[]): number {
  const top = Math.max(0, ...incomeLimits(limits).map((l) => l.limit));
  return Math.ceil(Math.max(SLIDER_MIN_MAX, top * 1.25) / 1000) * 1000;
}

/** Vstup pre podrobný výpočet: zachová ostatné polia existujúceho vstupu, ak je ten istý rok. */
export function toDetailedInput(q: QuickState, last: CalcInput | undefined): CalcInput {
  const base = last && last.year === q.year ? structuredClone(last) : defaultInput(q.year);
  base.income.mode = "annual";
  base.income.annual = Math.max(0, q.income);
  applyContributions(base, q);
  const overrides = { ...(base.overrides ?? {}) };
  if (q.expenses !== null) overrides.vydavky = Math.max(0, q.expenses);
  else delete overrides.vydavky;
  base.overrides = overrides;
  return base;
}

/** Príjem, pri ktorom čiastkový základ dane zo živnosti (czd6) dosiahne `targetZd` (binárne hľadanie; czd6 s príjmom neklesá). */
function incomeForZd(q: QuickState, params: ParamSet, targetZd: number): number | null {
  const zd = (income: number) => calculate(buildQuickInput({ ...q, income }), params).stepById["czd6"]?.value ?? 0;
  let lo = 0;
  let hi = 1_000_000;
  if (zd(hi) < targetZd) return null;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (zd(mid) > targetZd) hi = mid;
    else lo = mid;
  }
  return Math.round(hi * 100) / 100;
}

/**
 * Hranice príjmu, nad ktorými budú odvody na budúci rok vyššie ako minimum (SP od 7/Y+1, ZP preddavky Y+1).
 * Nezávisí od samotného príjmu – volať s memo podľa roka, výdavkov a odvodov.
 */
export function contributionThresholds(q: QuickState, params: ParamSet): { id: string; label: string; limit: number; consequence: string }[] {
  const next = params[q.year + 1] ?? params[q.year];
  if (!next) return [];
  const N = q.year + 1;
  const out: { id: string; label: string; limit: number; consequence: string }[] = [];
  const sp = next.sp;
  const spLimit = incomeForZd(q, params, sp.minVZ.value * 12 * sp.koeficient);
  if (spLimit !== null) {
    out.push({
      id: "spNadMin",
      label: `SP nad minimum od 7/${N}`,
      limit: spLimit,
      consequence: `Sociálne poistenie od júla ${N} bude vyššie ako minimum (${eur(sp.minPoistne.value)} mesačne).`,
    });
  }
  const zp = next.zp;
  const zpLimit = incomeForZd(q, params, zp.minVZ.value * 12 * zp.koeficient);
  if (zpLimit !== null) {
    out.push({
      id: "zpNadMin",
      label: `ZP nad minimum ${N}`,
      limit: zpLimit,
      consequence: `Preddavky na zdravotné poistenie v roku ${N} budú vyššie ako minimum (${eur(zp.minPreddavok.value)} mesačne) – zmenia sa po podaní daňového priznania.`,
    });
  }
  return out;
}

/** Príjem, od ktorého vznikne daň z príjmov (daň > 0; do 17 € sa daň nevyrubí). Nezávisí od samotného príjmu. */
export function taxStartThreshold(q: QuickState, params: ParamSet): { id: string; label: string; limit: number; consequence: string }[] {
  const tax = (income: number) => calculate(buildQuickInput({ ...q, income }), params).summary.tax;
  let lo = 0;
  let hi = 1_000_000;
  if (tax(hi) <= 0) return [];
  if (tax(lo) > 0) return [];
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (tax(mid) > 0) hi = mid;
    else lo = mid;
  }
  return [
    {
      id: "danStart",
      label: "Začnete platiť daň",
      limit: Math.round(hi * 100) / 100,
      consequence: "Nad touto sumou príjmov vám už vznikne daň z príjmov (základ dane prevýši nezdaniteľnú časť a daň presiahne 17 €, do ktorých sa nevyrubuje).",
    },
  ];
}

/** Hranice odvodov ako limity pre aktuálny príjem (na značky posuvníka a varovania). */
export function contributionLimits(thresholds: ReturnType<typeof contributionThresholds>, income: number): LimitInfo[] {
  return thresholds.map((t) => ({ ...t, current: income, measure: "príjmy", exceeded: income > t.limit }));
}
