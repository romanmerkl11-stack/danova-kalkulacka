// Zlúčenie zabalených sadzieb s prijatými aktualizáciami.
import { PARAMS, PARAMS_DATE } from "./data";
import type { ParamSet, YearParams } from "./types";

/** Prijaté sadzby sú staršie ako zabalené v appke (napr. po aktualizácii appky) → nepoužijú sa. */
export function acceptedIsStale(accepted: ParamSet, acceptedDate: string | undefined): boolean {
  return Object.keys(accepted).length > 0 && (!acceptedDate || acceptedDate < PARAMS_DATE);
}

/** Sadzby na výpočet: zabalené + prijaté (len ak nie sú staršie ako zabalené). */
export function effectiveParams(accepted: ParamSet, acceptedDate: string | undefined): ParamSet {
  return acceptedIsStale(accepted, acceptedDate) ? PARAMS : { ...PARAMS, ...accepted };
}

/** Dátum sadzieb, ktoré sa na daný rok naozaj použijú (prijaté aktualizácie alebo zabalené v appke). */
export function paramsDateFor(year: number, accepted: ParamSet, acceptedDate: string | undefined): string {
  return !acceptedIsStale(accepted, acceptedDate) && accepted[year] && acceptedDate ? acceptedDate : PARAMS_DATE;
}

/** uložený výpočet – len časti potrebné na prácu so sadzbami */
interface WithParams {
  year: number;
  params?: YearParams;
  paramsNext?: YearParams;
}

/** Sadzby uložené s výpočtom sa líšia od aktuálnych (bez uložených sadzieb = nevieme, false). */
export function paramsChanged(c: WithParams, current: ParamSet): boolean {
  if (!c.params) return false;
  const diff = (a: YearParams | undefined, b: YearParams | undefined) => JSON.stringify(a) !== JSON.stringify(b);
  return diff(c.params, current[c.year]) || (c.paramsNext !== undefined && diff(c.paramsNext, current[c.year + 1]));
}

/** Sadzby na prepočet uloženého výpočtu: aktuálne, s rokom výpočtu (a nasledujúcim) nahradenými uloženými. */
export function paramsForSaved(current: ParamSet, c: WithParams): ParamSet {
  if (!c.params) return current;
  return { ...current, [c.year]: c.params, ...(c.paramsNext ? { [c.year + 1]: c.paramsNext } : {}) };
}
