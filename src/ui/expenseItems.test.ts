import { describe, expect, it } from "vitest";
import { expenseTotal } from "./expenseItems";

describe("expenseTotal", () => {
  it("prázdne = 0", () => {
    expect(expenseTotal(undefined)).toBe(0);
    expect(expenseTotal([])).toBe(0);
  });
  it("sčíta mesačná suma × mesiace", () => {
    expect(expenseTotal([{ name: "Nájom", monthly: 300, months: 12 }, { name: "Plyn", monthly: 50.5, months: 6 }])).toBe(3903);
  });
  it("ošetrí neplatné hodnoty a zaokrúhľuje na centy", () => {
    expect(expenseTotal([{ name: "a", monthly: 0.1, months: 3 }])).toBe(0.3);
    expect(expenseTotal([{ name: "a", monthly: 10, months: 99 }])).toBe(120);
    expect(expenseTotal([{ name: "a", monthly: -5, months: 12 }])).toBe(0);
    expect(expenseTotal([{ name: "a", monthly: 10, months: 0 }])).toBe(10);
  });
});
