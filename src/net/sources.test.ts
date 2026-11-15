import { describe, expect, it } from "vitest";
import { parseRpo, parseRpoSearch, validIco } from "./sources";

describe("parseRpo", () => {
  it("vyberie aktuálne meno, adresu a SK NACE", () => {
    const json = {
      results: [
        {
          identifiers: [{ value: "12345678" }],
          fullNames: [
            { value: "Staré meno", validFrom: "2010-01-01", validTo: "2015-01-01" },
            { value: "Ján Novák", validFrom: "2015-01-02" },
          ],
          addresses: [{ street: "Hlavná", buildingNumber: "5", postalCodes: ["81101"], municipality: { value: "Bratislava" }, validFrom: "2015-01-02" }],
          legalForms: [{ value: { value: "Podnikateľ-fyzická osoba-nezapísaný v obchodnom registri" } }],
          statisticalCodes: { mainActivity: { code: "43390", value: "Ostatné stavebné kompletizačné a dokončovacie práce" } },
          establishment: "2010-01-01",
        },
      ],
    };
    const c = parseRpo("12345678", json)!;
    expect(c.name).toBe("Ján Novák");
    expect(c.address).toBe("Hlavná 5, 81101 Bratislava");
    expect(c.nace).toContain("43390");
    expect(c.legalForm).toContain("fyzická osoba");
  });
  it("prázdna odpoveď → null", () => {
    expect(parseRpo("1", { results: [] })).toBeNull();
  });
  it("validIco", () => {
    expect(validIco("12345678")).toBe(true);
    expect(validIco("1234567")).toBe(false);
  });
});

describe("parseRpoSearch", () => {
  const entry = (ico: string, name: string, termination?: string) => ({
    identifiers: [{ value: ico, validFrom: "2010-01-01" }],
    fullNames: [{ value: name, validFrom: "2010-01-01" }],
    termination,
  });
  it("vynechá zaniknuté a duplicity, zhody na začiatku názvu dá prvé (bez ohľadu na diakritiku)", () => {
    const json = {
      results: [
        entry("11111111", "Stavby Novák s.r.o."),
        entry("22222222", "Novák – Stolárstvo"),
        entry("33333333", "Novák Zaniknutý", "2020-01-01"),
        entry("22222222", "Novák – Stolárstvo"),
      ],
    };
    const r = parseRpoSearch("novak", json);
    expect(r.map((c) => c.ico)).toEqual(["22222222", "11111111"]);
  });
  it("prázdna odpoveď → []", () => {
    expect(parseRpoSearch("x", { results: [] })).toEqual([]);
  });
});
