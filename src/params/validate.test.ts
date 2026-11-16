import { describe, expect, it } from "vitest";
import { PARAMS } from "./data";
import { validateParamSet } from "./validate";

const clone = () => structuredClone(PARAMS) as unknown as Record<string, any>;
const y = Object.keys(PARAMS).find((k) => PARAMS[Number(k)].tax)!;

describe("F14 – kontrola sadzieb", () => {
  it("zabalené sadzby prejdú", () => {
    expect(validateParamSet(PARAMS, 100)).toEqual([]);
  });
  it("prázdny súbor a zlý rok", () => {
    expect(validateParamSet({})).toHaveLength(1);
    expect(validateParamSet({ abc: {} })[0]).toMatch(/neplatný rok/);
    const p = clone();
    p[y].year = 1999;
    expect(validateParamSet(p).join()).toMatch(/nesedí s kľúčom/);
  });
  it.each([
    ["záporná suma", (p: any) => (p[y].sp.minVZ.value = -1), /neplatná suma/],
    ["suma ako text", (p: any) => (p[y].zp.minPreddavok.value = "100"), /neplatná suma/],
    ["sadzba nad 100 %", (p: any) => (p[y].zp.rate = 16), /sadzba mimo/],
    ["chýba dátum", (p: any) => delete p[y].sp.maxVZ.validFrom, /dátum účinnosti/],
    ["nezoradené pásma", (p: any) => p[y].tax.brackets.reverse(), /(zoradené|posledné|nižšia)/],
    ["chýba SP", (p: any) => delete p[y].sp, /SP – chýba/],
    ["min. VZ nad max. VZ", (p: any) => (p[y].sp.minVZ.value = p[y].sp.maxVZ.value + 1), /vyšší ako maximálny/],
    ["neznámy stav", (p: any) => (p[y].status = "x"), /stav/],
  ])("odmietne: %s", (_n, mutate, re) => {
    const p = clone();
    mutate(p);
    expect(validateParamSet(p, 100).join("\n")).toMatch(re);
  });
  it("hlásenie je skrátené", () => {
    const p = clone();
    for (const k of Object.keys(p)) p[k].sp = null;
    p[y].zp = null;
    p[y].dph = null;
    const e = validateParamSet(p, 2);
    expect(e).toHaveLength(3);
    expect(e[2]).toMatch(/ďalších/);
  });
});
