// Import PDF výpisu: extrakcia textových riadkov (pdfjs) + heuristické čítanie transakcií.
// Heuristiky nepokrývajú každú banku – užívateľ vždy kontroluje výsledok v tabuľke.
import type { Tx } from "./types";
import { extractSymbols, findDate, findIban, newId, parseAmount, parseDate } from "./util";

export interface TextItem {
  x: number;
  str: string;
  /** šírka a veľkosť písma (ak sú známe) – na rozhodnutie, či medzi položkami je medzera */
  w?: number;
  h?: number;
}

export type RawItem = { x: number; y: number; str: string; w?: number; h?: number };

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
      const raw: RawItem[] = [];
      for (const it of content.items) {
        if (!("str" in it) || it.str.trim() === "") continue;
        raw.push({ x: it.transform[4], y: it.transform[5], str: it.str, w: it.width, h: Math.hypot(it.transform[2], it.transform[3]) || it.height });
      }
      lines.push(...groupItems(raw, p));
    }
  } finally {
    await doc.destroy();
  }
  return lines;
}

/** Zoskupí položky do riadkov podľa y (tolerancia 2.5 jednotky), v riadku podľa x. Čistá funkcia. */
export function groupItems(items: RawItem[], page: number, tol = 2.5): TextLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; items: TextItem[] }[] = [];
  for (const it of sorted) {
    const g = groups.find((gr) => Math.abs(gr.y - it.y) <= tol);
    const item: TextItem = { x: it.x, str: it.str, w: it.w, h: it.h };
    if (g) g.items.push(item);
    else groups.push({ y: it.y, items: [item] });
  }
  return groups.map((g) => {
    g.items.sort((a, b) => a.x - b.x);
    return { page, y: g.y, items: g.items, text: joinItems(g.items) };
  });
}

/** Spojí položky riadka. Medzeru vloží len tam, kde je medzi nimi viditeľná medzera
 *  (pdfjs inak rozdelí slová s diakritikou na kúsky: „Okam ž it á“). Bez šírok vždy medzera. */
