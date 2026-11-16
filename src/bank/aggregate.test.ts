import { describe, expect, it } from "vitest";
import { aggregate, applyToInput } from "./aggregate";
import type { ClassifiedTx } from "./types";
import type { CalcInput } from "../engine/types";

const c = (date: string, amount: number, category: ClassifiedTx["category"], currency?: string): ClassifiedTx => ({ id: date + amount, date, amount, category, reason: "", raw: "", currency });

const txs = [
  c("2025-01-10", 1000.1, "prijem"),
  c("2025-01-20", 200.2, "prijem"),
  c("2025-03-05", 500, "prijem"),
  c("2025-02-15", -50.5, "sp"),
  c("2025-03-15", -50.5, "sp"),
  c("2025-03-20", -30, "zp"),
  c("2025-03-21", -9, "ine"),
  c("2024-12-15", -77, "sp"),
];

describe("aggregate", () => {
  const a = aggregate(txs, 2025);
  it("príjmy po mesiacoch, 0 pre prázdne ak je nejaký príjem", () => {
    expect(a.income[0]).toBe(1200.3);
    expect(a.income[1]).toBe(0);
    expect(a.income[2]).toBe(500);
  });
  it("SP/ZP: null pre mesiace bez platby, kladné sumy", () => {
    expect(a.sp[0]).toBeNull();
    expect(a.sp[1]).toBe(50.5);
    expect(a.zp[2]).toBe(30);
    expect(a.zp[1]).toBeNull();
  });
  it("mimo roka a súčty", () => {
    expect(a.outsideYear).toBe(1);
    expect(a.totals).toEqual({ income: 1700.3, sp: 101, zp: 30 });
  });
  it("bez príjmov → null", () => {
    expect(aggregate([c("2025-02-15", -50, "sp")], 2025).income.every((x) => x === null)).toBe(true);
  });
});

describe("applyToInput", () => {
  const input = {
    income: { mode: "annual", annual: 5, monthly: new Array(12).fill(null), extrapolate: false },
    insurance: { shiftOneMonth: false, spRegimeH2: "standard", spJanJun: null, spJulDec: null, zpMonthlyAmount: null, spPaid: new Array(12).fill(1), zpPaid: new Array(12).fill(2) },
  } as unknown as CalcInput;
  const a = aggregate(txs, 2025);
  it("prepíše vybrané časti", () => {
    const r = applyToInput(input, a, { income: true, sp: false, zp: true });
    expect(r.income.mode).toBe("monthly");
    expect(r.income.monthly).toEqual(a.income);
    expect(r.insurance.spPaid).toEqual(input.insurance.spPaid);
    // január – marec z výpisu, apríl – december zostanú pôvodné
    expect(r.insurance.zpPaid).toEqual([null, null, 30, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(input.income.mode).toBe("annual");
  });
  it("nič nevybrané = bez zmeny", () => {
    const r = applyToInput(input, a, { income: false, sp: false, zp: false });
    expect(r.income).toEqual(input.income);
  });
});

describe("F06 – mena a vratky", () => {
  it("vrátená platba odberateľovi zníži príjem, preplatok od poisťovne zníži poistné", () => {
    const a = aggregate(
      [c("2025-01-05", 1000, "prijem"), c("2025-01-20", -200, "prijem"), c("2025-01-10", -300, "sp"), c("2025-01-25", 50, "sp")],
      2025,
    );
    expect(a.income[0]).toBe(800);
    expect(a.sp[0]).toBe(250);
    expect(a.negative).toEqual([]);
  });
  it("cudzia mena sa nezapočíta a ohlási sa", () => {
    const a = aggregate([c("2025-01-05", 1000, "prijem", "EUR"), c("2025-01-06", 500, "prijem", "usd"), c("2025-01-07", -10, "zp", "CZK")], 2025);
    expect(a.income[0]).toBe(1000);
    expect(a.zp[0]).toBeNull();
    expect(a.foreign).toEqual({ count: 2, currencies: ["CZK", "USD"] });
  });
  it("vratky nad platby → 0 a varovanie", () => {
    const a = aggregate([c("2025-02-01", 100, "prijem"), c("2025-03-01", -40, "prijem"), c("2025-03-02", 30, "zp")], 2025);
    expect(a.income[2]).toBe(0);
    expect(a.zp[2]).toBe(0);
    expect(a.negative).toEqual([
      { kind: "income", month: 3, amount: -40 },
      { kind: "zp", month: 3, amount: -30 },
    ]);
  });
});

describe("F07 – čiastočné obdobie", () => {
  const a = aggregate([c("2025-03-02", 100, "prijem"), c("2025-05-30", -9, "ine")], 2025);
  it("pokrytie od prvého po posledný pohyb v roku (aj nezapočítaný)", () => {
    expect(a.covered.map((x, i) => (x ? i + 1 : 0)).filter(Boolean)).toEqual([3, 4, 5]);
    expect(a.income).toEqual([null, null, 100, 0, 0, null, null, null, null, null, null, null]);
  });
  it("mesiace mimo výpisu sa pri použití nezmenia", () => {
    const input = {
      income: { mode: "monthly", annual: 0, monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], extrapolate: false },
      insurance: { spPaid: new Array(12).fill(7), zpPaid: new Array(12).fill(8) },
    } as unknown as CalcInput;
    const r = applyToInput(input, a, { income: true, sp: true, zp: false });
    expect(r.income.monthly).toEqual([1, 2, 100, 0, 0, 6, 7, 8, 9, 10, 11, 12]);
    // v pokrytých mesiacoch bez platby SP = automaticky (null), ostatné zostanú
    expect(r.insurance.spPaid).toEqual([7, 7, null, null, null, 7, 7, 7, 7, 7, 7, 7]);
  });
});
