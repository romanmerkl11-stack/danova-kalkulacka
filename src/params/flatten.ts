// Prevod sadzieb jedného roka na plochý zoznam riadkov (pre zobrazenie a porovnanie verzií).

import { pct } from "../engine/money";
import type { P, ParamSet, YearParams } from "./types";

export interface ParamRow {
  key: string;
  group: "Daň" | "Sociálne poistenie" | "Zdravotné poistenie" | "DPH";
  label: string;
  value: number;
  unit: "€" | "%" | "x";
  p?: P;
}

export function flattenYear(y: YearParams): ParamRow[] {
  const rows: ParamRow[] = [];
  const add = (group: ParamRow["group"], key: string, label: string, v: P | number, unit: ParamRow["unit"]) => {
    if (typeof v === "number") rows.push({ key, group, label, value: v, unit });
    else rows.push({ key, group, label, value: v.value, unit, p: v });
  };

  const T = y.tax;
  if (T) {
    const d = "Daň" as const;
    add(d, "tax.zivotneMinimum", "Životné minimum", T.zivotneMinimum, "€");
    add(d, "tax.nczd", "Nezdaniteľná časť základu dane na daňovníka", T.nczd, "€");
    add(d, "tax.nczdFullUpTo", "Plná NČZD do základu dane", T.nczdFullUpTo, "€");
    add(d, "tax.nczdReduceConst", "Konštanta krátenia NČZD", T.nczdReduceConst, "€");
    add(d, "tax.nczdReduceDivisor", "Deliteľ krátenia NČZD", T.nczdReduceDivisor, "x");
    add(d, "tax.spouse", "NČZD na manžela/ku", T.spouse, "€");
    add(d, "tax.spouseFullUpTo", "Plná NČZD na manžela/ku do základu dane", T.spouseFullUpTo, "€");
    add(d, "tax.ddsMax", "Maximum odpočtu príspevkov na DDS", T.ddsMax, "€");
    T.brackets.forEach((b, i) => {
      if (b.upTo) add(d, `tax.brackets.${i}`, `Pásmo dane ${pct(b.rate)} do`, b.upTo, "€");
      else add(d, `tax.brackets.${i}`, `Pásmo dane ${pct(b.rate)} (bez hranice)`, b.rate, "%");
    });
    add(d, "tax.reducedRate", "Znížená sadzba dane", T.reducedRate, "%");
    add(d, "tax.reducedRateLimit", "Limit príjmov pre zníženú sadzbu", T.reducedRateLimit, "€");
    add(d, "tax.minTaxLevied", "Daň sa nevyrubí do", T.minTaxLevied, "€");
    add(d, "tax.pausalRate", "Paušálne výdavky – percento z príjmov", T.pausalRate, "%");
    add(d, "tax.pausalCap", "Strop paušálnych výdavkov", T.pausalCap, "€");
    T.bonusTiers.forEach((t, i) => add(d, `tax.bonusTiers.${i}`, `Daňový bonus do ${t.maxAge} rokov`, t.monthly, "€"));
    if (T.bonusReductionThreshold) add(d, "tax.bonusReductionThreshold", "Mesačný základ dane, od ktorého sa bonus kráti", T.bonusReductionThreshold, "€");
    add(d, "tax.minimalnaMzda", "Minimálna mzda", T.minimalnaMzda, "€");
    add(d, "tax.advanceQuarterly", "Preddavky na daň štvrťročne od dane nad", T.advanceQuarterly, "€");
    add(d, "tax.advanceMonthly", "Preddavky na daň mesačne od dane nad", T.advanceMonthly, "€");
  }

  const sp = y.sp;
  const s = "Sociálne poistenie" as const;
  add(s, "sp.priemernaMzda", "Priemerná mzda", sp.priemernaMzda, "€");
  add(s, "sp.minVZ", "Minimálny mesačný vymeriavací základ", sp.minVZ, "€");
  add(s, "sp.minPoistne", "Minimálne mesačné poistné", sp.minPoistne, "€");
  add(s, "sp.maxVZ", "Maximálny mesačný vymeriavací základ", sp.maxVZ, "€");
  sp.funds.forEach((f, i) => add(s, `sp.funds.${i}`, `Fond: ${f.name}`, f.rate, "%"));
  add(s, "sp.limitVzniku", "Limit príjmov pre vznik povinného poistenia", sp.limitVzniku, "€");
  add(s, "sp.koeficient", "Koeficient pre vymeriavací základ", sp.koeficient, "x");
  if (sp.mikro) {
    add(s, "sp.mikro.vz", "Mikroodvod – vymeriavací základ", sp.mikro.vz, "€");
    add(s, "sp.mikro.poistne", "Mikroodvod – mesačné poistné", sp.mikro.poistne, "€");
    if (sp.mikro.lowerIncome) add(s, "sp.mikro.lowerIncome", "Mikroodvod – dolná hranica príjmov", sp.mikro.lowerIncome, "€");
  }

  const zp = y.zp;
  const z = "Zdravotné poistenie" as const;
  add(z, "zp.rate", "Sadzba poistného", zp.rate, "%");
  add(z, "zp.minVZ", "Minimálny mesačný vymeriavací základ", zp.minVZ, "€");
  add(z, "zp.minPreddavok", "Minimálny mesačný preddavok", zp.minPreddavok, "€");
  add(z, "zp.koeficient", "Koeficient pre vymeriavací základ", zp.koeficient, "x");

  const dph = "DPH" as const;
  add(dph, "dph.registration", "Obrat, od ktorého sa stanete platiteľom DPH", y.dph.registration, "€");
  if (y.dph.immediate) add(dph, "dph.immediate", "Obrat pre okamžitú registráciu DPH", y.dph.immediate, "€");

  return rows;
}

export interface ParamDiff {
  year: number;
  key: string;
  label: string;
  before?: number;
  after?: number;
  p?: P;
}

/** Zmenené, pridané alebo odstránené hodnoty v roku. Rok, ktorý v `a` chýba, sa hlási celý ako pridaný. */
export function diffYears(a: ParamSet, b: ParamSet): ParamDiff[] {
  const out: ParamDiff[] = [];
  const years = Object.keys(b).map(Number).sort((x, y) => x - y);
  for (const year of years) {
    const rowsB = flattenYear(b[year]);
    const ya = a[year];
    const rowsA = new Map((ya ? flattenYear(ya) : []).map((r) => [r.key, r]));
    for (const r of rowsB) {
      const old = rowsA.get(r.key);
      rowsA.delete(r.key);
      if (!old) out.push({ year, key: r.key, label: r.label, after: r.value, p: r.p });
      else if (old.value !== r.value) out.push({ year, key: r.key, label: r.label, before: old.value, after: r.value, p: r.p });
    }
    for (const old of rowsA.values()) out.push({ year, key: old.key, label: old.label, before: old.value, p: old.p });
  }
  return out;
}