export function joinItems(items: TextItem[]): string {
  let out = "";
  let prevEnd: number | null = null;
  for (const i of items) {
    const s = i.str;
    if (!s.trim()) {
      if (out && !out.endsWith(" ")) out += " ";
      prevEnd = i.w !== undefined ? i.x + i.w : null;
      continue;
    }
    if (out && !out.endsWith(" ")) {
      const gap = prevEnd !== null && i.w !== undefined ? i.x - prevEnd : null;
      const fs = i.h && i.h > 0 ? i.h : 8;
      if (gap === null || gap > fs * 0.18) out += " ";
    }
    out += s;
    prevEnd = i.w !== undefined ? i.x + i.w : null;
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

// ---------- parsovanie riadkov ----------

export interface PdfParseResult {
  txs: Tx[];
  warnings: string[];
  /** rozsah rokov nájdených vo výpise */
  yearRange?: { from: number; to: number };
  /** IBAN a meno majiteľa účtu z hlavičky výpisu (na rozpoznanie prevodov medzi vlastnými účtami) */
  ownIban?: string;
  ownerName?: string;
}

const SKIP = /po[cč]iato[cč]n[ýy]\s+zostatok|kone[cč]n[ýy]\s+zostatok|zostatok\s+(?:na|k)\b|\bspolu\b|\bobrat|\bs[úu][cč]et\b|celkom|opening balance|closing balance|\btotal\b|strana\s+\d|page\s+\d|\bobdobie\b|v[ýy]pis\s+(?:[cč]\.|[cč][ií]slo|z\s+[úu][cč]tu)|vyhotoven|vygenerovan/i;
const HEADER_AMOUNT = /\b(suma|amount|objem|[cč]iastka)\b/i;
const HEADER_BALANCE = /zostatok|balance/i;

const MONEY = /(?<![\d.,])[-+−–]?\s?(?:\d{1,3}(?:[   ]\d{3})+|\d+)[.,]\d{2}(?!\d)-?/g;
const DEBIT_WORDS = /debet|odp[ií]san|v[ýy]davok|v[ýy]daj|odch[aá]dz|platba kartou|trval[ýy] pr[ií]kaz|poplatok|inkaso|\bDR\b/i;
const CREDIT_WORDS = /kredit|\bvklad|prijat[aáyý]|prip[ií]san|pr[ií]jem|prich[aá]dz|\bCR\b/i;
const LABEL = /^(?:n[áa]zov\s+proti[úu][cč]tu|n[áa]zov\s+(?:[úu][cč]tu\s+)?protistrany|n[áa]zov\s+[úu][cč]tu|protistrana|pr[íi]jemca|odosielate[ľl]|platite[ľl]|partner|meno)\s*:\s*/i;

/** začiatok sekcie s transakciami, ktoré neprešli – tie sa nezapočítavajú */
const STOP = /nezrealizovan|neuskuto[cč]nen|odmietnut[ée]\s+(?:platby|transakcie)|zamietnut[ée]\s+(?:platby|transakcie)/i;
/** päta strany banky – riadok ignorovať */
const FOOTER = /@|www\.|klientske centrum|^M\d{3}_v\d+/i;

/** „07.01.202507.01.2025 …“ (dátum valuty + dátum zaúčtovania bez medzery) → oddelí ich; použije sa dátum zaúčtovania. */
export function splitJoinedDates(line: string): string {
  return line.replace(/^(\d{1,2}\.\d{1,2}\.\d{4})(\d{1,2}\.\d{1,2}\.\d{4})/, "$2 $1");
}

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

  // hlavička: IBAN a meno majiteľa
  let ownIban: string | undefined;
  let ownerName: string | undefined;
  for (const l of lines.slice(0, 40)) {
    const ib = /(?:[cč][ií]slo\s+[úu][cč]tu|IBAN)\s*:?\s*([A-Z]{2}\d{2}(?:\s?[0-9A-Z]{4}){4,7})/i.exec(l);
    if (ib && !ownIban) ownIban = ib[1].replace(/\s/g, "");
    const nm = /n[áa]zov\s+[úu][cč]tu\s*:?\s*(.+?)(?:\s{2,}|\s+[ÚU][cč]tovn|\s+Obdobie|$)/i.exec(l);
    if (nm && !ownerName && !/proti/i.test(l)) ownerName = nm[1].trim();
  }
  // výpis s explicitným mínusom pri výdavkoch → suma bez znamienka je príjem
  const signed = lines.some((l) => /^\d{1,2}\.\d{1,2}\.\d{4}/.test(l) && /(?:^|\s)[-−–]\s?\d[\d\s]*[.,]\d{2}\s*$/.test(l));

  let balanceCol = false;
  let cur: Pending | null = null;
  let stopped = false;
  const unrealized: string[] = [];

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
    if (!sign && signed) sign = 1;
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
    const labelLine = contLines.find((c) => LABEL.test(c) && !/^n[áa]zov\s+[úu][cč]tu\s*:?\s*$/i.test(c));
    const others = contLines.filter((c) => c !== labelLine && !/^[A-Z]{2}\d{2}(?:\s?[0-9A-Z]{4}){3,7}/.test(c) && !FOOTER.test(c));
    const labelled = labelLine ? [labelLine.replace(LABEL, ""), ...others] : others;
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

  for (const line of lines.map((l) => splitJoinedDates(l.trim())).filter(Boolean)) {
    if (stopped) {
      if (FOOTER.test(line) || SKIP.test(line) || /^v[áa][žz]en[áa]/i.test(line)) {
        stopped = !/strana|v[áa][žz]en[áa]/i.test(line) ? stopped : false;
        if (!stopped) break;
        continue;
      }
      unrealized.push(line);
      continue;
    }
    if (STOP.test(line)) {
      flush();
      stopped = true;
      continue;
    }
    if (FOOTER.test(line)) continue;
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
  if (unrealized.length) {
    warnings.push(`Výpis obsahuje nezrealizované transakcie (neprešli, preto sa nezapočítali): ${trunc(unrealized.join(" · "), 300)}`);
  }
  return { txs, warnings, yearRange, ownIban, ownerName };
}

/** posledný peňažný token; ak výpis má stĺpec zostatku a riadok má viac čísel, predposledný */
function pickAmount(toks: string[], balanceCol: boolean): string | undefined {
  if (toks.length === 0) return undefined;
  if (balanceCol && toks.length >= 2) return toks[toks.length - 2];
  return toks[toks.length - 1];
}

const trunc = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Zjednodušené API: len transakcie. */
export const parseStatementLines = (lines: string[]): Tx[] => parseStatement(lines).txs;

/** Pomôcka pre UI: celý PDF bajty → výsledok. */
export async function parsePdfBytes(bytes: Uint8Array): Promise<PdfParseResult> {
  const lines = await extractPdfLines(bytes);
  const res = parseStatement(lines.map((l) => l.text));
  if (lines.length === 0) res.warnings.unshift("PDF neobsahuje čitateľný text (možno ide o sken). Skúste CSV alebo XLSX export z internet bankingu.");
  return res;
}
