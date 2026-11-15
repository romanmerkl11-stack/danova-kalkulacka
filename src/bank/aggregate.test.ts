import { describe, expect, it } from "vitest";
import { aggregate, applyToInput } from "./aggregate";
import type { ClassifiedTx } from "./types";
import type { CalcInput } from "../engine/types";

const c = (date: string, amount: number, category: ClassifiedTx["category"]): ClassifiedTx => ({ id: date + amount, date, amount, category, reason: "", raw: "" });

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
    expect(r.insurance.zpPaid).toEqual(a.zp);
    expect(input.income.mode).toBe("annual");
  });
  it("nič nevybrané = bez zmeny", () => {
    const r = applyToInput(input, a, { income: false, sp: false, zp: false });
    expect(r.income).toEqual(input.income);
  });
});
