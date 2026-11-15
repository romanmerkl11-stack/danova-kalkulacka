import { MONTHS } from "../engine/calc";
import { eur } from "../engine/money";
import type { CalcInput, CalcResult } from "../engine/types";
import type { Update } from "./InputSections";
import { Card } from "./Card";
import { formatSkNumber } from "./format";
import { NumberInput } from "./NumberInput";

interface Props {
  input: CalcInput;
  result: CalcResult;
  update: Update;
}

function Table({ input, result, update }: Props) {
  const rows = result.months;
  const total = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);

  return (
    <div className="table-wrap">
      <table className="months">
        <thead>
          <tr>
            <th scope="col">Mesiac</th>
            <th scope="col">Za obdobie</th>
            <th scope="col" className="r">Príjem</th>
            <th scope="col" className="r">Sociálne</th>
            <th scope="col" className="r">Zdravotné</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const m = MONTHS[i];
            const spManual = input.insurance.spPaid[i] !== null;
            const zpManual = input.insurance.zpPaid[i] !== null;
            return (
              <tr key={r.month}>
                <th scope="row">{m}</th>
                <td>{r.covers}</td>
                <td className={`r ${r.incomeProjected ? "projected" : ""}`}>
                  {eur(r.income)}
                </td>
                <td className="r">
                  <span className="cell-with-reset">
                    <NumberInput
                      allowNull
                      ariaLabel={`Sociálne poistenie – ${m}`}
                      value={input.insurance.spPaid[i]}
                      placeholder={formatSkNumber(r.sp)}
                      onChange={(v) => update((d) => void (d.insurance.spPaid[i] = v))}
                    />
                    {spManual && <ResetBtn label={`Vrátiť automatiku – sociálne ${m}`} onClick={() => update((d) => void (d.insurance.spPaid[i] = null))} />}
                  </span>
                </td>
                <td className="r">
                  <span className="cell-with-reset">
                    <NumberInput
                      allowNull
                      ariaLabel={`Zdravotné poistenie – ${m}`}
                      value={input.insurance.zpPaid[i]}
                      placeholder={formatSkNumber(r.zp)}
                      onChange={(v) => update((d) => void (d.insurance.zpPaid[i] = v))}
                    />
                    {zpManual && <ResetBtn label={`Vrátiť automatiku – zdravotné ${m}`} onClick={() => update((d) => void (d.insurance.zpPaid[i] = null))} />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>Spolu</th>
            <td className="r">{eur(total((r) => r.income))}</td>
            <td className="r">{eur(total((r) => r.sp))}</td>
            <td className="r">{eur(total((r) => r.zp))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="note small">Sivé hodnoty sú automatické. Prepíšte ich, ak ste zaplatili inú sumu.</p>
    </div>
  );
}

const ResetBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="ghost icon" title="Vrátiť automatiku" aria-label={label} onClick={onClick}>
    ↺
  </button>
);

export function MonthsTable(props: Props) {
  const monthly = props.input.income.mode === "monthly";
  return (
    <Card id="card-months" title={monthly ? "Príjmy a odvody po mesiacoch" : "Odvody po mesiacoch"}>
      <Table {...props} />
    </Card>
  );
}
