// Parsovanie a formátovanie čísel v slovenskom zápise („1 234,56“).

/** Prevedie text na číslo; prázdny alebo neplatný text → null. */
export function parseSkNumber(s: string): number | null {
  const t = s.replace(/[\s  ]/g, "").replace(/€/g, "").replace(",", ".").replace(/^−/, "-");
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
