import { describe, expect, it } from "vitest";
import { groupItems, parseStatement, parseStatementLines } from "./parsePdf";

const SAMPLE = [
  "Banka XY, a.s.",
  "Výpis z účtu č. 3/2025",
  "Obdobie: 01.03.2025 - 31.03.2025",
  "IBAN: SK31 1200 0000 1987 4263 7541",
  "Počiatočný zostatok 1 000,00 EUR",
  "Dátum Popis transakcie Suma Zostatok",
  "03.03.2025 Prijatá platba 1 500,00 2 500,00",
  "Klient a.s.",
  "SK68 0720 0002 8919 8742 6353",
  "VS: 2025001 KS: 0308",
  "05.03.2025 Odchádzajúca platba -45,80 2 454,20",
  "Sociálna poisťovňa",
  "SK02 8180 0000 0070 0015 7429",
  "VS 1234567",
  "Strana 1 z 2",
  "10.03.2025 Platba kartou 12,30 2 441,90",
  "TESCO Bratislava",
  "poznámka",
  "15.03.2025 Niečo nezrozumiteľné",
  "Konečný zostatok 2 441,90 EUR",
  "Spolu príjmy 1 500,00 EUR",
];

describe("parseStatementLines", () => {
  const r = parseStatement(SAMPLE);
  it("rozpozná transakcie a preskočí hlavičky/súhrny", () => {
    expect(r.txs).toHaveLength(3);
    expect(r.txs[0]).toMatchObject({ date: "2025-03-03", amount: 1500, counterparty: "Klient a.s.", iban: "SK6807200002891987426353", vs: "2025001", ks: "0308" });
    expect(r.txs[1]).toMatchObject({ date: "2025-03-05", amount: -45.8, counterparty: "Sociálna poisťovňa", vs: "1234567" });
  });
  it("znamienko z kľúčového slova", () => {
    expect(r.txs[2]).toMatchObject({ amount: -12.3, counterparty: "TESCO Bratislava" });
  });
  it("varovanie pre nespracovateľný riadok", () => {
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain("Niečo nezrozumiteľné");
  });
  it("rozsah rokov", () => expect(r.yearRange).toEqual({ from: 2025, to: 2025 }));
  it("alias", () => expect(parseStatementLines(SAMPLE)).toHaveLength(3));

  it("suma na ďalšom riadku a skrátený dátum", () => {
    const x = parseStatement(["Výpis za 01.01.2025 - 31.01.2025", "07.01. Platba prijatá kredit", "Firma", "+99,90 EUR"]);
    expect(x.txs).toHaveLength(1);
    expect(x.txs[0]).toMatchObject({ date: "2025-01-07", amount: 99.9 });
  });
});

describe("groupItems", () => {
  it("zoskupí podľa y a zoradí podľa x", () => {
    const l = groupItems([{ x: 200, y: 700, str: "B" }, { x: 10, y: 701, str: "A" }, { x: 10, y: 650, str: "C" }], 1);
    expect(l.map((x) => x.text)).toEqual(["A B", "C"]);
  });
});
