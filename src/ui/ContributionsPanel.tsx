import { eur, pct } from "../engine/money";
import type { CalcResult } from "../engine/types";
import type { ParamSet } from "../params/types";
import { Card } from "./Card";
import { periods, spBreakdown } from "./contrib";

interface Props {
  result: CalcResult;
  params: ParamSet;
}

function SpTable({ amount, sp }: { amount: number; sp: ParamSet[number]["sp"] }) {
  const b = spBreakdown(amount, sp);
  return (
    <>
      <table className="contrib-table">
        <thead>
          <tr><th>Fond</th><th className="num">Sadzba</th><th className="num">Suma</th><th>Na čo slúži</th></tr>
        </thead>
        <tbody>
          {b.parts.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td className="num">{pct(p.rate)}</td>
              <td className="num">{eur(p.amount)}</td>
              <td className="small">{p.what}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th>Spolu</th><th className="num">{pct(sp.funds.reduce((a, f) => a + f.rate, 0))}</th><th className="num">{eur(amount)}</th><th /></tr>
        </tfoot>
      </table>
      <p className="note small">
        Vymeriavací základ {b.exact ? "" : "približne "}{eur(b.vz)} mesačne; každý fond sa počíta zvlášť a zaokrúhľuje nadol na centy.
        {!b.exact && " Suma nezodpovedá presne žiadnemu základu (napr. ručne zadaná), rozpis je pomerný."}
      </p>
    </>
  );
}

export function ContributionsPanel({ result, params }: Props) {
  const y = params[result.year] ?? params[result.taxParamsYear];
  const n = params[result.next.year] ?? y;
  if (!y) return null;
  const sp = periods(result.months, "sp").filter((p) => p.amount > 0);
  const zp = periods(result.months, "zp").filter((p) => p.amount > 0);

  return (
    <Card id="card-contrib" className="contrib" title="Z čoho sa skladajú odvody" defaultOpen={false}>

      <h3>Sociálne poistenie {result.year}</h3>
      {sp.length === 0 && <p className="note">V tomto roku neplatíte sociálne poistenie.</p>}
      {sp.map((p) => (
        <div key={p.from} className="contrib-period">
          <p>
            {p.from === p.to ? `za ${p.from}` : `za ${p.from} – ${p.to}`}: <strong>{eur(p.amount)}</strong> mesačne {p.auto ? "(automaticky)" : "(zadané)"}
          </p>
          <SpTable amount={p.amount} sp={y.sp} />
        </div>
      ))}

      <h3>Zdravotné poistenie {result.year}</h3>
      {zp.map((p) => (
        <p key={p.from}>
          {p.from === p.to ? `za ${p.from}` : `za ${p.from} – ${p.to}`}: <strong>{eur(p.amount)}</strong> mesačne {p.auto ? "(automaticky)" : "(zadané)"} =
          {" "}{pct(y.zp.rate)} z vymeriavacieho základu ≈ {eur(p.amount / y.zp.rate)}
        </p>
      ))}
      <p className="note small">
        Zdravotné poistenie je jeden odvod ({pct(y.zp.rate)}) na zdravotnú starostlivosť. Platíte preddavky; po podaní daňového priznania zdravotná poisťovňa
        urobí ročné zúčtovanie a vyrubí nedoplatok alebo vráti preplatok.
      </p>

      {result.next.spFromJuly > 0 && n && (
        <>
          <h3>Sociálne poistenie od 7/{result.next.year}</h3>
          <SpTable amount={result.next.spFromJuly} sp={n.sp} />
        </>
      )}
      {result.next.zpMonthly > 0 && n && (
        <p>
          Zdravotné poistenie {result.next.year}: <strong>{eur(result.next.zpMonthly)}</strong> mesačne = {pct(n.zp.rate)} z {eur(result.next.zpVZ)}
        </p>
      )}

      <p className="note small">
        Ako SZČO neplatíte poistenie v nezamestnanosti (dá sa platiť dobrovoľne), úrazové ani garančné poistenie – tie platí len zamestnávateľ za zamestnancov.
      </p>
    </Card>
  );
}
