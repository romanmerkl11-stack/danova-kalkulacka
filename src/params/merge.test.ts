import { describe, expect, it } from "vitest";
import { PARAMS, PARAMS_DATE } from "./data";
import { acceptedIsStale, effectiveParams, paramsChanged, paramsDateFor, paramsForSaved } from "./merge";

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

describe("F12 – sadzby uložené s výpočtom", () => {
  const y = PARAMS[2026];
  it("dátum sadzieb: prijaté aktualizácie len ak sú pre daný rok a nie sú staré", () => {
    expect(paramsDateFor(2026, {}, undefined)).toBe(PARAMS_DATE);
    expect(paramsDateFor(2026, { 2026: y }, "2099-01-01")).toBe("2099-01-01");
    expect(paramsDateFor(2025, { 2026: y }, "2099-01-01")).toBe(PARAMS_DATE);
    expect(paramsDateFor(2026, { 2026: y }, "2000-01-01")).toBe(PARAMS_DATE);
  });
  it("zmena sadzieb a prepočet s uloženými (rok aj nasledujúci)", () => {
    const changed = structuredClone(y);
    changed.status = changed.status === "platné" ? "predbežné" : "platné";
    const next = structuredClone(PARAMS[2027]);
    expect(paramsChanged({ year: 2026 }, PARAMS)).toBe(false);
    expect(paramsChanged({ year: 2026, params: structuredClone(y), paramsNext: next }, PARAMS)).toBe(false);
    expect(paramsChanged({ year: 2026, params: changed }, PARAMS)).toBe(true);
    expect(paramsChanged({ year: 2026, params: y, paramsNext: { ...next, status: next.status === "platné" ? "predbežné" : "platné" } }, PARAMS)).toBe(true);
    const p = paramsForSaved(PARAMS, { year: 2026, params: changed, paramsNext: next });
    expect(p[2026]).toBe(changed);
    expect(p[2027]).toBe(next);
    expect(paramsForSaved(PARAMS, { year: 2026 })).toBe(PARAMS);
  });
});
