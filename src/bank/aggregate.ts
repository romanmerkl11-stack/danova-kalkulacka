// Súčty po mesiacoch a premietnutie do vstupu výpočtu.
import type { CalcInput } from "../engine/types";
import { round2 } from "../engine/money";
import type { ClassifiedTx } from "./types";

export interface Aggregate {
  /** null = mesiac sa nemení (mimo obdobia výpisov) alebo bez údajov */
  income: (number | null)[];
  sp: (number | null)[];
  zp: (number | null)[];
  /** počet transakcií s dátumom mimo vybraného roka */
  outsideYear: number;
  totals: { income: number; sp: number; zp: number };
  /** mesiace (index 0–11), ktoré výpisy pokrývajú – len tie sa prepíšu */
  covered: boolean[];
  /** započítateľné pohyby v inej mene než EUR – nezapočítané, treba ich zadať ručne */
  foreign: { count: number; currencies: string[] };
  /** mesiace, kde vratky prevýšili platby (suma sa zarovnala na 0) */
  negative: { kind: "income" | "sp" | "zp"; month: number; amount: number }[];
}

export const isEur = (t: { currency?: string }) => !t.currency || t.currency.trim().toUpperCase() === "EUR";

/**
 * Súčty po mesiacoch. Sumy sa sčítavajú so znamienkom: vrátená platba odberateľovi zníži príjem,
 * preplatok vrátený poisťovňou zníži zaplatené poistné. Pohyby v cudzej mene sa nezapočítajú.
 * Prepisujú sa len mesiace, ktoré výpisy pokrývajú (od prvého po posledný pohyb v roku).
 */
export function aggregate(txs: ClassifiedTx[], year: number): Aggregate {
  const inc = new Array<number>(12).fill(0);
  const sp = new Array<number>(12).fill(0);
  const zp = new Array<number>(12).fill(0);
  const spHas = new Array<boolean>(12).fill(false);
  const zpHas = new Array<boolean>(12).fill(false);
  let anyIncome = false;
  let outside = 0;
  let first = 12;
  let last = -1;
  let foreignCount = 0;
  const currencies = new Set<string>();
  for (const t of txs) {
    if (Number(t.date.slice(0, 4)) !== year) {
      outside++;
      continue;
    }
    const m = Number(t.date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    first = Math.min(first, m);
    last = Math.max(last, m);
    if (t.category === "ine") continue;
    if (!isEur(t)) {
      foreignCount++;
      currencies.add(t.currency!.trim().toUpperCase());
      continue;
    }
    if (t.category === "prijem") {
      inc[m] += t.amount;
      anyIncome = true;
    } else if (t.category === "sp") {
      sp[m] -= t.amount;
      spHas[m] = true;
    } else if (t.category === "zp") {
      zp[m] -= t.amount;
      zpHas[m] = true;
    }
  }
  const covered = Array.from({ length: 12 }, (_, i) => i >= first && i <= last);
  const negative: Aggregate["negative"] = [];
  const clamp = (kind: "income" | "sp" | "zp", v: number, i: number) => {
    const r = round2(v);
    if (r < 0) {
      negative.push({ kind, month: i + 1, amount: r });
      return 0;
    }
    return r;
  };
  const income = inc.map((v, i) => (anyIncome && covered[i] ? clamp("income", v, i) : null));
  const spOut = sp.map((v, i) => (spHas[i] ? clamp("sp", v, i) : null));
  const zpOut = zp.map((v, i) => (zpHas[i] ? clamp("zp", v, i) : null));
  const tot = (a: (number | null)[]) => round2(a.reduce<number>((s, v) => s + (v ?? 0), 0));
  return {
    income,
    sp: spOut,
    zp: zpOut,
    outsideYear: outside,
    totals: { income: tot(income), sp: tot(spOut), zp: tot(zpOut) },
    covered,
    foreign: { count: foreignCount, currencies: [...currencies].sort() },
    negative,
  };
}

export interface ApplyOpts {
  income: boolean;
  sp: boolean;
  zp: boolean;
}

/** mesiace mimo obdobia výpisov ostanú tak, ako boli */
const mergeMonths = <T,>(old: T[], next: T[], covered: boolean[]): T[] => old.map((v, i) => (covered[i] ? next[i] : v));

export function applyToInput(input: CalcInput, agg: Aggregate, opts: ApplyOpts): CalcInput {
  return {
    ...input,
    income: opts.income
      ? { ...input.income, mode: "monthly", monthly: mergeMonths(input.income.monthly, agg.income, agg.covered) as CalcInput["income"]["monthly"] }
      : input.income,
    insurance: {
      ...input.insurance,
      spPaid: opts.sp ? (mergeMonths(input.insurance.spPaid, agg.sp, agg.covered) as CalcInput["insurance"]["spPaid"]) : input.insurance.spPaid,
      zpPaid: opts.zp ? (mergeMonths(input.insurance.zpPaid, agg.zp, agg.covered) as CalcInput["insurance"]["zpPaid"]) : input.insurance.zpPaid,
    },
  };
}
