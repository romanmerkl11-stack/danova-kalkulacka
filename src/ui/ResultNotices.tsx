import type { CalcResult } from "../engine/types";

/**
 * Upozornenia k výsledku (neznáme/predbežné sadzby, strata, prekročené limity…).
 * Zobrazujú sa mimo zbaľovacích kariet, aby boli viditeľné vždy (audit U02).
 */
export function ResultNotices({ result, hideLimitWarnings }: { result: CalcResult; hideLimitWarnings?: boolean }) {
  // na Rýchlom výpočte majú prekročené limity vlastné boxy → nezdvojovať
  const list = hideLimitWarnings ? result.warnings.filter((w) => !w.id.startsWith("exc-")) : result.warnings;
  if (list.length === 0) return null;
  return (
    <div className="warnings result-notices">
      {list.map((w) => (
        <div key={w.id} className={`box ${w.severity}`} role={w.severity === "danger" ? "alert" : undefined}>
          {w.text}
        </div>
      ))}
    </div>
  );
}
