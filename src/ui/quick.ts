// Pomocné funkcie pre záložku „Rýchly výpočet“.
import { calculate, defaultInput } from "../engine/calc";
import { eur } from "../engine/money";
import type { ParamSet } from "../params/types";
import type { CalcInput, LimitInfo, Profile } from "../engine/types";

export interface QuickState {
  year: number;
  income: number;
  /** null = automaticky (paušál + poistné) */
  expenses: number | null;
  /** mesačné odvody, ktoré naozaj platím; null/chýba = automaticky (minimum, resp. podľa DP) */
  spH1?: number | null;
  spH2?: number | null;
  zp?: number | null;
  /** chýba = živnosť */
  profile?: Profile;
  /** zamestnanie (profil „oboje“): príjmy, poistné, zrazené preddavky z potvrdenia; pri profile „zamestnanec“ je úhrn príjmov v `income` */
  empGross?: number | null;
  empInsurance?: number | null;
  empWithheld?: number | null;
  /** prenájom (profil „zamestnanec“): nájomné mesačne × mesiacov, výdavky */
  rentMonthly?: number | null;
  rentMonths?: number | null;
  rentExpenses?: number | null;
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

/** Zamestnanie a prenájom z rýchleho stavu podľa profilu. */
function applyProfile(i: CalcInput, q: QuickState) {
  const profile = q.profile ?? "szco";
  i.profile = profile;
  if (profile === "zamestnanec") {
    delete i.employment.items;
    delete i.rental.items;
    i.employment.gross = Math.max(0, q.income);
    i.employment.insurance = Math.max(0, q.empInsurance ?? 0);
    i.employment.taxWithheld = Math.max(0, q.empWithheld ?? 0);
    const months = Math.min(12, Math.max(0, q.rentMonths ?? 12));
    const monthly = Math.max(0, q.rentMonthly ?? 0);
    i.rental.incomeMonthly = monthly;
    i.rental.incomeMonths = months;
    i.rental.income = Math.round(monthly * months * 100) / 100;
    i.rental.expenses = Math.max(0, q.rentExpenses ?? 0);
  } else if (profile === "oboje") {
    delete i.employment.items;
    i.employment.gross = Math.max(0, q.empGross ?? 0);
    i.employment.insurance = Math.max(0, q.empInsurance ?? 0);
    i.employment.taxWithheld = Math.max(0, q.empWithheld ?? 0);
  }
}

/** CalcInput z rýchleho stavu. `withOverride=false` vráti vždy automatické výdavky. */
export function buildQuickInput(q: QuickState, withOverride = true): CalcInput {
  const i = defaultInput(q.year);
  i.income.mode = "annual";
  i.income.annual = Math.max(0, q.income);
  applyContributions(i, q);
  applyProfile(i, q);
  if (withOverride && q.expenses !== null && q.profile !== "zamestnanec") i.overrides = { ...i.overrides, vydavky: Math.max(0, q.expenses) };
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
  if (q.profile !== "zamestnanec") base.income.annual = Math.max(0, q.income);
  applyContributions(base, q);
  applyProfile(base, q);
  const overrides = { ...(base.overrides ?? {}) };
  if (q.expenses !== null && q.profile !== "zamestnanec") overrides.vydavky = Math.max(0, q.expenses);
  else delete overrides.vydavky;
  base.overrides = overrides;
  return base;
}

export interface TransferReport {
  /** čo prenos prepíše alebo zahodí v rozpracovanom podrobnom výpočte */
  overwritten: string[];
  /** čo z rozpracovaného výpočtu zostane a zmení výsledok oproti Rýchlemu výpočtu */
  kept: string[];
}

/**
 * Čo by prenos z Rýchleho výpočtu do rozpracovaného podrobného výpočtu prepísal a čo by z neho
 * zostalo (a teda výsledok podrobného výpočtu by sa nezhodoval s rýchlym). Prázdne = netreba sa pýtať.
 */
export function transferReport(q: QuickState, last: CalcInput | undefined): TransferReport {
  const none: TransferReport = { overwritten: [], kept: [] };
  if (!last) return none;
  if (last.year !== q.year) {
    const untouched = JSON.stringify(last) === JSON.stringify(defaultInput(last.year));
    return untouched ? none : { overwritten: [`celý rozpracovaný výpočet za rok ${last.year} (prepne sa na rok ${q.year})`], kept: [] };
  }
  const overwritten: string[] = [];
  const kept: string[] = [];
  const profile = q.profile ?? "szco";
  const szco = profile !== "zamestnanec";
  if (szco && last.income.mode === "monthly" && last.income.monthly.some((v) => v !== null && v !== 0))
    overwritten.push("príjmy zadané po mesiacoch (prepnú sa na ročnú sumu)");
  const emp = last.employment.items?.length ?? 0;
  if (profile !== "szco" && emp > 0) overwritten.push(emp === 1 ? "údaje zamestnávateľa" : `zoznam ${emp} zamestnávateľov`);
  if (profile === "zamestnanec" && (last.rental.items?.length ?? 0) > 0) overwritten.push("rozpis výdavkov z prenájmu");
  const ins = last.insurance;
  const manual = (a: number | null, b: number | null | undefined) => a !== null && a !== (b ?? null);
  if (manual(ins.spJanJun, q.spH1) || manual(ins.spJulDec, q.spH2) || manual(ins.zpMonthlyAmount, q.zp)) overwritten.push("ručne zadané mesačné odvody");
  if (last.overrides?.vydavky !== undefined && (q.expenses === null || !szco)) overwritten.push("ručne zadané výdavky");

  // zostane a zmení výsledok
  const steps = Object.keys(last.overrides ?? {}).filter((k) => k !== "vydavky").length;
  if (steps > 0) kept.push(steps === 1 ? "ručný prepis medzivýsledku v Postupe výpočtu" : `ručné prepisy medzivýsledkov v Postupe výpočtu (${steps})`);
  if (szco && last.expenses.mode === "actual" && q.expenses === null) kept.push("skutočné výdavky namiesto paušálu");
  if (szco && (ins.spPaid.some((v) => v !== null) || ins.zpPaid.some((v) => v !== null))) kept.push("ručne upravené mesiace zaplateného poistného");
  if (szco && ins.spRegimeH2 !== "standard") kept.push("režim sociálneho poistenia od júla");
  if (last.children.length > 0) kept.push(last.children.length === 1 ? "dieťa (daňový bonus)" : `deti (${last.children.length}, daňový bonus)`);
  if (last.spouse.claim) kept.push("nezdaniteľná časť na manžela/manželku");
  if (last.dds > 0) kept.push("príspevky na DDS");
  if (last.lossCarry > 0) kept.push("odpočet straty");
  if (last.taxAdvancesPaid > 0) kept.push("zaplatené preddavky na daň");
  if (profile !== "zamestnanec" && last.rental.income > 0) kept.push("príjmy z prenájmu");
  if ((last.other?.items.length ?? 0) > 0) kept.push("ostatné príjmy (§ 8)");
  return { overwritten, kept };
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

/**
 * Schody pre popisky značiek: v skupine blízkych značiek je prvá (najmenšia suma) najnižšie
 * a každá ďalšia o stupeň vyššie; posledná v skupine je hneď pod posuvníkom (stupeň 0).
 * xs = polohy značiek v px (zoradené), near = vzdialenosť, pod ktorou sú značky „blízko“.
 */
export function staircase(xs: number[], near: number): number[] {
  const out = new Array<number>(xs.length).fill(0);
  for (let i = xs.length - 2; i >= 0; i--) out[i] = xs[i + 1] - xs[i] < near ? out[i + 1] + 1 : 0;
  return out;
}
