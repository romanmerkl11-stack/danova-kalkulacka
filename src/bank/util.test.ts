import { describe, expect, it } from "vitest";
import { extractSymbols, findIban, mergeTxs, norm, parseAmount, parseDate } from "./util";
import type { Tx } from "./types";

describe("parseAmount", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["-1.234,56", -1234.56],
    ["1234.56", 1234.56],
    ["+12,00", 12],
    ["12,00 EUR", 12],
    ["€ 5,5", 5.5],
    ["−5,00", -5],
    ["5,00-", -5],
    ["1 000,00", 1000],
    ["1,234.56", 1234.56],
    ["1.234", 1234],
    ["(10,00)", -10],
    ["0", 0],
  ])("%s", (s, n) => expect(parseAmount(s)).toBe(n));
  it("neplatné", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
  it("číslo prejde", () => expect(parseAmount(12.5)).toBe(12.5));
});

describe("parseDate", () => {
  it.each([
    ["05.03.2025", "2025-03-05"],
    ["5. 3. 2025", "2025-03-05"],
    ["2025-03-05", "2025-03-05"],
    ["2025-03-05T10:00:00", "2025-03-05"],
    ["05/03/2025", "2025-03-05"],
    ["20250305", "2025-03-05"],
  ])("%s", (s, iso) => expect(parseDate(s)).toBe(iso));
  it("neplatné", () => {
    expect(parseDate("31.02.2025")).toBeNull();
    expect(parseDate("hello")).toBeNull();
  });
  it("Date (UTC)", () => expect(parseDate(new Date(Date.UTC(2025, 2, 5)))).toBe("2025-03-05"));
});

describe("ostatné", () => {
  it("norm", () => expect(norm("  Sociálna  Poisťovňa ")).toBe("socialna poistovna"));
  it("IBAN s medzerami", () => expect(findIban("na účet SK12 1100 0000 0026 1234 5678 ďakujem")).toBe("SK1211000000002612345678"));
  it("symboly", () => {
    expect(extractSymbols("/VS123/SS456/KS0558")).toEqual({ vs: "123", ss: "456", ks: "0558" });
    expect(extractSymbols("VS: 987 popis")).toEqual({ vs: "987" });
    expect(extractSymbols("variabilný symbol 55")).toEqual({ vs: "55" });
  });
  it("mergeTxs preskočí existujúce, ponechá vnútorné duplicity", () => {
    const t = (id: string): Tx => ({ id, date: "2025-01-02", amount: 5, counterparty: "A", raw: "" });
    const r = mergeTxs([t("1")], [t("2"), { ...t("3"), amount: 6 }, { ...t("4"), amount: 6 }]);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(1);
  });
});
