import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;

/** Je verzia `a` novšia ako `b`? Porovnáva čísla oddelené bodkami (1.2.3), ignoruje úvodné „v“ a príponu (-beta). */
export function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((x) => parseInt(x, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
