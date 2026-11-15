// Export výpočtu do XLSX (exceljs sa načíta dynamicky, aby nebol v hlavnom balíku).

import { MONTHS } from "../engine/calc";
import type { CalcInput, CalcResult } from "../engine/types";

export interface ExportMeta {
  title: string;
  companyName: string;
  ico: string;
  createdAt: string;
}

const MONEY = '#,##0.00 "€"';
const GROUPS: Record<string, string> = {
  prijmy: "Príjmy",
  dan: "Daň",
  odvody: "Odvody",
  buduci: "Budúci rok",
  zamestnanie: "Zamestnanie",
  najom: "Prenájom",
  ostatne: "Ostatné príjmy (§ 8)",
};

const skDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};

export async function buildXlsx(result: CalcResult, input: CalcInput, meta: ExportMeta): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daňová kalkulačka SZČO";
  wb.created = new Date();

  const header = (ws: import("exceljs").Worksheet, row = 1) => {
    const r = ws.getRow(row);
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EAF0" } };
    ws.views = [{ state: "frozen", ySplit: row }];
  };

  // --- Súhrn ---
  const s = result.summary;
  const su = wb.addWorksheet("Súhrn");
  su.columns = [{ width: 34 }, { width: 22 }, { width: 50 }];
  su.addRow([meta.title]).font = { bold: true, size: 14 };
  su.addRow(["Firma", meta.companyName]);
  su.addRow(["IČO", meta.ico || "—"]);
  su.addRow(["Rok", result.year]);
  su.addRow(["Dátum", skDate(meta.createdAt)]);
  su.addRow([]);
  const hr = su.addRow(["Položka", "Hodnota"]);
  hr.font = { bold: true };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EAF0" } };
  const money = (label: string, v: number) => {
    const r = su.addRow([label, v]);
    r.getCell(2).numFmt = MONEY;
  };
  money("Príjmy", s.income);
  money("Daň", s.tax);
  money(s.taxToPay < 0 ? "Preplatok" : "Daň na úhradu", Math.abs(s.taxToPay));
  money("Sociálne poistenie", s.sp);
  money("Zdravotné poistenie", s.zp);
  money("Čistý príjem ročne", s.net);
  money("Čistý príjem mesačne", s.netMonthly);
  const eff = su.addRow(["Efektívne zaťaženie", s.effectiveRate]);
  eff.getCell(2).numFmt = "0.00%";
  su.getColumn(2).alignment = { horizontal: "right" };
  if (result.warnings.length) {
    su.addRow([]);
    su.addRow(["Upozornenia"]).font = { bold: true };
    for (const w of result.warnings) {
      const r = su.addRow([w.text]);
      su.mergeCells(r.number, 1, r.number, 3);
      r.alignment = { wrapText: true, vertical: "top" };
      r.height = Math.max(18, Math.ceil(w.text.length / 100) * 16);
    }
  }
  su.addRow([]);
  su.addRow(["Orientačný výpočet – nenahrádza daňového poradcu."]).font = { italic: true };

  // --- Mesiace ---
  const me = wb.addWorksheet("Mesiace");
  me.columns = [{ width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 34 }];
  me.addRow(["Mesiac", "Za obdobie", "Príjem", "SP", "ZP", "Poznámka"]);
  header(me);
  for (const m of result.months) {
    const notes: string[] = [];
    if (m.incomeProjected) notes.push("príjem dopočítaný");
    if (!m.spAuto) notes.push("SP zadané ručne");
    if (!m.zpAuto) notes.push("ZP zadané ručne");
    const r = me.addRow([MONTHS[m.month - 1], m.covers, m.income, m.sp, m.zp, notes.join(", ")]);
    for (let c = 3; c <= 5; c++) r.getCell(c).numFmt = MONEY;
  }
  const first = 2;
  const last = 1 + result.months.length;
  const tot = me.addRow(["Spolu", "", null, null, null, ""]);
  const col = ["C", "D", "E"];
  const vals = [
    result.months.reduce((a, m) => a + m.income, 0),
    result.months.reduce((a, m) => a + m.sp, 0),
    result.months.reduce((a, m) => a + m.zp, 0),
  ];
  col.forEach((c, i) => {
    const cell = tot.getCell(c);
    cell.value = { formula: `SUM(${c}${first}:${c}${last})`, result: Math.round(vals[i] * 100) / 100 };
    cell.numFmt = MONEY;
  });
  tot.font = { bold: true };

  // --- Postup ---
  const po = wb.addWorksheet("Postup");
  po.columns = [{ width: 14 }, { width: 38 }, { width: 18 }, { width: 50 }, { width: 60 }, { width: 22 }, { width: 14 }, { width: 14 }];
  po.addRow(["Skupina", "Krok", "Hodnota", "Vzorec", "Vysvetlenie", "Paragraf", "Riadok DP", "Ručne prepísané"]);
  header(po);
  for (const st of result.steps) {
    const isFlag = st.id === "sadzba15";
    const r = po.addRow([
      GROUPS[st.group] ?? st.group,
      st.label,
      isFlag ? (st.value ? "áno" : "nie") : st.value,
      st.formula,
      st.explain ?? "",
      st.law ?? "",
      st.dpRow ?? "",
      st.overridden || input.overrides[st.id] !== undefined ? "áno" : "nie",
    ]);
    if (!isFlag) r.getCell(3).numFmt = MONEY;
    r.getCell(3).alignment = { horizontal: "right" };
    r.getCell(4).alignment = { wrapText: true, vertical: "top" };
    r.getCell(5).alignment = { wrapText: true, vertical: "top" };
  }

  // --- Limity ---
  const li = wb.addWorksheet("Limity");
  li.columns = [{ width: 34 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 60 }];
  li.addRow(["Limit", "Sleduje sa", "Aktuálne", "Limit", "Rezerva", "Prekročené", "Dôsledok"]);
  header(li);
  result.limits.forEach((l, i) => {
    const rn = i + 2;
    const r = li.addRow([l.label, l.measure, l.current, l.limit, null, l.exceeded ? "áno" : "nie", l.consequence]);
    r.getCell(5).value = { formula: `D${rn}-C${rn}`, result: Math.round((l.limit - l.current) * 100) / 100 };
    for (const c of [3, 4, 5]) r.getCell(c).numFmt = MONEY;
    r.getCell(7).alignment = { wrapText: true, vertical: "top" };
  });

  // --- Budúci rok ---
  const n = result.next;
  const nx = wb.addWorksheet("Budúci rok");
  nx.columns = [{ width: 44 }, { width: 22 }, { width: 50 }];
  nx.addRow([`Budúci rok ${n.year}`, "Hodnota", "Poznámka"]);
  header(nx);
  const regime = { standard: "podľa vymeriavacieho základu / minimum", mikro: "mikroodvod", none: "nie ste povinne poistený", unknown: "neznámy" }[n.spRegime];
  const add = (label: string, v: number, note = "") => {
    const r = nx.addRow([label, v, note]);
    r.getCell(2).numFmt = MONEY;
  };
  add("Sociálne poistenie od júla (mesačne)", n.spFromJuly, `režim: ${regime}`);
  add("Vymeriavací základ SP", n.spVZ);
  add("Zdravotné poistenie (mesačne)", n.zpMonthly);
  add("Vymeriavací základ ZP", n.zpVZ);
  add("Ročné zúčtovanie ZP", Math.abs(n.zpSettlement), n.zpSettlement > 0 ? "nedoplatok" : n.zpSettlement < 0 ? "preplatok" : "bez nedoplatku a preplatku");
  const adv = n.taxAdvance;
  add("Preddavky na daň", adv.amount, adv.period === "none" ? "neplatíte" : adv.period === "quarterly" ? "štvrťročne" : "mesačne");
  nx.addRow(["Stav sadzieb", n.paramsStatus]);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
