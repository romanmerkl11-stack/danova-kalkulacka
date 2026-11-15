import { describe, expect, it } from "vitest";
import { defaultInput } from "../engine/calc";
import { calcToJson, parseCalcJson } from "./json";

const sample = () => {
  const input = defaultInput(2025);
  input.income.annual = 30000;
  input.overrides = { nczd: 1000 };
  return {
    ico: "12345678",
    companyName: "Firma",
    title: "Môj výpočet",
    year: 2025,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-02-01T00:00:00.000Z",
    input,
    summary: { income: 30000, tax: 1, taxToPay: 2, sp: 3, zp: 4, net: 5 },
  };
};

describe("JSON výpočtu", () => {
  it("roundtrip zachová údaje a nepridá id", () => {
    const s = sample();
    const text = calcToJson({ id: "abc", ...s });
    expect(JSON.parse(text).format).toBe("danova-kalkulacka/vypocet");
    expect(JSON.parse(text).calc.id).toBeUndefined();
    expect(parseCalcJson(text)).toEqual(s);
  });
  it("doplní chýbajúce polia predvolenými", () => {
    const s = sample();
    const text = JSON.stringify({ format: "danova-kalkulacka/vypocet", version: 1, calc: { ...s, input: { year: 2025, income: { annual: 500 } } } });
    const p = parseCalcJson(text);
    expect(p.input.income.annual).toBe(500);
    expect(p.input.income.monthly).toHaveLength(12);
    expect(p.input.insurance.shiftOneMonth).toBe(true);
    expect(p.input.employment.gross).toBe(0);
  });
  it("odmietne neplatné vstupy slovenskou chybou", () => {
    expect(() => parseCalcJson("nie json")).toThrow("Súbor nie je platný JSON.");
    expect(() => parseCalcJson("{}")).toThrow(/nie je export/);
    expect(() => parseCalcJson(JSON.stringify({ format: "danova-kalkulacka/vypocet", version: 99, calc: {} }))).toThrow(/verzia/);
    expect(() => parseCalcJson(JSON.stringify({ format: "danova-kalkulacka/vypocet", version: 1, calc: { input: { year: "x", income: {} } } }))).toThrow(/rok/);
    expect(() => parseCalcJson(JSON.stringify({ format: "danova-kalkulacka/vypocet", version: 1, calc: {} }))).toThrow(/údaje/);
  });
});
