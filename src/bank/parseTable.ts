// Import tabuľkových výpisov (CSV / XLSX) s automatickým rozpoznaním stĺpcov.
import type { Tx } from "./types";
import { cleanIban, extractSymbols, findIban, newId, norm, parseAmount, parseDate } from "./util";

export type Cell = string | number | Date | null;

export type ColumnField =
  | "date" | "amount" | "credit" | "debit" | "direction"
  | "counterparty" | "iban" | "vs" | "ks" | "ss" | "description" | "currency";

/** index stĺpca (0-based) alebo chýba */
export type ColumnMapping = Partial<Record<ColumnField, number>>;

export interface TableParseResult {
  txs: Tx[];
  mapping: ColumnMapping;
  headers: string[];
  /** dátové riadky (po hlavičke) – pre ručné premapovanie cez applyMapping */
  rows: Cell[][];
  /** false = chýba dátum alebo suma → treba ručné mapovanie */
  confident: boolean;
}

/** kľúčové slová hlavičiek (normalizované, v poradí priority) */
const KEYWORDS: Record<ColumnField, string[]> = {
  date: ["datum zauctovania", "datum uctovania", "datum transakcie", "datum pohybu", "datum spracovania", "booking date", "posting date", "value date", "datum valuty", "datum", "date", "datum splatnosti"],
  amount: ["suma v mene uctu", "suma transakcie", "suma", "ciastka", "objem", "amount", "obrat"],
  credit: ["prijem", "kredit", "credit", "pripisanie", "pripis", "ma dati", "prijmy"],
  debit: ["vydaj", "debet", "debit", "odpisanie", "odpis", "dal", "vydavky"],
  direction: ["smer platby", "smer", "d c", "dc", "kredit debet", "debet kredit", "typ pohybu", "typ"],
  counterparty: ["nazov uctu protistrany", "nazov protistrany", "nazov partnera", "meno protistrany", "protistrana", "prijemca", "platitel", "partner", "nazov uctu", "counterparty", "beneficiary", "meno a priezvisko"],
  iban: ["iban protistrany", "cislo uctu protistrany", "ucet protistrany", "iban partnera", "protiucet", "iban prijemcu", "iban platitela", "cislo protiuctu", "counterparty iban", "iban"],
  vs: ["variabilny symbol", "var symbol", "vs"],
  ks: ["konstantny symbol", "konstantny", "ks"],
  ss: ["specificky symbol", "specificky", "ss"],
  description: ["sprava pre prijemcu", "informacia pre prijemcu", "popis transakcie", "popis", "poznamka", "detail", "details", "referencia platitela", "sprava", "informacia", "note", "description", "reference"],
  currency: ["mena", "currency", "mena uctu"],
};

const FIELDS = Object.keys(KEYWORDS) as ColumnField[];

/** hlavička → pole pre porovnanie po slovách */
const words = (s: string) => ` ${norm(s).replace(/[^a-z0-9]+/g, " ").trim()} `;

function fieldFor(header: string): { field: ColumnField; prio: number } | null {
  const h = words(header);
  if (h.trim() === "") return null;
  let best: { field: ColumnField; prio: number; len: number } | null = null;
  for (const f of FIELDS) {
    KEYWORDS[f].forEach((kw, i) => {
      if (h.includes(` ${kw} `) && (!best || kw.length > best.len)) best = { field: f, prio: i, len: kw.length };
    });
  }
  return best ? { field: (best as { field: ColumnField }).field, prio: (best as { prio: number }).prio } : null;
}

/** rozpozná mapovanie stĺpcov z hlavičky */
export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const prios: Partial<Record<ColumnField, number>> = {};
  headers.forEach((h, idx) => {
    const r = fieldFor(h);
    if (!r) return;
    if (prios[r.field] === undefined || r.prio < prios[r.field]!) {
      mapping[r.field] = idx;
      prios[r.field] = r.prio;
    }
  });
  return mapping;
}

export const isConfident = (m: ColumnMapping) =>
  m.date !== undefined && (m.amount !== undefined || m.credit !== undefined || m.debit !== undefined);

const cellStr = (c: Cell | undefined): string => {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
};

const DEBIT_WORD = /^(d|db|dbit|debet|debit|dbt|vydaj|odchadzajuca|odpisanie|odchadzajuci)\b|debet|odchadz|vydaj|odpis/;
const CREDIT_WORD = /^(c|cr|crdt|kredit|credit|prijem|prichadzajuca|pripisanie)\b|kredit|prichadz|pripis/;

function dirSign(v: string): 1 | -1 | 0 {
  const n = norm(v);
  if (!n) return 0;
  if (DEBIT_WORD.test(n)) return -1;
  if (CREDIT_WORD.test(n)) return 1;
  return 0;
}

