import type { Aggregate, ApplyOpts } from "../../bank/aggregate";
import { eur } from "../../engine/money";

const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat("sk-SK", { month: "long" }).format(new Date(2025, i, 1)));
const cell = (v: number | null) => (v === null ? "–" : eur(v));

interface Props {
  agg: Aggregate;
  opts: ApplyOpts;
  onOpts: (o: ApplyOpts) => void;
  onApply: () => void;
  onCancel: () => void;
  empty: boolean;
}

export function SummaryStep({ agg, opts, onOpts, onApply, onCancel, empty }: Props) {
  const check = (k: keyof ApplyOpts, label: string) => (
    <label className="check">
      <input type="checkbox" checked={opts[k]} onChange={(e) => onOpts({ ...opts, [k]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <section aria-label="Súhrn po mesiacoch">
      <h3>Súhrn po mesiacoch</h3>
      <p className="note small">Poistné sa priraďuje podľa mesiaca platby (dátum zaúčtovania). Mesiace bez platby ostávajú automatické.</p>
      <div className="table-wrap">
        <table className="months">
          <thead>
            <tr>
              <th scope="col">Mesiac</th>
              <th scope="col" className="r">Príjem</th>
              <th scope="col" className="r">Sociálne</th>
              <th scope="col" className="r">Zdravotné</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((m, i) => (
              <tr key={m}>
                <th scope="row">{m}</th>
                <td className="r">{cell(agg.income[i])}</td>
                <td className="r">{cell(agg.sp[i])}</td>
                <td className="r">{cell(agg.zp[i])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Spolu</th>
              <td className="r">{eur(agg.totals.income)}</td>
              <td className="r">{eur(agg.totals.sp)}</td>
              <td className="r">{eur(agg.totals.zp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="bank-checks">
        {check("income", "Prepísať príjmy")}
        {check("sp", "Prepísať sociálne poistenie")}
        {check("zp", "Prepísať zdravotné poistenie")}
      </div>
      <div className="dialog-actions">
        <button type="button" disabled={empty || !(opts.income || opts.sp || opts.zp)} onClick={onApply}>
          Použiť vo výpočte
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Zrušiť
        </button>
      </div>
    </section>
  );
}
