// Import PDF výpisu: extrakcia textových riadkov (pdfjs) + heuristické čítanie transakcií.
// Heuristiky nepokrývajú každú banku – užívateľ vždy kontroluje výsledok v tabuľke.
import type { Tx } from "./types";
import { extractSymbols, findDate, findIban, newId, parseAmount, parseDate } from "./util";

export interface TextItem {
  x: number;
  str: string;
}

export interface TextLine {
  page: number;
  y: number;
  text: string;
  items: TextItem[];
}

/** Načíta PDF cez pdfjs (lazy) a zoskupí textové položky do riadkov (strana + súradnica y). */
export async function extractPdfLines(bytes: Uint8Array): Promise<TextLine[]> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const lines: TextLine[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const raw: { x: number; y: number; str: string }[] = [];
      for (const it of content.items) {
        if (!("str" in it) || it.str.trim() === "") continue;
        raw.push({ x: it.transform[4], y: it.transform[5], str: it.str });
      }
      lines.push(...groupItems(raw, p));
    }
  } finally {
    await doc.destroy();
  }
  return lines;
}

/** Zoskupí položky do riadkov podľa y (tolerancia 2.5 jednotky), v riadku podľa x. Čistá funkcia. */
export function groupItems(items: { x: number; y: number; str: string }[], page: number, tol = 2.5): TextLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const g = groups.find((gr) => Math.abs(gr.y - it.y) <= tol);
    if (g) g.items.push({ x: it.x, str: it.str });
    else groups.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
  }
  return groups.map((g) => {
    g.items.sort((a, b) => a.x - b.x);
    return { page, y: g.y, items: g.items, text: g.items.map((i) => i.str.trim()).join(" ").replace(/\s{2,}/g, " ").trim() };
  });
}

// ---------- parsovanie riadkov ----------

export interface PdfParseResult {
  txs: Tx[];
  warnings: string[];
  /** rozsah rokov nájdených vo výpise */
  yearRange?: { from: number; to: number };
}

const SKIP = /po[cč]iato[cč]n[ýy]\s+zostatok|kone[cč]n[ýy]\s+zostatok|zostatok\s+(?:na|k)\b|\bspolu\b|\bobrat|\bs[úu][cč]et\b|celkom|opening balance|closing balance|\btotal\b|strana\s+\d|page\s+\d|\bobdobie\b|v[ýy]pis\s+(?:[cč]\.|[cč][ií]slo|z\s+[úu][cč]tu)|vyhotoven|vygenerovan/i;
const HEADER_AMOUNT = /\b(suma|amount|objem|[cč]iastka)\b/i;
const HEADER_BALANCE = /zostatok|balance/i;

const MONEY = /(?<![\d.,])[-+−–]?\s?(?:\d{1,3}(?:[   ]\d{3})+|\d+)[.,]\d{2}(?!\d)-?/g;
const DEBIT_WORDS = /debet|odp[ií]san|v[ýy]davok|v[ýy]daj|odch[aá]dz|platba kartou|trval[ýy] pr[ií]kaz|poplatok|inkaso|\bDR\b/i;
const CREDIT_WORDS = /kredit|prijat[aáyý]|prip[ií]san|pr[ií]jem|prich[aá]dz|\bCR\b/i;
const LABEL = /^(?:n[áa]zov\s+(?:[úu][cč]tu\s+)?protistrany|n[áa]zov\s+[úu][cč]tu|protistrana|pr[íi]jemca|odosielate[ľl]|platite[ľl]|partner|meno)\s*:\s*/i;

interface Pending {
  head: string;
  date: string;
  cont: string[];
  amountTok?: string;
  allMoney: string[];
}

/** Dátum na začiatku riadka (do 15 znakov) – dd.mm.yyyy, yyyy-mm-dd, alebo dd.mm. s doplneným rokom. */
function lineDate(line: string, defaultYear?: number): string | null {
  const head = line.slice(0, 15);
  const d = findDate(head);
  if (d) return d;
  if (defaultYear) {
    const m = /^\s*(?:\d{1,2}\s+)?(\d{1,2})\.\s?(\d{1,2})\.(?![\d])/.exec(line);
    if (m) return parseDate(`${m[1]}.${m[2]}.${defaultYear}`);
  }
  return null;
}

const stripNoise = (s: string) =>
  s
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/(?<![\d.])\d{1,2}\s?[./]\s?\d{1,2}\s?[./]\s?(?:\d{4})?/g, " ")
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}[A-Z0-9]{0,3}(?![A-Za-z0-9])/g, " ");

function moneyTokens(line: string): string[] {
  return (stripNoise(line).match(MONEY) ?? []).map((t) => t.trim());
}

