import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "./calc";
import { sanitizeInput } from "./sanitize";
import type { CalcInput } from "./types";

const full = (): CalcInput => {
  const i = defaultInput(2026);
  i.profile = "oboje";
  i.income = { mode: "monthly", annual: 0, monthly: [1000, null, 2000, null, null, null, null, null, null, null, null, 500], extrapolate: false };
  i.insurance.spJanJun = 300;
  i.insurance.spPaid[2] = 310;
  i.insurance.spRegimeH2 = "mikro";
  i.expenses = { mode: "actual", actual: 120, items: [{ name: "Internet", monthly: 10, months: 12 }] };
  i.employment = { gross: 10000, insurance: 1340, taxWithheld: 800, bonusPaid: 0, items: [{ name: "A", gross: 10000, insurance: 1340, taxWithheld: 800, bonusPaid: 0 }] };
  i.rental = { income: 6000, incomeMonthly: 500, incomeMonths: 12, expenses: 100, items: [{ name: "Voda", monthly: 10, months: 10 }] };
  i.other = { items: [{ kind: "prilezitostna", name: "Brigáda", income: 400, expenses: 0 }] };
  i.children = [{ name: "Ema", birth: "2015-03" }];
  i.spouse = { claim: true, income: 1000, months: 6 };
  i.dds = 180;
  i.lossCarry = 50;
  i.taxAdvancesPaid = 200;
  i.overrides = { vydavky: 5000, danNaUhradu: -20 };
  return i;
};

describe("F15 – kontrola uloženého vstupu", () => {
  it("platný vstup ostane bez zmeny", () => {
    expect(sanitizeInput(defaultInput(2026), 2025)).toEqual(defaultInput(2026));
    expect(sanitizeInput(full(), 2025)).toEqual(full());
  });

  it("chýbajúce časti (staršia verzia) sa doplnia predvolenými", () => {
    const r = sanitizeInput({ year: 2025, income: { annual: 30000 } }, 2026);
    expect(r.year).toBe(2025);
    expect(r.income.annual).toBe(30000);
    expect(r.income.monthly).toHaveLength(12);
    expect(r.insurance).toEqual(defaultInput(2025).insurance);
    expect(r.children).toEqual([]);
  });

  it("nezmysly sa nahradia: zlé čísla, typy, dĺžka mesiacov, neznáme hodnoty", () => {
    const r = sanitizeInput(
      {
        year: "2026",
        profile: "sro",
        income: { mode: "x", annual: "1000", monthly: [5, "a", -3, NaN], extrapolate: "ano" },
        insurance: { spJanJun: Infinity, spPaid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
        employment: { gross: -5, items: ["x", { name: 3, gross: "1" }] },
        children: [null, { name: "A", birth: "nikdy" }],
        spouse: { months: 40 },
        overrides: { a: "5", b: 7 },
      },
      2026,
    );
    expect(r.year).toBe(2026);
    expect(r.profile).toBe("szco");
    expect(r.income.mode).toBe("annual");
    expect(r.income.annual).toBe(0);
    expect(r.income.monthly).toEqual([5, null, null, null, null, null, null, null, null, null, null, null]);
    expect(r.income.extrapolate).toBe(true);
    expect(r.insurance.spJanJun).toBeNull();
    expect(r.insurance.spPaid).toHaveLength(12);
    expect(r.employment.gross).toBe(0);
    expect(r.employment.items).toEqual([{ name: "", gross: 0, insurance: 0, taxWithheld: 0, bonusPaid: 0 }]);
    expect(r.children).toEqual([{ name: "A", birth: "" }]);
    expect(r.spouse.months).toBe(12);
    expect(r.overrides).toEqual({ b: 7 });
  });

  it("výpočet z prečisteného nezmyslu nespadne a nemá NaN", () => {
    for (const raw of [null, 5, "x", [], {}, { income: { monthly: "x" }, insurance: null }]) {
      const res = calculate(sanitizeInput(raw, 2026));
      expect(Number.isFinite(res.summary.tax)).toBe(true);
      expect(Number.isFinite(res.summary.net)).toBe(true);
    }
  });
});
