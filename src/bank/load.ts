// Spoločný vstup: podľa prípony vyberie parser.
import type { Tx } from "./types";
import { parseCamtBytes } from "./parseCamt";
import { parsePdfBytes, parseStatement } from "./parsePdf";
import { decodeText, parseCsvBytes, parseXlsxBytes, type TableParseResult } from "./parseTable";

export interface LoadResult {
  txs: Tx[];
  warnings: string[];
  ownIban?: string;
  ownerName?: string;
  /** pri tabuľke s nejasnými stĺpcami: dáta na ručné mapovanie */
  table?: TableParseResult;
  /** fatálna chyba (nepodporovaný formát…) */
  error?: string;
}

export const ACCEPTED_EXTS = ["pdf", "xlsx", "xls", "csv", "txt", "xml"];

export async function loadStatement(name: string, bytes: Uint8Array): Promise<LoadResult> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  try {
    if (ext === "xls") return { txs: [], warnings: [], error: "Starý formát .xls nie je podporovaný – uložte ako .xlsx alebo CSV." };
    if (ext === "pdf") {
      const r = await parsePdfBytes(bytes);
      return { txs: r.txs, warnings: r.warnings, ownIban: r.ownIban, ownerName: r.ownerName };
    }
    if (ext === "xml") {
      const r = parseCamtBytes(bytes);
      return { txs: r.txs, warnings: r.warnings, ownIban: r.ownIban };
    }
    if (ext === "xlsx") return fromTable(await parseXlsxBytes(bytes));
    if (ext === "csv" || ext === "txt") {
      const t = parseCsvBytes(bytes);
      if (t.confident || ext === "csv") return fromTable(t);
      // textový export bez tabuľkovej hlavičky → skús ako text výpisu
      const r = parseStatement(decodeText(bytes).split(/\r?\n/));
      return r.txs.length ? { txs: r.txs, warnings: r.warnings } : fromTable(t);
    }
    return { txs: [], warnings: [], error: `Nepodporovaný typ súboru „.${ext}“.` };
  } catch (e) {
    return { txs: [], warnings: [], error: `Súbor sa nepodarilo prečítať: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function fromTable(t: TableParseResult): LoadResult {
  if (t.confident) {
    return { txs: t.txs, warnings: t.txs.length === 0 ? ["V súbore sa nenašli žiadne pohyby."] : [], table: t };
  }
  return { txs: [], warnings: [], table: t };
}
