// Parsovanie a formátovanie čísel v slovenskom zápise („1 234,56“).

/** Prevedie text na číslo; prázdny alebo neplatný text → null. */
/**
 * Číslo v slovenskom zápise: „1 234,56“, „1.234,56“ (bodka = tisíce), „1234.5“, „-12,3“, „12 €“.
 * Neplatný text → null.
 */
export function parseSkNumber(s: string): number | null {
  let t = s.replace(/[\s\u00a0\u202f]/g, "").replace(/€/g, "").replace(/^[\u2212\u2013]/, "-");
  if ((t.match(/,/g) ?? []).length > 1) return null;
  if (t.includes(",")) {
    // s čiarkou: bodky sú oddeľovače tisícov (len v skupinách po troch)
    const [int, dec] = t.split(",");
    if (int.includes(".") && !/^[-+]?\d{1,3}(\.\d{3})+$/.test(int)) return null;
    t = int.replace(/\./g, "") + "." + dec;
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(t)) {
    // len bodky v skupinách po troch: „1.234“, „1.234.567“ = tisíce
    t = t.replace(/\./g, "");
  }
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const fmt = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Číslo v slovenskom zápise, bez zbytočných núl. */
export const formatSkNumber = (n: number): string => fmt.format(n);

/** ISO dátum alebo dátum a čas → „d. m. yyyy“. */
export function skDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** ISO dátum a čas → „d. m. yyyy hh:mm“. */
export function skDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${skDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
