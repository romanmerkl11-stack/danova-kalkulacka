import { describe, expect, it } from "vitest";
import { formatSkNumber, parseSkNumber } from "./format";

describe("parseSkNumber", () => {
  it("číta slovenský zápis", () => {
    expect(parseSkNumber("1 234,56")).toBe(1234.56);
    expect(parseSkNumber("1 234,5 €")).toBe(1234.5);
  });
  it("číta bodku ako desatinný oddeľovač", () => {
    expect(parseSkNumber("1234.5")).toBe(1234.5);
  });
  it("prázdne a neplatné → null", () => {
    expect(parseSkNumber("")).toBeNull();
    expect(parseSkNumber("  ")).toBeNull();
    expect(parseSkNumber("abc")).toBeNull();
    expect(parseSkNumber("1,2,3")).toBeNull();
  });
  it("bodka ako oddeľovač tisícov", () => {
    expect(parseSkNumber("1.234,56")).toBe(1234.56);
    expect(parseSkNumber("12.345")).toBe(12345);
    expect(parseSkNumber("1.234.567")).toBe(1234567);
    expect(parseSkNumber("1.2,5")).toBeNull();
    expect(parseSkNumber("12a")).toBeNull();
    expect(parseSkNumber("1,5")).toBe(1.5);
    expect(parseSkNumber("0.5")).toBe(0.5);
    expect(parseSkNumber("1\u00a0234,5")).toBe(1234.5);
  });
  it("záporné čísla", () => {
    expect(parseSkNumber("\u22125")).toBe(-5);
    expect(parseSkNumber("-12,3")).toBe(-12.3);
  });
});

describe("formatSkNumber", () => {
  it("formátuje a späť sa dá prečítať", () => {
    expect(parseSkNumber(formatSkNumber(1234.56))).toBe(1234.56);
    expect(parseSkNumber(formatSkNumber(0))).toBe(0);
  });
});
