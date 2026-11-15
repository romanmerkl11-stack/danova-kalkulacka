import { eur } from "../engine/money";
import type { CalcResult } from "../engine/types";
import { Card } from "./Card";

const REGIME = { standard: "podľa vymeriavacieho základu / minimum", mikro: "mikroodvod", none: "nie ste povinne poistený", unknown: "neznámy" } as const;

export function NextYearPanel({ result }: { result: CalcResult }) {
  const n = result.next;
  const adv = n.taxAdvance;
  const advText = adv.period === "none" ? "Neplatíte" : adv.period === "quarterly" ? `Štvrťročne ${eur(adv.amount)}` : `Mesačne ${eur(adv.amount)}`;
  return (
    <Card id="card-next" title={`Budúci rok ${n.year}`} defaultOpen={false}>
      {n.paramsStatus !== "platné" && <div className="box warn">Sadzby na budúci rok sú {n.paramsStatus}.</div>}
      <dl className="kv">
        <dt>Sociálne poistenie od júla</dt>
        <dd>
          <span className="num-text">{eur(n.spFromJuly)}</span>
          <span className="note small"> mesačne, základ {eur(n.spVZ)}, režim: {REGIME[n.spRegime]}</span>
        </dd>
        <dt>Zdravotné poistenie mesačne</dt>
        <dd>
          <span className="num-text">{eur(n.zpMonthly)}</span>
          <span className="note small"> základ {eur(n.zpVZ)}</span>
        </dd>
        <dt>Ročné zúčtovanie zdravotného poistenia</dt>
        <dd>
          <span className="num-text">{eur(Math.abs(n.zpSettlement))}</span>
          <span className="note small"> {n.zpSettlement > 0 ? "Nedoplatok" : n.zpSettlement < 0 ? "Preplatok" : "Bez nedoplatku a preplatku"}</span>
        </dd>
        <dt>Preddavky na daň</dt>
        <dd>{advText}</dd>
      </dl>
    </Card>
  );
}
