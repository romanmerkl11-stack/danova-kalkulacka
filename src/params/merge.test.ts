import { describe, expect, it } from "vitest";
import { PARAMS, PARAMS_DATE } from "./data";
import { acceptedIsStale, effectiveParams } from "./merge";

describe("prijaté sadzby vs. zabalené", () => {
  const old = { 2024: { ...PARAMS[2024], year: 2024 } };
  it("staršie prijaté (alebo bez dátumu) sa ignorujú", () => {
    expect(acceptedIsStale(old, undefined)).toBe(true);
    expect(acceptedIsStale(old, "2026-01-01")).toBe(true);
    expect(effectiveParams(old, "2026-01-01")).toBe(PARAMS);
  });
  it("novšie alebo rovnako staré prijaté sa použijú", () => {
    expect(acceptedIsStale(old, PARAMS_DATE)).toBe(false);
    expect(effectiveParams(old, PARAMS_DATE)[2024]).toBe(old[2024]);
  });
});
