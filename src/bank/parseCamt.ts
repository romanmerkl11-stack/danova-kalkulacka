// Import výpisu vo formáte ISO 20022 camt.053 (XML).
import type { Tx } from "./types";
import { cleanIban, extractSymbols, newId, parseDate } from "./util";
import { decodeText } from "./parseTable";

type El = Element;

const kids = (el: El | null | undefined, name: string): El[] =>
  el ? Array.from(el.getElementsByTagNameNS("*", name)) : [];
const first = (el: El | null | undefined, name: string): El | undefined => kids(el, name)[0];
const text = (el: El | null | undefined, name: string): string => first(el, name)?.textContent?.trim() ?? "";
/** priamy potomok (nie hlbšie) podľa lokálneho mena */
const child = (el: El | null | undefined, name: string): El | undefined =>
  el ? Array.from(el.children).find((c) => c.localName === name) : undefined;

export interface CamtResult {
  txs: Tx[];
  /** IBAN majiteľa účtu z <Acct><Id><IBAN> (ak je) */
  ownIban?: string;
  warnings: string[];
}

export function parseCamt(xml: string): CamtResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { txs: [], warnings: ["XML súbor sa nepodarilo načítať."] };
  }
  const warnings: string[] = [];
  const txs: Tx[] = [];
  const ownIban = cleanIban(text(first(doc.documentElement, "Acct") ?? null, "IBAN")) || undefined;

  for (const ntry of kids(doc.documentElement, "Ntry")) {
    const amtEl = child(ntry, "Amt");
    const amtAbs = Math.abs(Number((amtEl?.textContent ?? "").trim().replace(",", ".")));
    const ind = text(ntry, "CdtDbtInd") || child(ntry, "CdtDbtInd")?.textContent?.trim() || "";
    const book = child(ntry, "BookgDt");
    const val = child(ntry, "ValDt");
    const date = parseDate(text(book, "Dt") || text(book, "DtTm")) ?? parseDate(text(val, "Dt") || text(val, "DtTm"));
    if (!date || !Number.isFinite(amtAbs) || amtAbs === 0 || !/^(CRDT|DBIT)$/.test(ind.toUpperCase())) {
      warnings.push(`Položka bez platného dátumu, sumy alebo smeru bola preskočená.`);
      continue;
    }
    const credit = ind.toUpperCase() === "CRDT";
    const reversal = text(ntry, "RvslInd").toLowerCase() === "true";
    const sign = (credit ? 1 : -1) * (reversal ? -1 : 1);

    const tx = first(ntry, "TxDtls");
    const parties = first(tx ?? ntry, "RltdPties");
    // protistrana: pri príjme dlžník, pri výdaji veriteľ
    const cpName = text(child(parties, credit ? "Dbtr" : "Cdtr") ?? null, "Nm") || text(parties, credit ? "Dbtr" : "Cdtr");
    const cpAcct = child(parties, credit ? "DbtrAcct" : "CdtrAcct");
    const iban = cleanIban(text(cpAcct ?? null, "IBAN") || text(cpAcct ?? null, "Id")) || undefined;

    const ustrd = kids(tx ?? ntry, "Ustrd").map((e) => e.textContent?.trim() ?? "").filter(Boolean);
    const strdRef = kids(tx ?? ntry, "Ref").map((e) => e.textContent?.trim() ?? "").filter(Boolean);
    const e2e = text(tx ?? ntry, "EndToEndId");
    const addtl = text(ntry, "AddtlNtryInf");
    const description = [...ustrd, ...strdRef].join(" ").trim() || addtl || undefined;

    const sym = extractSymbols([e2e, ...ustrd, ...strdRef, addtl].join(" "));
    // „/VS123/SS456/KS0558“ – KS môže byť zapísané bez medzery po „KS“
    txs.push({
      id: newId("camt"),
      date,
      amount: Math.round(sign * amtAbs * 100) / 100,
      currency: amtEl?.getAttribute("Ccy") ?? undefined,
      counterparty: cpName || undefined,
      iban,
      vs: sym.vs,
      ks: sym.ks,
      ss: sym.ss,
      description,
      raw: [date, ind, amtAbs, cpName, iban, description].filter((x) => x !== undefined && x !== "").join(" | "),
    });
  }
  if (txs.length === 0 && warnings.length === 0) warnings.push("V súbore sa nenašli žiadne pohyby (Ntry).");
  return { txs, ownIban, warnings };
}

export function parseCamtBytes(bytes: Uint8Array): CamtResult {
  return parseCamt(decodeText(bytes));
}
