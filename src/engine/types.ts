import type { P } from "../params/types";

export type Month12 = (number | null)[];

export interface Child {
  name: string;
  /** "YYYY-MM" */
  birth: string;
}

/** riadok mesačného výdavku (voda, plyn, nájom…) – ročne = monthly × months */
export interface ExpenseItem {
  name: string;
  monthly: number;
  /** počet mesiacov v roku (1–12) */
  months: number;
}

export type Profile = "szco" | "zamestnanec" | "oboje";

/** jeden zamestnávateľ (podľa Potvrdenia o zdaniteľnej mzde) */
export interface EmployerItem {
  name: string;
  gross: number;
  insurance: number;
  taxWithheld: number;
  bonusPaid: number;
}

/** príjem podľa § 8 */
export interface OtherItem {
  kind: "prilezitostna" | "ine";
  name: string;
  income: number;
  expenses: number;
}

export interface CalcInput {
  year: number;
  /** chýba = "szco" */
  profile?: Profile;
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
  expenses: { mode: "pausal" | "actual"; actual: number; /** rozpis po riadkoch; actual = súčet */ items?: ExpenseItem[] };
  /** pri zadaných `items` sa súčty počítajú z nich (plochá časť sa ignoruje) */
  employment: { gross: number; insurance: number; taxWithheld: number; bonusPaid: number; items?: EmployerItem[] };
  /** ostatné príjmy § 8 */
  other?: { items: OtherItem[] };
  rental: {
    income: number;
    /** príjem zadaný mesačne: nájomné × počet mesiacov = income */
    incomeMonthly?: number;
    incomeMonths?: number;
    expenses: number; /** rozpis po riadkoch; expenses = súčet */ items?: ExpenseItem[] };
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
  group: "prijmy" | "dan" | "odvody" | "buduci" | "zamestnanie" | "najom" | "ostatne";
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

export interface FilingInfo {
  mustFile: boolean;
  type: "A" | "B" | null;
  /** zamestnanec s príjmom len podľa § 5 môže požiadať o ročné zúčtovanie u zamestnávateľa (do 15. 2.) */
  canUseRZ: boolean;
  deadline: string;
  reasons: string[];
}

export interface CalcResult {
  year: number;
  profile: Profile;
  filing: FilingInfo;
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
    /** poistné zamestnanca (je už v základe § 5) */
    employeeInsurance?: number;
  };
}
