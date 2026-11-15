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
  it("záporné čísla", () => {
    expect(parseSkNumber("-12,3")).toBe(-12.3);
  });
});

describe("formatSkNumber", () => {
  it("formátuje a späť sa dá prečítať", () => {
    expect(parseSkNumber(formatSkNumber(1234.56))).toBe(1234.56);
    expect(parseSkNumber(formatSkNumber(0))).toBe(0);
  });
});
