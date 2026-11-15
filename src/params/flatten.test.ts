import { describe, expect, it } from "vitest";
import { PARAMS } from "./data";
import { diffYears, flattenYear } from "./flatten";

describe("flattenYear", () => {
  const rows = flattenYear(PARAMS[2026]);
  const by = (k: string) => rows.find((r) => r.key === k);
  it("obsahuje daňové a odvodové hodnoty", () => {
    expect(by("tax.nczd")?.value).toBe(PARAMS[2026].tax!.nczd.value);
    expect(by("sp.minVZ")?.value).toBe(PARAMS[2026].sp.minVZ.value);
    expect(by("sp.minVZ")?.unit).toBe("€");
    expect(by("zp.rate")?.unit).toBe("%");
    expect(by("sp.funds.0")?.label).toMatch(/^Fond: /);
  });
  it("kľúče sú jedinečné", () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("diffYears", () => {
  it("nájde zmenenú hodnotu", () => {
    const b = structuredClone(PARAMS);
    b[2026].tax!.nczd = { ...b[2026].tax!.nczd, value: 9999 };
    const d = diffYears(PARAMS, b);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ year: 2026, key: "tax.nczd", before: PARAMS[2026].tax!.nczd.value, after: 9999 });
  });
  it("nájde nový rok", () => {
    const b = structuredClone(PARAMS);
    b[2099] = { ...structuredClone(PARAMS[2026]), year: 2099 };
    const d = diffYears(PARAMS, b);
    expect(d.length).toBeGreaterThan(5);
    expect(d.every((x) => x.year === 2099 && x.before === undefined && x.after !== undefined)).toBe(true);
  });
  it("rovnaké sadzby = žiadny rozdiel", () => {
    expect(diffYears(PARAMS, PARAMS)).toEqual([]);
  });
});
