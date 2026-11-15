import { MONTHS } from "../engine/calc";
import { eur } from "../engine/money";
import type { CalcResult } from "../engine/types";

export function LimitsPanel({ result }: { result: CalcResult }) {
  if (result.limits.length === 0) return null;
  return (
    <section className="card">
      <h2>Rezerva do limitov</h2>
      {result.limits.map((l) => {
        const ratio = l.limit > 0 ? l.current / l.limit : 0;
        const tone = l.exceeded || ratio > 1 ? "red" : ratio >= 0.8 ? "amber" : "green";
        const left = l.limit - l.current;
        return (
          <div className="limit" key={l.id}>
            <div className="limit-head">
              <strong>{l.label}</strong>
              {l.param && !l.param.verified && <span className="badge warn">⚠ neoverené</span>}
            </div>
            <div className="note small">{l.measure}</div>
            <div
              className="bar"
              role="progressbar"
              aria-label={l.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(ratio * 100))}
            >
              <div className={`bar-fill ${tone}`} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
            </div>
            <div className="limit-nums">
              <span>{eur(l.current)} z {eur(l.limit)}</span>
              <strong className={tone}>{left >= 0 ? `Zostáva ${eur(left)}` : `Prekročené o ${eur(-left)}`}</strong>
            </div>
            <div className="note small">{l.consequence}</div>
            {l.projectedMonth ? (
              <div className="note small warn-text">Pri súčasnom tempe prekročíte v mesiaci {MONTHS[l.projectedMonth - 1]}.</div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