/** Prevedie dátové riadky na transakcie podľa mapovania. */
export function applyMapping(rows: Cell[][], mapping: ColumnMapping): Tx[] {
  const get = (r: Cell[], f: ColumnField) => (mapping[f] === undefined ? undefined : r[mapping[f]!]);
  const useDirection =
    mapping.direction !== undefined &&
    mapping.amount !== undefined &&
    !rows.some((r) => (parseAmount(get(r, "amount") as string | number) ?? 0) < 0) &&
    rows.some((r) => dirSign(cellStr(get(r, "direction"))) !== 0);
  const txs: Tx[] = [];
  for (const r of rows) {
    const dateCell = get(r, "date");
    const date = dateCell instanceof Date ? parseDate(dateCell) : parseDate(cellStr(dateCell));
    if (!date) continue;
    let amount: number | null = null;
    let currency = cellStr(get(r, "currency")).toUpperCase() || undefined;
    if (mapping.amount !== undefined) {
      const a = get(r, "amount");
      amount = parseAmount(a as string | number | null);
      if (amount !== null && useDirection) {
        const s = dirSign(cellStr(get(r, "direction")));
        if (s !== 0) amount = s * Math.abs(amount);
      }
      if (!currency && typeof a === "string") currency = /eur|€/i.test(a) ? "EUR" : undefined;
    }
    if (mapping.credit !== undefined || mapping.debit !== undefined) {
      const cr = parseAmount(get(r, "credit") as string | number | null) ?? 0;
      const db = parseAmount(get(r, "debit") as string | number | null) ?? 0;
      if (cr !== 0 || db !== 0) amount = Math.abs(cr) - Math.abs(db);
      else if (amount === null) amount = null;
    }
    if (amount === null || amount === 0) continue;
    const description = cellStr(get(r, "description")) || undefined;
    const counterparty = cellStr(get(r, "counterparty")) || undefined;
    let iban = cellStr(get(r, "iban"));
    iban = iban ? cleanIban(iban) : "";
    if (!iban) iban = findIban(`${description ?? ""} ${counterparty ?? ""}`) ?? "";
    const sym = extractSymbols(`${description ?? ""} ${counterparty ?? ""}`);
    const digits = (f: ColumnField) => cellStr(get(r, f)).replace(/\D/g, "") || undefined;
    txs.push({
      id: newId(),
      date,
      amount: Math.round(amount * 100) / 100,
      currency,
      counterparty,
      iban: iban || undefined,
      vs: digits("vs") ?? sym.vs,
      ks: digits("ks") ?? sym.ks,
      ss: digits("ss") ?? sym.ss,
      description,
      raw: r.map(cellStr).filter(Boolean).join(" | "),
    });
  }
  return txs;
}

/** Nájde hlavičku (prvých 30 riadkov, aspoň 2 známe hlavičky) a vyrobí výsledok. */
export function parseRows(all: Cell[][]): TableParseResult {
  let hi = -1;
  for (let i = 0; i < Math.min(30, all.length) && hi === -1; i++) {
    const fields = new Set(all[i].map((c) => fieldFor(cellStr(c))?.field).filter(Boolean));
    if (fields.size >= 2) hi = i;
  }
  if (hi === -1) {
    // bez rozpoznanej hlavičky: prvý neprázdny riadok ako hlavička, mapovanie ručne
    const first = all.findIndex((r) => r.some((c) => cellStr(c) !== ""));
    if (first === -1) return { txs: [], mapping: {}, headers: [], rows: [], confident: false };
    const headers = all[first].map(cellStr);
    return { txs: [], mapping: {}, headers, rows: all.slice(first + 1), confident: false };
  }
  const headers = all[hi].map(cellStr);
  const mapping = detectMapping(headers);
  const rows = all.slice(hi + 1);
  const confident = isConfident(mapping);
  return { txs: confident ? applyMapping(rows, mapping) : [], mapping, headers, rows, confident };
}

// ---------- CSV ----------

/** bajty → text; UTF-8, pri znakoch � windows-1250 */
export function decodeText(bytes: Uint8Array): string {
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("�")) text = new TextDecoder("windows-1250").decode(bytes);
  return text.replace(/^﻿/, "");
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 15);
  let best = ";";
  let bestScore = -1;
  for (const d of [";", "\t", ","]) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const mode = [...nonZero].sort((a, b) => nonZero.filter((x) => x === b).length - nonZero.filter((x) => x === a).length)[0];
    const score = nonZero.filter((c) => c === mode).length * 100 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let q = false;
  let n = 0;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

export function parseCsv(text: string, delim = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseCsvBytes(bytes: Uint8Array): TableParseResult {
  return parseRows(parseCsv(decodeText(bytes)));
}

// ---------- XLSX ----------

function excelValue(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return excelValue(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    if ("error" in o) return null;
  }
  return null;
}

export async function parseXlsxBytes(bytes: Uint8Array): Promise<TableParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  let fallback: TableParseResult | null = null;
  for (const ws of wb.worksheets) {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: Cell[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(excelValue(row.getCell(c).value));
      rows.push(cells);
    });
    if (rows.length === 0) continue;
    const res = parseRows(rows);
    if (res.confident) return res;
    fallback ??= res;
  }
  return fallback ?? { txs: [], mapping: {}, headers: [], rows: [], confident: false };
}
