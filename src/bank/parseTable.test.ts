import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { applyMapping, parseCsv, parseCsvBytes, parseXlsxBytes } from "./parseTable";

const enc = (s: string) => new TextEncoder().encode(s);

const SLSP = [
  "Dátum zaúčtovania;Suma;Mena;Názov protistrany;IBAN protistrany;Variabilný symbol;Popis",
  '05.03.2025;"1 234,56";EUR;Firma s.r.o.;SK12 1100 0000 0026 1234 5678;2025001;Faktúra 2025001',
  "10.03.2025;-52,30;EUR;Sociálna poisťovňa;SK0281800000007000157429;1234567;Sociálne poistenie",
  '12.03.2025;-3,50;EUR;;;;"Poplatok ""za vedenie"""',
  "",
].join("\n");

describe("parseTable CSV", () => {
  it("SLSP štýl so ;", () => {
    const r = parseCsvBytes(enc(SLSP));
    expect(r.confident).toBe(true);
    expect(r.txs).toHaveLength(3);
    expect(r.txs[0]).toMatchObject({ date: "2025-03-05", amount: 1234.56, currency: "EUR", counterparty: "Firma s.r.o.", iban: "SK1211000000002612345678", vs: "2025001" });
    expect(r.txs[1].amount).toBe(-52.3);
    expect(r.txs[2].description).toBe('Poplatok "za vedenie"');
  });

  it("Tatra štýl: Kredit/Debet, BOM, tab, úvodné riadky", () => {
    const csv =
      "﻿Banka export\n\nDátum\tKredit\tDebet\tProtiúčet\tPopis\n" +
      "01.04.2025\t500,00\t\tODOSIELATEĽ s.r.o.\t/VS777/SS1/KS0308\n" +
      "02.04.2025\t\t20,00\tVšeobecná zdravotná poisťovňa\tpoistné\n";
    const r = parseCsvBytes(enc(csv));
    expect(r.confident).toBe(true);
    expect(r.txs.map((t) => t.amount)).toEqual([500, -20]);
    expect(r.txs[0]).toMatchObject({ vs: "777", ss: "1", ks: "0308" });
  });

  it("stĺpec smeru D/C", () => {
    const r = parseCsvBytes(enc("Date,Amount,D/C,Partner\n2025-05-01,10.50,C,A\n2025-05-02,4.00,D,B\n"));
    expect(r.txs.map((t) => t.amount)).toEqual([10.5, -4]);
  });

  it("windows-1250 fallback", () => {
    const bytes = new Uint8Array([...enc("D"), 0xe1, ...enc("tum;Suma;N"), 0xe1, ...enc("zov protistrany\n01.01.2025;5,00;Jo"), 0x9e, ...enc("o\n")]);
    const r = parseCsvBytes(bytes);
    expect(r.confident).toBe(true);
    expect(r.txs[0].counterparty).toBe("Jožo");
  });

  it("nejasná hlavička → nie confident, ručné mapovanie", () => {
    const r = parseCsvBytes(enc("A;B;C\n01.01.2025;5,00;x\n"));
    expect(r.confident).toBe(false);
    expect(r.rows).toHaveLength(1);
    const txs = applyMapping(r.rows, { date: 0, amount: 1, counterparty: 2 });
    expect(txs[0]).toMatchObject({ date: "2025-01-01", amount: 5, counterparty: "x" });
  });

  it("parseCsv: úvodzovky a konce riadkov", () => {
    expect(parseCsv('a;"b;c";d\r\ne;f;g', ";")).toEqual([["a", "b;c", "d"], ["e", "f", "g"]]);
  });
});

describe("parseTable XLSX", () => {
  it("číta prvý hárok s dátami, dátumy a vzorce", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Prázdny");
    const ws = wb.addWorksheet("Pohyby");
    ws.addRow(["Booking date", "Amount", "Counterparty", "IBAN", "Details"]);
    ws.addRow([new Date(Date.UTC(2025, 5, 3)), 100.25, "Klient", "SK89 0900 0000 0000 1234 5678", "VS 4455"]);
    ws.addRow(["04.06.2025", { formula: "-5-5", result: -10 }, "Obchod", "", ""]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const r = await parseXlsxBytes(buf);
    expect(r.confident).toBe(true);
    expect(r.txs).toHaveLength(2);
    expect(r.txs[0]).toMatchObject({ date: "2025-06-03", amount: 100.25, vs: "4455", iban: "SK8909000000000012345678" });
    expect(r.txs[1]).toMatchObject({ date: "2025-06-04", amount: -10 });
  });
});
