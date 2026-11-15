// Poukázanie podielu zaplatenej dane (2 % / 3 %) – orientačný výpočet pre upozornenie.
import { floor2 } from "../engine/money";

/** najnižší podiel, ktorý sa dá poukázať jednému prijímateľovi */
export const MIN_SHARE = 3;

export interface AssignInfo {
  /** 2 % dane */
  two: number;
  /** 3 % dane (dobrovoľník) */
  three: number;
}

/** Vráti sumy 2 % a 3 % z dane, alebo null, ak by podiel nedosiahol minimum 3 €. */
export function assignShare(tax: number): AssignInfo | null {
  const two = floor2(tax * 0.02);
  if (two < MIN_SHARE) return null;
  return { two, three: floor2(tax * 0.03) };
}
