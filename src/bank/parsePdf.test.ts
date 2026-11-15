import { describe, expect, it } from "vitest";
import { groupItems, joinItems, parseStatement, parseStatementLines } from "./parsePdf";
import { classify } from "./classify";

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

describe("PDF výpis vo formáte Slovenskej sporiteľne (anonymizované)", () => {
  const lines = [
    "č. 1/2025 - Strana 1/2",
    "Výpis z účtu: Podnikateľský účet",
    "Názov účtu Ján Testovací Účtovné obdobie 01. 01. 2025 - 31. 12. 2025",
    "Číslo účtu SK00 0900 0000 0000 1111 2222 Počiatočný stav účtu 100,00",
    "Dátum Dátum Popis Suma Suma",
    "valuty zúčtovania transakcie transakcie poplatku",
    "07.01.202507.01.2025 Okamžitá platba trvalým príkazom - 97,80",
    "SK00 8180 0000 0070 0000 0001 BIC: SPSRSKBA",
    "Názov protiúčtu: Dovera",
    "VS: 1111111111 KS: 3558",
    "07.01.202507.01.2025 Okamžitá platba trvalým príkazom - 216,13",
    "SK00 8180 0000 0070 0000 0002 BIC: SPSRSKBA",
    "Názov protiúčtu: Socialna poistovna",
    "VS: 2222222222 SS: 88 KS: 3118",
    "28.01.202528.01.2025 Bezhotovostný vklad 1 850,00",
    "SK00 7500 0000 0000 0000 0003 BIC: CEKOSKBX",
    "Názov protiúčtu: ODBERATEĽ S.R.O.",
    "02.02.202503.02.2025 Bezhotovostný vklad-okamžitá platba 150,00",
    "SK00 1100 0000 0000 0000 0004 BIC: TATRSKBX",
    "Názov protiúčtu: Testovací Ján",
    "31.01.202531.01.2025 Poplatok za vedenie účtu - 7,00",
    "info@banka.sk Klientske centrum: 0800 000 000 www.banka.sk",
    "Nezrealizované transakcie:",
    "07.06.202511.06.2025 Trvalý Platobný príkaz na úhradu",
    "Názov protiúčtu: Socialna poistovna",
    "237,02 EUR",
    "Nedostatočné krytie na účte",
    "č. 1/2025 - Strana 2/2",
    "Vážená Klientka, vážený Klient,",
  ];
  const r = parseStatement(lines);

  it("načíta pohyby so zlepenými dátumami a mínusom s medzerou", () => {
    expect(r.txs.map((t) => [t.date, t.amount])).toEqual([
      ["2025-01-07", -97.8],
      ["2025-01-07", -216.13],
      ["2025-01-28", 1850],
      ["2025-02-03", 150],
      ["2025-01-31", -7],
    ]);
    expect(r.txs[1].counterparty).toBe("Socialna poistovna");
    expect(r.txs[1].vs).toBe("2222222222");
  });
  it("zistí majiteľa účtu a nezrealizované transakcie nezapočíta (len varovanie)", () => {
    expect(r.ownIban).toBe("SK0009000000000011112222");
    expect(r.ownerName).toBe("Ján Testovací");
    expect(r.warnings.some((w) => w.includes("nezrealizované") && w.includes("237,02"))).toBe(true);
  });
  it("platba od majiteľa účtu nie je príjem", () => {
    const c = classify(r.txs, [], { ownIban: r.ownIban, ownerName: r.ownerName });
    expect(c.map((t) => t.category)).toEqual(["zp", "sp", "prijem", "ine", "ine"]);
  });
});

describe("joinItems", () => {
  it("nevkladá medzery do slov rozdelených pdfjs, medzi slovami áno", () => {
    expect(
      joinItems([
        { x: 0, str: "Okam", w: 20, h: 8 },
        { x: 20.2, str: "ž", w: 4, h: 8 },
        { x: 24.1, str: "itá", w: 10, h: 8 },
        { x: 36.5, str: "platba", w: 25, h: 8 },
      ]),
    ).toBe("Okamžitá platba");
  });
});
