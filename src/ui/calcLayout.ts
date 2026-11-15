// Karty výsledkového stĺpca na záložke Výpočet: predvolené poradie + zlúčenie s uloženým nastavením.

export interface CardDef {
  id: string;
  title: string;
  /** krátky názov do rýchlych odkazov */
  short: string;
}

export const CALC_CARDS: CardDef[] = [
  { id: "card-summary", title: "Súhrn", short: "Súhrn" },
  { id: "card-steps", title: "Postup výpočtu", short: "Postup" },
  { id: "card-months", title: "Odvody po mesiacoch", short: "Mesiace" },
  { id: "card-filing", title: "Daňové priznanie", short: "DP" },
  { id: "card-limits", title: "Rezerva do limitov", short: "Limity" },
  { id: "card-next", title: "Budúci rok", short: "Budúci rok" },
  { id: "card-contrib", title: "Z čoho sa skladajú odvody", short: "Odvody" },
  { id: "card-bank", title: "Výpis z účtu", short: "Výpis" },
  { id: "card-export", title: "Export a import", short: "Export" },
];

export type LayoutItem = { id: string; visible: boolean };

export const defaultLayout = (): LayoutItem[] => CALC_CARDS.map((c) => ({ id: c.id, visible: true }));

/** Uložené poradie (neznáme id sa zahodia); chýbajúce karty sa vložia na predvolenú pozíciu. */
export function resolveLayout(saved: LayoutItem[] | undefined): LayoutItem[] {
  const known = new Set(CALC_CARDS.map((c) => c.id));
  const out: LayoutItem[] = [];
  const seen = new Set<string>();
  for (const it of saved ?? []) {
    if (known.has(it.id) && !seen.has(it.id)) {
      seen.add(it.id);
      out.push({ id: it.id, visible: it.visible });
    }
  }
  CALC_CARDS.forEach((c, idx) => {
    if (!seen.has(c.id)) out.splice(Math.min(idx, out.length), 0, { id: c.id, visible: true });
  });
  return out;
}

export const cardDef = (id: string): CardDef | undefined => CALC_CARDS.find((c) => c.id === id);
