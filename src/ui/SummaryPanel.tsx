import { eur, pct } from "../engine/money";
import type { CalcResult } from "../engine/types";

const Card = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={`stat ${tone ?? ""}`}>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export function SummaryPanel({ result }: { result: CalcResult }) {
  const s = result.summary;
  const refund = s.taxToPay < 0;
  return (
    <section className="card" aria-label="Zhrnutie">
      <h2>Zhrnutie za rok {result.year}</h2>
      <div className="stats">
        <Card label="Príjmy" value={eur(s.income)} />
        <Card label="Daň" value={eur(s.tax)} />
        <Card label={refund ? "Preplatok" : "Daň na úhradu"} value={eur(Math.abs(s.taxToPay))} tone={refund ? "good" : "main"} />
        <Card label="Sociálne poistenie" value={eur(s.sp)} />
        <Card label="Zdravotné poistenie" value={eur(s.zp)} />
        <Card label="Čistý príjem" value={eur(s.net)} sub={`${eur(s.netMonthly)} mesačne`} tone="good" />
        <Card label="Efektívne zaťaženie" value={pct(s.effectiveRate)} sub="daň + odvody z príjmov" />
      </div>
      {result.warnings.length > 0 && (
        <div className="warnings">
          {result.warnings.map((w) => (
            <div key={w.id} className={`box ${w.severity}`} role={w.severity === "danger" ? "alert" : undefined}>
              {w.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
