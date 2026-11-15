import { describe, expect, it } from "vitest";
import { PARAMS } from "../params/data";
import { periods, spBreakdown } from "./contrib";
import type { MonthRow } from "../engine/types";

describe("spBreakdown", () => {
  it("303,11 € → presný vymeriavací základ a súčet fondov sedí", () => {
    const b = spBreakdown(303.11, PARAMS[2026].sp);
    expect(b.exact).toBe(true);
    expect(b.vz).toBe(914.4);
    expect(b.parts.map((p) => p.name)).toEqual(["nemocenské", "starobné", "invalidné", "rezervný fond"]);
    expect(Math.round(b.parts.reduce((a, p) => a + p.amount, 0) * 100) / 100).toBe(303.11);
  });
  it("suma, ktorá nesedí na žiadny základ → pomerný rozpis", () => {
    const b = spBreakdown(300.01, PARAMS[2026].sp);
    expect(b.exact).toBe(false);
  });
});

describe("periods", () => {
  const row = (month: number, sp: number): MonthRow => ({ month, income: 0, incomeProjected: false, sp, zp: 100, spAuto: true, zpAuto: true, covers: `${month}/2026` });
  it("zlúči rovnaké po sebe idúce mesiace", () => {
    const p = periods([row(1, 300), row(2, 300), row(3, 310)], "sp");
    expect(p).toEqual([
      { from: "1/2026", to: "2/2026", amount: 300, auto: true },
      { from: "3/2026", to: "3/2026", amount: 310, auto: true },
    ]);
  });
});
