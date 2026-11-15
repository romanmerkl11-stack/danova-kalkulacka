// Zaradenie transakcií: príjem / SP / ZP / nezapočítať.
import type { BankRule, Category, ClassifiedTx, Tx } from "./types";
import { cleanIban, norm } from "./util";

/**
 * Známe IBAN-y platobných účtov poisťovní. Zámerne prázdne: nemáme overené čísla účtov
 * (SP aj zdravotné poisťovne majú účty podľa typu platby a mení sa to). Spoliehame sa na
 * názov protistrany a na pravidlá, ktoré si používateľ naučí („Zapamätať pre ďalšie výpisy“).
 */
export const KNOWN_IBANS: { iban: string; category: "sp" | "zp"; label: string }[] = [];

const SP_NAME = /socialna poistovna|soc\.? ?poist|sp ustredie|ustredie socialnej poistovne/;
const SP_DESC = /socialne poistenie|poistne sp\b|odvody sp\b|socialna poistovna/;
const ZP_NAME = /vseobecna zdravotna poistovna|\bvszp\b|\bdovera\b|union zdravotna|union zp|zdravotna poistovna/;
const ZP_DESC = /zdravotne poistenie|poistne zp\b|odvody zp\b/;

const OWN_DESC = /vlastny ucet|vlastny prevod|presun|prevod medzi uctami|medzi vlastnymi/;
const REFUND = /vratenie|vratka|refund|storno|reklamac/;
const INTEREST = /\burok|\binterest\b/;
const LOAN = /\buver|pozicka|\bloan\b/;

export interface ClassifyOptions {
  /** IBAN majiteľa výpisu (ak je známy), na rozpoznanie prevodov medzi vlastnými účtami */
  ownIban?: string;
  /** meno majiteľa účtu – prichádzajúca platba od neho samého je prevod, nie príjem */
  ownerName?: string;
}

const nameKey = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

function ruleMatches(r: BankRule, t: Tx): string | null {
  const m = r.match;
  const has = !!(m.iban || m.counterpartyContains || m.vs);
  if (!has) return null;
  const parts: string[] = [];
  if (m.iban) {
    if (cleanIban(m.iban) !== cleanIban(t.iban)) return null;
    parts.push(`IBAN ${cleanIban(m.iban)}`);
  }
  if (m.counterpartyContains) {
    if (!norm(t.counterparty).includes(norm(m.counterpartyContains))) return null;
    parts.push(`protistrana obsahuje „${m.counterpartyContains}“`);
  }
  if (m.vs) {
    if ((t.vs ?? "") !== m.vs.trim()) return null;
    parts.push(`VS ${m.vs.trim()}`);
  }
  return `Pravidlo: ${parts.join(", ")}`;
}

function one(t: Tx, rules: BankRule[], opts: ClassifyOptions): { category: Category; reason: string } {
  for (const r of rules) {
    const why = ruleMatches(r, t);
    if (why) return { category: r.category, reason: why };
  }
  const cp = norm(t.counterparty);
  const desc = norm(t.description);
  const both = `${cp} ${desc}`;
  const iban = cleanIban(t.iban);

  if (t.amount < 0) {
    const known = iban && KNOWN_IBANS.find((k) => cleanIban(k.iban) === iban);
    if (known) return { category: known.category, reason: `Známy účet: ${known.label}` };
    if (SP_NAME.test(cp)) return { category: "sp", reason: "Príjemca obsahuje „Sociálna poisťovňa“" };
    if (ZP_NAME.test(cp)) return { category: "zp", reason: "Príjemca je zdravotná poisťovňa" };
    if (SP_DESC.test(desc) || SP_NAME.test(desc)) return { category: "sp", reason: "Popis platby spomína sociálne poistenie" };
    if (ZP_DESC.test(desc) || ZP_NAME.test(desc)) return { category: "zp", reason: "Popis platby spomína zdravotné poistenie" };
    return { category: "ine", reason: "Ostatný výdavok" };
  }

  if (opts.ownIban && iban && iban === cleanIban(opts.ownIban)) return { category: "ine", reason: "Prevod z vlastného účtu (rovnaký IBAN)" };
  if (opts.ownerName && t.counterparty && nameKey(t.counterparty) === nameKey(opts.ownerName)) return { category: "ine", reason: "Platba od majiteľa účtu – pravdepodobne prevod z vlastného účtu" };
  if (OWN_DESC.test(both)) return { category: "ine", reason: "Pravdepodobne prevod medzi vlastnými účtami" };
  if (REFUND.test(both)) return { category: "ine", reason: "Pravdepodobne vrátenie platby" };
  if (INTEREST.test(both)) return { category: "ine", reason: "Pravdepodobne úrok z účtu" };
  if (LOAN.test(both)) return { category: "ine", reason: "Pravdepodobne úver alebo pôžička" };
  if (SP_NAME.test(cp) || ZP_NAME.test(cp)) return { category: "ine", reason: "Vrátenie z poisťovne (preplatok)" };
  return { category: "prijem", reason: "Prichádzajúca platba" };
}

export function classify(txs: Tx[], rules: BankRule[], opts: ClassifyOptions = {}): ClassifiedTx[] {
  return txs.map((t) => ({ ...t, ...one(t, rules, opts) }));
}

/** Pravidlo z transakcie: preferuje IBAN, inak názov protistrany, inak VS. */
export function ruleFromTx(tx: Tx, category: Category): BankRule {
  const iban = cleanIban(tx.iban);
  if (iban) return { match: { iban }, category };
  if (tx.counterparty?.trim()) return { match: { counterpartyContains: tx.counterparty.trim() }, category };
  if (tx.vs) return { match: { vs: tx.vs }, category };
  return { match: {}, category };
}

/** Pridá pravidlo; ak už rovnaké kritérium existuje, nahradí ho (nové ide na začiatok). */
export function addRule(rules: BankRule[], rule: BankRule): BankRule[] {
  const same = (a: BankRule) => JSON.stringify(a.match) === JSON.stringify(rule.match);
  return [rule, ...rules.filter((r) => !same(r))];
}
