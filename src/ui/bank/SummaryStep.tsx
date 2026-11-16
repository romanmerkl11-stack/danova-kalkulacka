import type { Aggregate, ApplyOpts } from "../../bank/aggregate";
import { eur } from "../../engine/money";

const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat("sk-SK", { month: "long" }).format(new Date(2025, i, 1)));
const cell = (v: number | null) => (v === null ? "–" : eur(v));

const KIND = { income: "príjem", sp: "sociálne poistenie", zp: "zdravotné poistenie" } as const;

interface Props {
  agg: Aggregate;
  year: number;
  /** príjmy sú vo výpočte zadané ročnou sumou (po prenesení sa prepne na mesačné) */
  annualIncome: boolean;
  opts: ApplyOpts;
  onOpts: (o: ApplyOpts) => void;
  onApply: () => void;
  onCancel: () => void;
  empty: boolean;
}

export function SummaryStep({ agg, year, annualIncome, opts, onOpts, onApply, onCancel, empty }: Props) {
  const first = agg.covered.indexOf(true);
  const last = agg.covered.lastIndexOf(true);
  const partial = first >= 0 && (first > 0 || last < 11);
  const check = (k: keyof ApplyOpts, label: string) => (
    <label className="check">
      <input type="checkbox" checked={opts[k]} onChange={(e) => onOpts({ ...opts, [k]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <section aria-label="Súhrn po mesiacoch">
      <h3>Súhrn po mesiacoch</h3>
      <p className="note small">Poistné sa priraďuje podľa mesiaca platby (dátum zaúčtovania). Mesiace bez platby poistného sa dopočítajú automaticky (minimum, resp. podľa DP) – ak ste platili z iného účtu, nahrajte aj ten výpis alebo ich upravte ručne. Vratky (vrátené platby, preplatky) sa odpočítajú.</p>
      {partial && (
        <p className="bank-msg" role="status">
          Výpisy pokrývajú {first === last ? MONTHS[first] : `${MONTHS[first]} – ${MONTHS[last]}`} {year}. Prepíšu sa len tieto mesiace, ostatné zostanú bez zmeny.
          {annualIncome && opts.income && " Príjmy ste zadali ročnou sumou – po použití sa budú zadávať po mesiacoch, chýbajúce mesiace doplňte."}
        </p>
      )}
      {agg.foreign.count > 0 && (
        <p className="bank-msg" role="alert">
          {agg.foreign.count} {agg.foreign.count === 1 ? "pohyb" : "pohybov"} v cudzej mene ({agg.foreign.currencies.join(", ")}) sa nezapočítalo. Sumu v eurách (podľa kurzu z výpisu) doplňte ručne.
        </p>
      )}
      {agg.negative.length > 0 && (
        <p className="bank-msg" role="alert">
          Vratky prevýšili platby: {agg.negative.map((n) => `${MONTHS[n.month - 1]} – ${KIND[n.kind]} (${eur(n.amount)})`).join("; ")}. Mesiac sa započíta ako 0 €, skontrolujte ho.
        </p>
      )}
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
              <tr key={m} className={agg.covered[i] ? undefined : "bank-out"}>
                <th scope="row">{m}</th>
                {agg.covered[i] ? (
                  <>
                    <td className="r">{cell(agg.income[i])}</td>
                    <td className="r">{cell(agg.sp[i])}</td>
                    <td className="r">{cell(agg.zp[i])}</td>
                  </>
                ) : (
                  <td className="r note small" colSpan={3}>mimo výpisu – nezmení sa</td>
                )}
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
