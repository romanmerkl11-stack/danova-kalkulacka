// Dátový model importu bankového výpisu.

export interface Tx {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** + pripísané, − odpísané */
  amount: number;
  currency?: string;
  counterparty?: string;
  iban?: string;
  vs?: string;
  ks?: string;
  ss?: string;
  description?: string;
  raw: string;
  /** rovnaký dátum a suma ako pohyb z iného výpisu, ale iná protistrana/VS – možno ten istý pohyb */
  possibleDuplicate?: boolean;
}

export type Category = "prijem" | "sp" | "zp" | "ine";

export interface ClassifiedTx extends Tx {
  category: Category;
  /** prečo je zaradená takto (po slovensky) */
  reason: string;
}

export interface BankRule {
  match: { iban?: string; counterpartyContains?: string; vs?: string };
  category: Category;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  prijem: "Príjem",
  sp: "Sociálne poistenie",
  zp: "Zdravotné poistenie",
  ine: "Nezapočítať",
};
