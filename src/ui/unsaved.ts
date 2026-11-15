// Či má rozpracovaný výpočet neuložené zmeny voči Histórii.
import { defaultInput } from "../engine/calc";
import type { CalcInput } from "../engine/types";

/** Porovnanie hodnôt bez ohľadu na poradie kľúčov; chýbajúce/undefined pole = null. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => sameData(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!sameData(ao[k], bo[k])) return false;
  return true;
}

export type UnsavedState = "clean" | "dirty" | "unsaved" | "empty";

/**
 * clean – zhoduje sa s otvoreným uloženým výpočtom; dirty – otvorený výpočet má zmeny;
 * unsaved – nový výpočet s údajmi, ešte neuložený; empty – nič nezadané.
 */
export function unsavedState(input: CalcInput, saved: CalcInput | null): UnsavedState {
  if (saved) return sameData(input, saved) ? "clean" : "dirty";
  return sameData(input, defaultInput(input.year)) ? "empty" : "unsaved";
}
