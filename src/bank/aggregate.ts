// Súčty po mesiacoch a premietnutie do vstupu výpočtu.
import type { CalcInput } from "../engine/types";
import { round2 } from "../engine/money";
import type { ClassifiedTx } from "./types";

export interface Aggregate {
  income: (number | null)[];
  sp: (number | null)[];
  zp: (number | null)[];
  /** počet transakcií s dátumom mimo vybraného roka */
  outsideYear: number;
  totals: { income: number; sp: number; zp: number };
}

export function aggregate(txs: ClassifiedTx[], year: number): Aggregate {
  const inc = new Array<number>(12).fill(0);
  const sp = new Array<number>(12).fill(0);
  const zp = new Array<number>(12).fill(0);
  const spHas = new Array<boolean>(12).fill(false);
  const zpHas = new Array<boolean>(12).fill(false);
  let anyIncome = false;
  let outside = 0;
  for (const t of txs) {
    if (Number(t.date.slice(0, 4)) !== year) {
      outside++;
      continue;
    }
    const m = Number(t.date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    if (t.category === "prijem") {
      inc[m] += Math.abs(t.amount);
      anyIncome = true;
    } else if (t.category === "sp") {
      sp[m] += Math.abs(t.amount);
      spHas[m] = true;
    } else if (t.category === "zp") {
      zp[m] += Math.abs(t.amount);
      zpHas[m] = true;
    }
  }
  const income = inc.map((v) => (anyIncome ? round2(v) : null));
  const spOut = sp.map((v, i) => (spHas[i] ? round2(v) : null));
  const zpOut = zp.map((v, i) => (zpHas[i] ? round2(v) : null));
  const tot = (a: (number | null)[]) => round2(a.reduce<number>((s, v) => s + (v ?? 0), 0));
  return { income, sp: spOut, zp: zpOut, outsideYear: outside, totals: { income: tot(income), sp: tot(spOut), zp: tot(zpOut) } };
}

export interface ApplyOpts {
  income: boolean;
  sp: boolean;
  zp: boolean;
}

export function applyToInput(input: CalcInput, agg: Aggregate, opts: ApplyOpts): CalcInput {
  return {
    ...input,
    income: opts.income ? { ...input.income, mode: "monthly", monthly: [...agg.income] } : input.income,
    insurance: {
      ...input.insurance,
      spPaid: opts.sp ? [...agg.sp] : input.insurance.spPaid,
      zpPaid: opts.zp ? [...agg.zp] : input.insurance.zpPaid,
    },
  };
}