export function parseStatement(lines: string[]): PdfParseResult {
  const warnings: string[] = [];
  const txs: Tx[] = [];

  // roky z úplných dátumov (rozsah + najčastejší rok pre skrátené dátumy)
  const years = new Map<number, number>();
  for (const l of lines) {
    const re = new RegExp(`(?<![\\d.])(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s?[./]\\s?\\d{1,2}\\s?[./]\\s?\\d{4})(?!\\d)`, "g");
    for (const m of l.matchAll(re)) {
      const iso = parseDate(m[1]);
      if (iso) years.set(+iso.slice(0, 4), (years.get(+iso.slice(0, 4)) ?? 0) + 1);
    }
  }
  const ys = [...years.keys()].sort((a, b) => a - b);
  const yearRange = ys.length ? { from: ys[0], to: ys[ys.length - 1] } : undefined;
  const defaultYear = ys.length ? [...years.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined;

  let balanceCol = false;
  let cur: Pending | null = null;

  const flush = () => {
    if (!cur) return;
    const p = cur;
    cur = null;
    const all = [p.head, ...p.cont].join(" ");
    if (!p.amountTok) {
      warnings.push(`Nepodarilo sa nájsť sumu: „${trunc(p.head)}“`);
      return;
    }
    const tok = p.amountTok;
    const amt = parseAmount(tok);
    if (amt === null || amt === 0) {
      warnings.push(`Nepodarilo sa prečítať sumu: „${trunc(p.head)}“`);
      return;
    }
    const explicit = /^[-−–]|-$/.test(tok.replace(/\s/g, "")) ? -1 : /^\+/.test(tok.trim()) ? 1 : 0;
    let sign: number = explicit;
    if (!sign) {
      const d = DEBIT_WORDS.test(all);
      const c = CREDIT_WORDS.test(all);
      if (d && !c) sign = -1;
      else if (c && !d) sign = 1;
    }
    if (!sign) {
      warnings.push(`Nepodarilo sa určiť, či ide o príjem alebo výdavok: „${trunc(p.head)}“`);
      return;
    }
    const amount = Math.round(sign * Math.abs(amt) * 100) / 100;

    // protistrana a popis
    const rest = stripNoise(p.head)
      .replace(MONEY, " ")
      .replace(/\b(EUR|€)\b|€/gi, " ")
      .replace(/(?:^|\s)(VS|KS|SS)\s*[:=]?\s*\d+/gi, " ")
      .replace(/^\s*\d{1,3}\s+(?=\S)/, " ")
      .replace(/\s+/g, " ")
      .trim();
    const contLines = p.cont
      .map((c) => c.trim())
      .filter((c) => c && !/^[-+−]?\s*[\d\s.,]+\s*(EUR|€)?$/i.test(c) && !/^(?:IBAN\s*:?\s*)?[A-Z]{2}\d{2}[\d A-Z]{11,}$/.test(c) && !/^((VS|KS|SS)\s*[:=/]?\s*\d+\s*[/,;]?\s*)+$/i.test(c));
    const labelled = contLines.map((c) => c.replace(LABEL, ""));
    const counterparty = labelled[0] ?? (rest || undefined);
    const description = [rest, ...labelled.slice(counterparty === labelled[0] ? 1 : 0)].filter(Boolean).join(" ").trim() || undefined;
    const sym = extractSymbols(all);
    txs.push({
      id: newId("pdf"),
      date: p.date,
      amount,
      currency: /\bEUR\b|€/.test(all) ? "EUR" : undefined,
      counterparty: counterparty && counterparty.length > 1 ? counterparty : undefined,
      iban: findIban(all),
      vs: sym.vs,
      ks: sym.ks,
      ss: sym.ss,
      description,
      raw: all,
    });
  };

  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
    if (HEADER_AMOUNT.test(line) && HEADER_BALANCE.test(line) && !lineDate(line, defaultYear)) balanceCol = true;
    const date = lineDate(line, defaultYear);
    if (SKIP.test(line)) {
      flush();
      continue;
    }
    if (date) {
      flush();
      const toks = moneyTokens(line);
      cur = { head: line, date, cont: [], allMoney: toks, amountTok: pickAmount(toks, balanceCol) };
      continue;
    }
    if (!cur) continue;
    const p: Pending = cur;
    if (!p.amountTok && p.cont.length < 2) {
      const toks = moneyTokens(line);
      if (toks.length) {
        p.amountTok = pickAmount(toks, balanceCol);
        p.cont.push(line);
        continue;
      }
    }
    p.cont.push(line);
  }
  flush();
  return { txs, warnings, yearRange };
}

/** posledný peňažný token; ak výpis má stĺpec zostatku a riadok má viac čísel, predposledný */
function pickAmount(toks: string[], balanceCol: boolean): string | undefined {
  if (toks.length === 0) return undefined;
  if (balanceCol && toks.length >= 2) return toks[toks.length - 2];
  return toks[toks.length - 1];
}

const trunc = (s: string) => (s.length > 90 ? s.slice(0, 90) + "…" : s);

/** Zjednodušené API: len transakcie. */
export const parseStatementLines = (lines: string[]): Tx[] => parseStatement(lines).txs;

/** Pomôcka pre UI: celý PDF bajty → výsledok. */
export async function parsePdfBytes(bytes: Uint8Array): Promise<PdfParseResult> {
  const lines = await extractPdfLines(bytes);
  const res = parseStatement(lines.map((l) => l.text));
  if (lines.length === 0) res.warnings.unshift("PDF neobsahuje čitateľný text (možno ide o sken). Skúste CSV alebo XLSX export z internet bankingu.");
  return res;
}
