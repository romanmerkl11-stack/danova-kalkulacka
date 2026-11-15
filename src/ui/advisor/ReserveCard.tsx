import { eur } from "../../engine/money";
import type { CalcResult } from "../../engine/types";
import { Card } from "../Card";
import { skDate } from "../format";
import { computeReserve } from "./reserve";

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={`stat ${tone ?? ""}`}>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export function ReserveCard({ result, now }: { result: CalcResult; now: Date }) {
  const r = computeReserve(result, now);
  const dl = skDate(`${r.deadline}T12:00:00`);
  const inc = r.increase;
  return (
    <Card id="card-reserve" title="Koľko si mesačne odkladať">
      <div className="stat-grid">
        {r.total <= 0 ? (
          <Stat label="Na doplatenie" value={eur(0)} sub="za rok nič nedoplácate" tone="good" />
        ) : r.payNow ? (
          <Stat label="Zaplatiť teraz" value={eur(r.total)} sub={`termín ${dl} už uplynul`} tone="main" />
        ) : (
          <Stat label={`Odkladajte si mesačne`} value={eur(r.monthly ?? 0)} sub={`${r.monthsLeft} × do ${dl}`} tone="main" />
        )}
      </div>
      <table className="adv">
        <thead>
          <tr>
            <th scope="col">Čo bude treba doplatiť</th>
            <th scope="col" className="r">Suma</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Daň na úhradu za rok {r.year} (do {dl})</td>
            <td className="r">{eur(r.tax)}</td>
          </tr>
          {r.includeZp && (
            <tr>
              <td>Nedoplatok z ročného zúčtovania ZP</td>
              <td className="r">{eur(r.zpSettlement)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Spolu mimo mesačných platieb</th>
            <td className="r">{eur(r.total)}</td>
          </tr>
        </tfoot>
      </table>
      {inc && (
        <div className="box info">
          Od budúceho roka porastú mesačné odvody (informatívne, nie jednorazová suma): sociálne {eur(inc.spNow)} → {eur(inc.spNext)} (od 7. {r.year + 1}, {inc.spDiff >= 0 ? "+" : "−"}
          {eur(Math.abs(inc.spDiff))}), zdravotné {eur(inc.zpNow)} → {eur(inc.zpNext)} ({inc.zpDiff >= 0 ? "+" : "−"}
          {eur(Math.abs(inc.zpDiff))}).
        </div>
      )}
      <p className="adv-note">Orientačný odhad z vášho výpočtu. Odložená suma nezohľadňuje, že ďalšie príjmy môžu základ dane ešte zmeniť.</p>
    </Card>
  );
}
