import { calculate } from "../../engine/calc";
import { eur, pct, round2 } from "../../engine/money";
import type { CalcInput, CalcResult } from "../../engine/types";
import { flattenYear } from "../../params/flatten";
import type { ParamSet } from "../../params/types";
import type { SavedCalc } from "../../store/storage";

export interface YoyRow {
  label: string;
  prev: number;
  cur: number;
  kind: "eur" | "pct";
  /** true = vyššia hodnota je pre používateľa lepšia */
  higherBetter: boolean;
}

export const odvodyOf = (r: CalcResult) => (r.profile === "zamestnanec" ? (r.summary.employeeInsurance ?? 0) : round2(r.summary.sp + r.summary.zp));

export function yoyRows(prev: CalcResult, cur: CalcResult): YoyRow[] {
  return [
    { label: "Príjmy", prev: prev.summary.income, cur: cur.summary.income, kind: "eur", higherBetter: true },
    { label: "Daň", prev: prev.summary.tax, cur: cur.summary.tax, kind: "eur", higherBetter: false },
    { label: "Odvody spolu", prev: odvodyOf(prev), cur: odvodyOf(cur), kind: "eur", higherBetter: false },
    { label: "Čistý príjem", prev: prev.summary.net, cur: cur.summary.net, kind: "eur", higherBetter: true },
    { label: "Efektívne zaťaženie", prev: prev.summary.effectiveRate, cur: cur.summary.effectiveRate, kind: "pct", higherBetter: false },
  ];
}

export const fmtYoy = (v: number, kind: YoyRow["kind"]) => (kind === "eur" ? eur(v) : pct(v));
/** "good" | "bad" | "" podľa toho, či je zmena pre používateľa lepšia */
export function yoyTone(r: YoyRow): "good" | "bad" | "" {
  const d = round2(r.cur - r.prev);
  if (Math.abs(r.cur - r.prev) < (r.kind === "pct" ? 0.0001 : 0.005) || d === 0) return "";
  return d > 0 === r.higherBetter ? "good" : "bad";
}

/** najnovší uložený výpočet za predošlý rok (prednostne s rovnakou prezývkou) */
export function findPrevSaved(calcs: SavedCalc[], year: number, nickname: string): SavedCalc | null {
  const prev = calcs.filter((c) => c.year === year - 1).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const nick = nickname.trim();
  return (nick ? prev.find((c) => (c.nickname ?? "") === nick) : undefined) ?? prev[0] ?? null;
}

export interface PrevResult {
  result: CalcResult;
  label: string;
}

export function previousYearResult(input: CalcInput, params: ParamSet, calcs: SavedCalc[], nickname: string): PrevResult | null {
  const Y = input.year;
  try {
    const saved = findPrevSaved(calcs, Y, nickname);
    if (saved) return { result: calculate(saved.input, params), label: `uložený výpočet „${saved.title}“` };
    if (!params[Y - 1]) return null;
    const i = structuredClone(input);
    i.year = Y - 1;
    return { result: calculate(i, params), label: `rovnaké príjmy v roku ${Y - 1}` };
  } catch {
    return null;
  }
}

const FYI_KEYS: [string, string][] = [
  ["sp.minPoistne", "Minimálne mesačné poistné SP"],
  ["sp.minVZ", "Minimálny vymeriavací základ SP"],
  ["tax.nczd", "Nezdaniteľná časť základu dane"],
  ["zp.rate", "Sadzba zdravotného poistenia"],
  ["zp.minPreddavok", "Minimálny preddavok ZP"],
  ["tax.pausalCap", "Strop paušálnych výdavkov"],
  ["tax.minimalnaMzda", "Minimálna mzda"],
];

/** max. 4 jednoriadkové fakty z rozdielov sadzieb medzi rokmi */
export function fyiFacts(params: ParamSet, year: number): string[] {
  const a = params[year - 1];
  const b = params[year];
  if (!a || !b) return [];
  const ra = new Map(flattenYear(a).map((r) => [r.key, r]));
  const rb = new Map(flattenYear(b).map((r) => [r.key, r]));
  const out: string[] = [];
  for (const [key, label] of FYI_KEYS) {
    const x = ra.get(key);
    const y = rb.get(key);
    if (!x || !y || x.value === y.value) continue;
    const f = (v: number) => (y.unit === "%" ? pct(v) : y.unit === "€" ? eur(v) : String(v));
    out.push(`${label}: z ${f(x.value)} na ${f(y.value)}.`);
    if (out.length === 4) break;
  }
  return out;
}
