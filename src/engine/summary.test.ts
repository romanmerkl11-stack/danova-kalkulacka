import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "./calc";
import type { CalcInput } from "./types";

// Audit F01: súhrn musí mať rovnaký rozsah pri SZČO, zamestnancovi aj súbehu.
const both = (gross: number): CalcInput => {
  const i = defaultInput(2026);
  i.profile = "oboje";
  i.income.annual = 30000;
  i.employment = { ...i.employment, gross, insurance: 3200, taxWithheld: 0, bonusPaid: 0 };
  return i;
};

describe("súhrn – jednotný rozsah príjmov (audit F01)", () => {
  it("súbeh: príjmy obsahujú živnosť aj mzdu, príjem po dani odpočíta daň, odvody SZČO aj poistné zamestnanca", () => {
    const r = calculate(both(24000));
    const s = r.summary;
    expect(s.income).toBe(54000);
    const expectedNet = Math.round((54000 - s.tax - s.sp - s.zp - 3200) * 100) / 100;
    expect(s.net).toBe(expectedNet);
    expect(s.effectiveRate).toBeCloseTo((54000 - s.net) / 54000, 10);
  });

  it("zmena hrubej mzdy o 1 000 € zmení príjmy presne o 1 000 €", () => {
    expect(calculate(both(25000)).summary.income - calculate(both(24000)).summary.income).toBe(1000);
  });

  it("prenájom a § 8 sa započítajú do príjmov v každom profile", () => {
    for (const profile of ["szco", "zamestnanec", "oboje"] as const) {
      const i = defaultInput(2026);
      i.profile = profile;
      i.income.annual = profile === "zamestnanec" ? 0 : 10000;
      i.rental = { ...i.rental, income: 3000, expenses: 0 };
      i.other = { items: [{ kind: "ine", name: "test", income: 700, expenses: 0 }] };
      const base = profile === "zamestnanec" ? 0 : 10000;
      expect(calculate(i).summary.income).toBe(base + 3000 + 700);
    }
  });
});
