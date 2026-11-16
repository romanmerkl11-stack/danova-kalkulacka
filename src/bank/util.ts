// Spoločné pomocné funkcie pre parsery výpisov.
import type { Tx } from "./types";

/** malé písmená bez diakritiky, zjednotené medzery */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s  ]+/g, " ")
    .trim();
}

/**
 * Číslo zo slovenského/anglického zápisu: „1 234,56“, „-1.234,56“, „1234.56“, „+12,00“,
 * „12,00 EUR“, „€ 5“, „−5,00“, „5,00-“. Neplatný text → null.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input == null) return null;
  let s = String(input)
    .replace(/[\s  ]/g, "")
    .replace(/[−–—‒]/g, "-")
    .replace(/€|eur|czk|usd|gbp|kč/gi, "");
  if (s === "") return null;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/'/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  let dec = "";
  if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? "," : ".";
  else if (lastComma >= 0) dec = commas === 1 ? "," : "";
  else if (lastDot >= 0) dec = dots === 1 && s.length - lastDot - 1 !== 3 ? "." : "";
  let out: string;
  if (dec) {
    const i = s.lastIndexOf(dec);
    out = s.slice(0, i).replace(/[.,]/g, "") + "." + s.slice(i + 1);
  } else out = s.replace(/[.,]/g, "");
  const n = Number(out);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validIso(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Dátum: dd.mm.yyyy, d. m. yyyy, yyyy-mm-dd, dd/mm/yyyy (aj s časom) → ISO alebo null. */
export function parseDate(input: string | Date | null | undefined): string | null {
  if (input == null) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    // exceljs vracia UTC polnoc
    return validIso(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  const s = String(input).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})(?!\d)/.exec(s);
  if (m) return validIso(+m[3], +m[2], +m[1]);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  return null;
}

/** Hľadá dátum kdekoľvek v texte (dd.mm.yyyy, d. m. yyyy, yyyy-mm-dd, dd/mm/yyyy). */
export const DATE_IN_TEXT = /(?<![\d.])(\d{4}-\d{2}-\d{2}|\d{1,2}\s?[./]\s?\d{1,2}\s?[./]\s?\d{4})(?!\d)/;

export function findDate(s: string): string | null {
  const m = DATE_IN_TEXT.exec(s);
  return m ? parseDate(m[1]) : null;
}

/** IBAN bez medzier, veľkými písmenami */
export const cleanIban = (s: string | undefined | null): string => (s ?? "").replace(/\s/g, "").toUpperCase();

/** IBAN v texte (aj s medzerami po štvoriciach) */
export function findIban(s: string): string | undefined {
  const m = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}[A-Z0-9]{0,3}(?![A-Za-z0-9])/.exec(s);
  if (!m) return undefined;
  const c = cleanIban(m[0]);
  return c.length >= 15 && c.length <= 34 ? c : undefined;
}

/** Symboly z textu: „/VS123/SS456/KS0558“, „VS: 123“, „VS 123“, „variabilný symbol 123“ */
export function extractSymbols(s: string): { vs?: string; ks?: string; ss?: string } {
  const out: { vs?: string; ks?: string; ss?: string } = {};
  const re = /(?:^|[^A-Za-z])(VS|KS|SS|variabiln[ýy]\s+symbol|kon[šs]tantn[ýy]\s+symbol|[šs]pecifick[ýy]\s+symbol)\s*[:=]?\s*(\d{1,10})(?!\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase();
    const key = k.startsWith("v") ? "vs" : k.startsWith("k") ? "ks" : "ss";
    if (!out[key]) out[key] = m[2];
  }
  return out;
}

export const monthOf = (iso: string): number => Number(iso.slice(5, 7));
export const yearOf = (iso: string): number => Number(iso.slice(0, 4));

/** Kľúč pre odstránenie duplicít pri nahrávaní viacerých výpisov. */
export const dedupeKey = (t: Tx): string => [t.date, t.amount.toFixed(2), (t.currency ?? "EUR").toUpperCase(), t.vs ?? "", norm(t.counterparty)].join("|");

/** Voľnejší kľúč: rovnaký dátum a suma (rôzne formáty výpisu môžu inak zapísať protistranu či VS). */
export const looseKey = (t: Tx): string => [t.date, t.amount.toFixed(2), (t.currency ?? "EUR").toUpperCase()].join("|");

/**
 * Pridá nové transakcie k existujúcim (prekrývajúce sa výpisy). Párovanie je po kusoch:
 * ak je rovnaký pohyb v existujúcich 2× a v novom výpise 3×, pridá sa 1.
 * Pohyb s rovnakým dátumom a sumou, ale inou protistranou/VS, ako nespárovaný existujúci,
 * sa pridá s označením `possibleDuplicate` (UI ho predvolene nezapočíta).
 * Duplicity v rámci jedného výpisu ostávajú (môžu to byť dve skutočné platby).
 */
export function mergeTxs(existing: Tx[], incoming: Tx[]): { txs: Tx[]; added: number; skipped: number; suspect: number } {
  const strict = new Map<string, number>();
  const loose = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string, d: number) => m.set(k, (m.get(k) ?? 0) + d);
  for (const t of existing) {
    inc(strict, dedupeKey(t), 1);
    inc(loose, looseKey(t), 1);
  }
  const added: Tx[] = [];
  let suspect = 0;
  for (const t of incoming) {
    const k = dedupeKey(t);
    const lk = looseKey(t);
    if ((strict.get(k) ?? 0) > 0) {
      inc(strict, k, -1);
      inc(loose, lk, -1);
      continue;
    }
    if ((loose.get(lk) ?? 0) > 0) {
      inc(loose, lk, -1);
      suspect++;
      added.push({ ...t, possibleDuplicate: true });
    } else added.push(t);
  }
  return { txs: [...existing, ...added], added: added.length, skipped: incoming.length - added.length, suspect };
}

let counter = 0;
export const newId = (prefix = "tx") => `${prefix}-${++counter}`;
