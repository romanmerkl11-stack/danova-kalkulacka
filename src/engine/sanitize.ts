// Kontrola vstupu výpočtu načítaného z úložiska, zálohy alebo Histórie (F15).
// Chýbajúce polia (napr. zo staršej verzie) sa doplnia predvolenými, neplatné čísla nahradia,
// mesiace zarovnajú na 12. Výsledok je vždy platný CalcInput – výpočet nespadne ani neukáže „NaN €“.
import { defaultInput } from "./calc";
import type { CalcInput, Child, EmployerItem, ExpenseItem, Month12, OtherItem, Profile } from "./types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** konečné nezáporné číslo, inak predvolené */
const num = (v: unknown, def: number): number => (isNum(v) && v >= 0 ? v : def);
const numOrNull = (v: unknown, def: number | null): number | null => (v === null ? null : isNum(v) && v >= 0 ? v : def);
const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
const str = (v: unknown, def = ""): string => (typeof v === "string" ? v : def);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
const intIn = (v: unknown, min: number, max: number, def: number): number => (isNum(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);

function month12(v: unknown): Month12 {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: 12 }, (_, i) => (isNum(a[i]) && a[i] >= 0 ? (a[i] as number) : null));
}

/** položky zoznamu: len objekty, každá prečistená; prázdny/neplatný zoznam → undefined */
function list<T>(v: unknown, item: (o: Obj) => T): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x) => x && typeof x === "object" && !Array.isArray(x)).map((x) => item(x as Obj));
}

const expenseItem = (o: Obj): ExpenseItem => ({ name: str(o.name), monthly: num(o.monthly, 0), months: intIn(o.months, 1, 12, 12) });
const employerItem = (o: Obj): EmployerItem => ({
  name: str(o.name),
  gross: num(o.gross, 0),
  insurance: num(o.insurance, 0),
  taxWithheld: num(o.taxWithheld, 0),
  bonusPaid: num(o.bonusPaid, 0),
});
const otherItem = (o: Obj): OtherItem => ({
  kind: oneOf(o.kind, ["prilezitostna", "ine"] as const, "ine"),
  name: str(o.name),
  income: num(o.income, 0),
  expenses: num(o.expenses, 0),
});
const child = (o: Obj): Child => ({ name: str(o.name), birth: /^\d{4}-\d{2}$/.test(str(o.birth)) ? str(o.birth) : "" });

export function sanitizeInput(raw: unknown, fallbackYear: number): CalcInput {
  const r = obj(raw);
  const year = isNum(r.year) && Number.isInteger(r.year) && r.year >= 2000 && r.year <= 2100 ? r.year : fallbackYear;
  const d = defaultInput(year);

  const inc = obj(r.income);
  const ins = obj(r.insurance);
  const exp = obj(r.expenses);
  const emp = obj(r.employment);
  const ren = obj(r.rental);
  const sp = obj(r.spouse);

  const out: CalcInput = {
    year,
    profile: oneOf<Profile>(r.profile, ["szco", "zamestnanec", "oboje"], "szco"),
    income: {
      mode: oneOf(inc.mode, ["annual", "monthly"] as const, d.income.mode),
      annual: num(inc.annual, 0),
      monthly: month12(inc.monthly),
      extrapolate: bool(inc.extrapolate, d.income.extrapolate),
    },
    insurance: {
      shiftOneMonth: bool(ins.shiftOneMonth, d.insurance.shiftOneMonth),
      spRegimeH2: oneOf(ins.spRegimeH2, ["standard", "mikro", "none"] as const, "standard"),
      spJanJun: numOrNull(ins.spJanJun, null),
      spJulDec: numOrNull(ins.spJulDec, null),
      zpMonthlyAmount: numOrNull(ins.zpMonthlyAmount, null),
      spPaid: month12(ins.spPaid),
      zpPaid: month12(ins.zpPaid),
    },
    expenses: { mode: oneOf(exp.mode, ["pausal", "actual"] as const, "pausal"), actual: num(exp.actual, 0) },
    employment: {
      gross: num(emp.gross, 0),
      insurance: num(emp.insurance, 0),
      taxWithheld: num(emp.taxWithheld, 0),
      bonusPaid: num(emp.bonusPaid, 0),
    },
    rental: { income: num(ren.income, 0), expenses: num(ren.expenses, 0) },
    children: list(r.children, child) ?? [],
    spouse: { claim: bool(sp.claim, false), income: num(sp.income, 0), months: intIn(sp.months, 1, 12, 12) },
    dds: num(r.dds, 0),
    lossCarry: num(r.lossCarry, 0),
    taxAdvancesPaid: num(r.taxAdvancesPaid, 0),
    overrides: {},
  };

  const expItems = list(exp.items, expenseItem);
  if (expItems) out.expenses.items = expItems;
  const empItems = list(emp.items, employerItem);
  if (empItems) out.employment.items = empItems;
  const renItems = list(ren.items, expenseItem);
  if (renItems) out.rental.items = renItems;
  if (isNum(ren.incomeMonthly) && ren.incomeMonthly >= 0) out.rental.incomeMonthly = ren.incomeMonthly;
  if (isNum(ren.incomeMonths)) out.rental.incomeMonths = intIn(ren.incomeMonths, 0, 12, 12);
  const other = list(obj(r.other).items, otherItem);
  if (other) out.other = { items: other };
  // prepísané medzivýsledky môžu byť aj záporné (napr. preplatok), len musia byť konečné čísla
  for (const [k, v] of Object.entries(obj(r.overrides))) if (isNum(v)) out.overrides[k] = v;
  return out;
}
