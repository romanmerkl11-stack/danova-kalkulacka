import { MONTHS } from "../engine/calc";
import { eur, pct } from "../engine/money";
import type { CalcInput, CalcResult } from "../engine/types";
import { skDate } from "./format";

interface Props {
  result: CalcResult | null;
  input: CalcInput;
  title: string;
  companyName: string;
  ico: string;
}

const REGIME = { standard: "podľa vymeriavacieho základu / minimum", mikro: "mikroodvod", none: "nie ste povinne poistený", unknown: "neznámy" } as const;

/** Report len pre tlač (na obrazovke skrytý, v @media print jediný viditeľný). */
export function PrintReport({ result, input, title, companyName, ico }: Props) {
  if (!result) return <div className="print-report" aria-hidden="true" />;
  const s = result.summary;
  const n = result.next;
  const sum = (f: (m: CalcResult["months"][number]) => number) => result.months.reduce((a, m) => a + f(m), 0);
  return (
    <div className="print-report" aria-hidden="true">
      <h1>{title}</h1>
      <p>
        Firma: <strong>{companyName}</strong> · IČO: {ico || "—"} · Rok: {input.year} · Vytlačené: {skDate(new Date().toISOString())}
      </p>

      <h2>Zhrnutie</h2>
      <table>
        <tbody>
          <tr><th>Príjmy</th><td className="r">{eur(s.income)}</td></tr>
          <tr><th>Daň</th><td className="r">{eur(s.tax)}</td></tr>
          <tr><th>{s.taxToPay < 0 ? "Preplatok" : "Daň na úhradu"}</th><td className="r">{eur(Math.abs(s.taxToPay))}</td></tr>
          <tr><th>Sociálne poistenie</th><td className="r">{eur(s.sp)}</td></tr>
          <tr><th>Zdravotné poistenie</th><td className="r">{eur(s.zp)}</td></tr>
          <tr><th>Príjem po dani a odvodoch</th><td className="r">{eur(s.net)}</td></tr>
          <tr><th>Príjem po dani a odvodoch mesačne</th><td className="r">{eur(s.netMonthly)}</td></tr>
          <tr><th>Efektívne zaťaženie</th><td className="r">{pct(s.effectiveRate)}</td></tr>
        </tbody>
      </table>
      {result.warnings.length > 0 && (
        <>
          <h3>Upozornenia</h3>
          <ul>{result.warnings.map((w) => <li key={w.id}>{w.text}</li>)}</ul>
        </>
      )}

      <h2>Limity</h2>
      <table>
        <thead><tr><th>Limit</th><th>Sleduje sa</th><th className="r">Aktuálne</th><th className="r">Limit</th><th>Dôsledok</th></tr></thead>
        <tbody>
          {result.limits.map((l) => (
            <tr key={l.id}>
              <td>{l.label}{l.exceeded ? " (prekročený)" : ""}</td>
              <td>{l.measure}</td>
              <td className="r">{eur(l.current)}</td>
              <td className="r">{eur(l.limit)}</td>
              <td>{l.consequence}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Mesiace</h2>
      <table>
        <thead><tr><th>Mesiac</th><th>Za obdobie</th><th className="r">Príjem</th><th className="r">SP</th><th className="r">ZP</th></tr></thead>
        <tbody>
          {result.months.map((m) => (
            <tr key={m.month}>
              <td>{MONTHS[m.month - 1]}</td>
              <td>{m.covers}</td>
              <td className="r">{eur(m.income)}{m.incomeProjected ? " *" : ""}</td>
              <td className="r">{eur(m.sp)}{m.spAuto ? "" : " ✎"}</td>
              <td className="r">{eur(m.zp)}{m.zpAuto ? "" : " ✎"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th colSpan={2}>Spolu</th><td className="r">{eur(sum((m) => m.income))}</td><td className="r">{eur(sum((m) => m.sp))}</td><td className="r">{eur(sum((m) => m.zp))}</td></tr>
        </tfoot>
      </table>
      <p className="small">* dopočítané priemerom · ✎ zadané ručne</p>

      <h2>Postup výpočtu</h2>
      {result.steps.map((st) => (
        <div key={st.id} className="p-step">
          <div className="p-step-head">
            <span>{st.label}{st.overridden ? " (ručne prepísané)" : ""}</span>
            <strong>{st.id === "sadzba15" ? (st.value ? "áno" : "nie") : eur(st.value)}</strong>
          </div>
          <div className="small mono">{st.formula}</div>
          {st.explain && <div className="small">{st.explain}</div>}
          {(st.law || st.dpRow) && <div className="small">{[st.law, st.dpRow ? `riadok DP: ${st.dpRow}` : ""].filter(Boolean).join(" · ")}</div>}
        </div>
      ))}

      <h2>Budúci rok {n.year}</h2>
      <table>
        <tbody>
          <tr><th>Sociálne poistenie od júla (mesačne)</th><td className="r">{eur(n.spFromJuly)}</td><td>základ {eur(n.spVZ)}, {REGIME[n.spRegime]}</td></tr>
          <tr><th>Zdravotné poistenie (mesačne)</th><td className="r">{eur(n.zpMonthly)}</td><td>základ {eur(n.zpVZ)}</td></tr>
          <tr><th>Ročné zúčtovanie ZP</th><td className="r">{eur(Math.abs(n.zpSettlement))}</td><td>{n.zpSettlement > 0 ? "nedoplatok" : n.zpSettlement < 0 ? "preplatok" : "bez rozdielu"}</td></tr>
          <tr><th>Preddavky na daň</th><td className="r">{eur(n.taxAdvance.amount)}</td><td>{n.taxAdvance.period === "none" ? "neplatíte" : n.taxAdvance.period === "quarterly" ? "štvrťročne" : "mesačne"}</td></tr>
        </tbody>
      </table>

      <p className="print-footer">Orientačný výpočet – nenahrádza daňového poradcu</p>
    </div>
  );
}
