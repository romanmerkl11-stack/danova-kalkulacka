import { describe, expect, it } from "vitest";
import { parseRpo, validIco } from "./sources";

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
