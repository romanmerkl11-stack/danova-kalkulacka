// Zlúčenie zabalených sadzieb s prijatými aktualizáciami.
import { PARAMS, PARAMS_DATE } from "./data";
import type { ParamSet } from "./types";

/** Prijaté sadzby sú staršie ako zabalené v appke (napr. po aktualizácii appky) → nepoužijú sa. */
export function acceptedIsStale(accepted: ParamSet, acceptedDate: string | undefined): boolean {
  return Object.keys(accepted).length > 0 && (!acceptedDate || acceptedDate < PARAMS_DATE);
}

/** Sadzby na výpočet: zabalené + prijaté (len ak nie sú staršie ako zabalené). */
export function effectiveParams(accepted: ParamSet, acceptedDate: string | undefined): ParamSet {
  return acceptedIsStale(accepted, acceptedDate) ? PARAMS : { ...PARAMS, ...accepted };
}
