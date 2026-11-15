// Rozpis odvodov: z čoho sa skladá mesačná platba SP (fondy) a ZP.
import { spFromVZ } from "../engine/calc";
import { floor2, round2 } from "../engine/money";
import type { MonthRow } from "../engine/types";
import type { SpParams } from "../params/types";

export interface FundPart {
  name: string;
  rate: number;
  amount: number;
  what: string;
}

export interface SpBreakdown {
  amount: number;
  vz: number;
  /** false = suma nezodpovedá presne žiadnemu vymeriavaciemu základu, rozpis je pomerný */
  exact: boolean;
  parts: FundPart[];
}

export const FUND_INFO: Record<string, string> = {
  nemocenské: "nemocenské dávky – PN, materské (od 4. dňa PN platí Sociálna poisťovňa)",
  starobné: "starobný dôchodok (ak ste v 2. pilieri, časť ide do dôchodkovej správcovskej spoločnosti)",
  invalidné: "invalidný dôchodok pri dlhodobej strate schopnosti pracovať",
  "rezervný fond": "rezervný fond solidarity – dopĺňa dôchodkový systém, priamo z neho dávku nedostanete",
};

/** Rozloží mesačné sociálne poistenie na fondy. Hľadá vymeriavací základ, z ktorého vyjde presne zadaná suma. */
export function spBreakdown(amount: number, sp: SpParams): SpBreakdown {
  const total = sp.funds.reduce((a, f) => a + f.rate, 0);
  const guess = round2(amount / total);
  for (let d = 0; d <= 10; d++) {
    for (const vz of d === 0 ? [guess] : [round2(guess + d / 100), round2(guess - d / 100)]) {
      if (vz > 0 && spFromVZ(vz, sp) === round2(amount)) {
        return { amount, vz, exact: true, parts: sp.funds.map((f) => ({ name: f.name, rate: f.rate, amount: floor2(vz * f.rate), what: FUND_INFO[f.name] ?? "" })) };
      }
    }
  }
  return {
    amount,
    vz: guess,
    exact: false,
    parts: sp.funds.map((f) => ({ name: f.name, rate: f.rate, amount: round2((amount * f.rate) / total), what: FUND_INFO[f.name] ?? "" })),
  };
}

export interface Period {
  from: string;
  to: string;
  amount: number;
  auto: boolean;
}

/** Zoskupí po sebe idúce mesiace s rovnakou platbou (podľa obdobia, za ktoré sa platí). */
export function periods(months: MonthRow[], kind: "sp" | "zp"): Period[] {
  const out: Period[] = [];
  for (const m of months) {
    const amount = round2(m[kind]);
    const auto = kind === "sp" ? m.spAuto : m.zpAuto;
    const last = out[out.length - 1];
    if (last && last.amount === amount && last.auto === auto) last.to = m.covers;
    else out.push({ from: m.covers, to: m.covers, amount, auto });
  }
  return out;
}
