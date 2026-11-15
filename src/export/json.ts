// Export / import jedného výpočtu do JSON súboru.

import { defaultInput } from "../engine/calc";
import type { CalcInput } from "../engine/types";
import type { SavedCalc } from "../store/storage";

export const JSON_FORMAT = "danova-kalkulacka/vypocet";
export const JSON_VERSION = 1;

export type CalcData = Omit<SavedCalc, "id">;

export function calcToJson(saved: CalcData | SavedCalc): string {
  const { id: _id, ...calc } = saved as SavedCalc;
  void _id;
  return JSON.stringify({ format: JSON_FORMAT, version: JSON_VERSION, exportedAt: new Date().toISOString(), calc }, null, 1);
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, d = "") => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);

/** Doplní chýbajúce polia vstupu predvolenými hodnotami (kompatibilita s novšími verziami). */
function mergeInput(raw: Record<string, unknown>): CalcInput {
  const year = raw.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Súbor neobsahuje platný rok výpočtu.");
  const d = defaultInput(year);
  const sect = <T extends object>(base: T, v: unknown): T => (isObj(v) ? { ...base, ...(v as Partial<T>) } : base);
  const out: CalcInput = {
    ...d,
    ...(raw as Partial<CalcInput>),
    year,
    income: sect(d.income, raw.income),
    insurance: sect(d.insurance, raw.insurance),
    expenses: sect(d.expenses, raw.expenses),
    employment: sect(d.employment, raw.employment),
    rental: sect(d.rental, raw.rental),
    spouse: sect(d.spouse, raw.spouse),
    children: Array.isArray(raw.children) ? (raw.children as CalcInput["children"]) : [],
    overrides: isObj(raw.overrides) ? (raw.overrides as Record<string, number>) : {},
  };
  if (out.profile !== "szco" && out.profile !== "zamestnanec" && out.profile !== "oboje") out.profile = "szco";
  if (out.employment.items !== undefined && !Array.isArray(out.employment.items)) delete out.employment.items;
  if (raw.other !== undefined) {
    const items = isObj(raw.other) && Array.isArray(raw.other.items) ? (raw.other.items as unknown[]).filter(isObj) : [];
    out.other = {
      items: items.map((it) => ({
        kind: it.kind === "ine" ? "ine" : "prilezitostna",
        name: str(it.name),
        income: num(it.income),
        expenses: num(it.expenses),
      })),
    };
  }
  const fix12 = (a: unknown, fb: (number | null)[]) =>
    Array.isArray(a) ? Array.from({ length: 12 }, (_, i) => (typeof a[i] === "number" ? (a[i] as number) : null)) : fb;
  out.income.monthly = fix12(out.income.monthly, d.income.monthly);
  out.insurance.spPaid = fix12(out.insurance.spPaid, d.insurance.spPaid);
  out.insurance.zpPaid = fix12(out.insurance.zpPaid, d.insurance.zpPaid);
  return out;
}

export function parseCalcJson(text: string): CalcData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Súbor nie je platný JSON.");
  }
  if (!isObj(raw) || raw.format !== JSON_FORMAT) throw new Error("Súbor nie je export výpočtu z Daňovej kalkulačky.");
  if (raw.version !== JSON_VERSION) throw new Error(`Nepodporovaná verzia súboru (${String(raw.version)}). Aktualizujte aplikáciu.`);
  const c = raw.calc;
  if (!isObj(c) || !isObj(c.input) || !isObj(c.input.income)) throw new Error("Súbor neobsahuje údaje výpočtu.");
  const input = mergeInput(c.input);
  const now = new Date().toISOString();
  const s = isObj(c.summary) ? c.summary : {};
  return {
    ico: str(c.ico),
    companyName: str(c.companyName, str(c.ico) || "Bez IČO"),
    title: str(c.title, `Výpočet ${input.year}`),
    year: input.year,
    createdAt: str(c.createdAt, now),
    updatedAt: str(c.updatedAt, now),
    input,
    summary: { income: num(s.income), tax: num(s.tax), taxToPay: num(s.taxToPay), sp: num(s.sp), zp: num(s.zp), net: num(s.net) },
  };
}
