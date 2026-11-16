import { eur, pct } from "../engine/money";
import type { CalcResult } from "../engine/types";
import { Card as UiCard } from "./Card";
import { AssignNotice } from "./AssignNotice";
import { PROFILES } from "./ProfileSwitch";

const Card = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={`stat ${tone ?? ""}`}>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export function SummaryPanel({ result }: { result: CalcResult }) {
  const s = result.summary;
  const refund = s.taxToPay < 0;
  return (
    <UiCard id="card-summary" title={`Súhrn za rok ${result.year}`} defaultOpen>
      <p className="result-context small">
        Rok {result.year} · {PROFILES.find((p) => p.id === (result.profile ?? "szco"))?.label} · odhad
      </p>
      <div className="stats">
        <Card label={refund ? "Preplatok" : "Daň na úhradu"} value={eur(Math.abs(s.taxToPay))} tone={refund ? "good" : "main"} />
        <Card label={`Daň za rok ${result.year}`} value={eur(s.tax)} sub={Math.abs(s.tax - s.taxToPay) > 0.005 ? `odpočítané (preddavky, bonus) ${eur(s.tax - s.taxToPay)}` : undefined} />
        <Card label="Príjmy" value={eur(s.income)} />
        {result.profile === "zamestnanec" ? (
          <Card label="Poistné zamestnanca" value={eur(s.employeeInsurance ?? 0)} sub="platí zamestnávateľ z vašej mzdy" />
        ) : (
          <>
            <Card label="Sociálne poistenie" value={eur(s.sp)} />
            <Card label="Zdravotné poistenie" value={eur(s.zp)} />
          </>
        )}
        <Card label="Príjem po dani a odvodoch" value={eur(s.net)} sub={`${eur(s.netMonthly)} mesačne`} tone="good" />
        <Card label="Efektívne zaťaženie" value={s.effectiveRate > 1 ? "nad 100 %" : pct(s.effectiveRate)} sub={s.effectiveRate > 1 ? "odvody sú vyššie ako príjmy" : "daň + odvody z príjmov"} />
      </div>
      <AssignNotice tax={s.tax} year={result.year} />
    </UiCard>
  );
}
