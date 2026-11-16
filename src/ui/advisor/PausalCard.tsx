import { useMemo } from "react";
import { eur } from "../../engine/money";
import type { CalcInput } from "../../engine/types";
import type { ParamSet } from "../../params/types";
import { Card } from "../Card";
import { NumberInput } from "../NumberInput";
import { compareExpenses } from "./pausal";

interface Props {
  input: CalcInput;
  params: ParamSet;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}

export function PausalCard({ input, params, value, onChange }: Props) {
  const cmp = useMemo(() => {
    if (!value || value <= 0) return null;
    try {
      return compareExpenses(input, params, value);
    } catch {
      return null;
    }
  }, [input, params, value]);
  const rows: [string, (s: NonNullable<typeof cmp>["pausal"]) => number][] = [
    ["Daň", (s) => s.tax],
    ["Odvody tento rok (SP + ZP)", (s) => s.odvody],
    ["Odvody budúci rok (odhad)", (s) => s.nextOdvody],
    ["Príjem po dani a odvodoch", (s) => s.net],
  ];
  return (
    <Card id="card-pausal" title="Paušál alebo skutočné výdavky?">
      <div className="adv-input">
        <NumberInput label="Vaše skutočné výdavky za rok" value={value ?? null} allowNull onChange={(v) => onChange(v ?? undefined)} />
      </div>
      {!cmp ? (
        <p className="adv-note">Zadajte skutočné výdavky za rok {input.year} a porovnáme obe možnosti.</p>
      ) : (
        <>
          <div className={`box ${cmp.better === "actual" ? "warn" : "info"}`}>
            <strong>
              {cmp.better === "same"
                ? "Obe možnosti vychádzajú rovnako."
                : cmp.better === "pausal"
                  ? `Výhodnejšie sú paušálne výdavky – ušetríte ${eur(cmp.pausalAdvantage)}.`
                  : `Výhodnejšie sú skutočné výdavky – ušetríte ${eur(-cmp.pausalAdvantage)}.`}
            </strong>
          </div>
          <table className="adv">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col" className="r">Paušál</th>
                <th scope="col" className="r">Skutočné</th>
                <th scope="col" className="r">Rozdiel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="r">{eur(f(cmp.pausal))}</td>
                  <td className="r">{eur(f(cmp.actual))}</td>
                  <td className="r">{eur(f(cmp.actual) - f(cmp.pausal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="adv-note">
        Skutočné výdavky vyžadujú vedenie účtovníctva alebo daňovej evidencie. Zaplatené poistné sa k paušálu pripočíta automaticky, ale pri skutočných výdavkoch ho musíte zahrnúť do zadanej sumy.
      </p>
    </Card>
  );
}
