import type { P } from "../params/types";

export type Month12 = (number | null)[];

export interface Child {
  name: string;
  /** "YYYY-MM" */
  birth: string;
}

export interface CalcInput {
  year: number;
  income: {
    mode: "annual" | "monthly";
    annual: number;
    /** 12 mesiacov, null = nezadané */
    monthly: Month12;
    /** pri mesačnom režime dopočítať nezadané mesiace priemerom zadaných */
    extrapolate: boolean;
  };
  insurance: {
    /** december predošlého roka sa platí v januári → v roku sa zaplatí 12/predošlý + 1–11 */
    shiftOneMonth: boolean;
    /** režim SP od júla: platím z VZ podľa DP / minimum, mikroodvod alebo nie som povinne poistený */
    spRegimeH2: "standard" | "mikro" | "none";
    /** null = minimum roka */
    spJanJun: number | null;
    spJulDec: number | null;
    zpMonthlyAmount: number | null;
    /** ručné úpravy po mesiacoch (mesiac platby 1–12), null = automaticky */
    spPaid: Month12;
    zpPaid: Month12;
  };
  expenses: { mode: "pausal" | "actual"; actual: number };
  employment: { gross: number; insurance: number; taxWithheld: number; bonusPaid: number };
  rental: { income: number; expenses: number };
  children: Child[];
  spouse: { claim: boolean; income: number; months: number };
  dds: number;
  lossCarry: number;
  taxAdvancesPaid: number;
  /** ručne prepísané medzivýsledky podľa id kroku */
  overrides: Record<string, number>;
}

export interface ParamRef {
  label: string;
  param: P;
}

export interface Step {
  id: string;
  label: string;
  value: number;
  /** vzorec s dosadenými číslami */
  formula: string;
  /** vysvetlenie bežnou rečou */
  explain?: string;
  law?: string;
  params?: ParamRef[];
  /** používateľ hodnotu prepísal */
  overridden?: boolean;
  /** dá sa prepísať */
  editable?: boolean;
  group: "prijmy" | "dan" | "odvody" | "buduci" | "zamestnanie" | "najom";
  /** riadok daňového priznania typ B (orientačne) */
  dpRow?: string;
}

export type Severity = "info" | "warn" | "danger";

export interface Warning {
  id: string;
  severity: Severity;
  text: string;
}

export interface LimitInfo {
  id: string;
  label: string;
  /** aktuálna sledovaná hodnota */
  current: number;
  limit: number;
  /** čo sa stane po prekročení */
  consequence: string;
  /** čo sa sleduje (príjmy, základ dane…) */
  measure: string;
  exceeded: boolean;
  /** pri mesačnom režime: mesiac (1–12), v ktorom sa limit pri súčasnom tempe prekročí */
  projectedMonth?: number | null;
  param?: P;
}

export interface MonthRow {
  month: number;
  income: number;
  incomeProjected: boolean;
  sp: number;
  zp: number;
  spAuto: boolean;
  zpAuto: boolean;
  /** za aký mesiac je platba (napr. "12/2025") */
  covers: string;
}

export interface NextYear {
  year: number;
  spFromJuly: number;
  spVZ: number;
  spRegime: "standard" | "mikro" | "none" | "unknown";
  zpMonthly: number;
  zpVZ: number;
  zpSettlement: number; // + nedoplatok, − preplatok za aktuálny rok
  taxAdvance: { period: "none" | "quarterly" | "monthly"; amount: number };
  paramsStatus: "platné" | "predbežné" | "chýbajú";
}

export interface CalcResult {
  year: number;
  taxParamsYear: number;
  steps: Step[];
  stepById: Record<string, Step>;
  warnings: Warning[];
  limits: LimitInfo[];
  months: MonthRow[];
  next: NextYear;
  summary: {
    income: number;
    tax: number;
    taxToPay: number;
    sp: number;
    zp: number;
    net: number;
    netMonthly: number;
    effectiveRate: number;
  };
}
