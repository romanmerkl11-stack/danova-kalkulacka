import { eur } from "../engine/money";
import type { CalcResult } from "../engine/types";
import { Card } from "./Card";

export function filingHeadline(r: CalcResult): string {
  const f = r.filing;
  const rz = `15. 2. ${r.year + 1}`;
  if (f.type === null) return "Daňové priznanie podávať nemusíte";
  if (f.type === "A" && f.canUseRZ) return `Stačí ročné zúčtovanie u zamestnávateľa (požiadajte do ${rz}) – alebo DP typ A do ${f.deadline}`;
  if (f.mustFile) return `Treba podať DP typ ${f.type} do ${f.deadline}`;
  return `DP typ ${f.type} podať nemusíte, môžete dobrovoľne do ${f.deadline}`;
}

export function FilingBody({ result }: { result: CalcResult }) {
  const f = result.filing;
  const toPay = result.summary.taxToPay;
  return (
    <>
      <p className="filing-headline">{filingHeadline(result)}</p>
      {f.reasons.length > 0 && (
        <ul className="filing-reasons">
          {f.reasons.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      <dl className="kv">
        <dt>{toPay < 0 ? "Preplatok" : "Daň na úhradu"}</dt>
        <dd><span className="num-text">{eur(Math.abs(toPay))}</span></dd>
      </dl>
    </>
  );
}

export function FilingPanel({ result }: { result: CalcResult }) {
  return (
    <Card id="card-filing" title="Daňové priznanie">
      <FilingBody result={result} />
    </Card>
  );
}
