import { useMemo } from "react";
import type { CalcInput, CalcResult } from "../../engine/types";
import type { ParamSet } from "../../params/types";
import type { SavedCalc } from "../../store/storage";
import { Card } from "../Card";
import { fmtYoy, fyiFacts, previousYearResult, yoyRows, yoyTone } from "./yoy";

interface Props {
  input: CalcInput;
  result: CalcResult;
  params: ParamSet;
  calcs: SavedCalc[];
  nickname: string;
}

export function YoyCard({ input, result, params, calcs, nickname }: Props) {
  const prev = useMemo(() => previousYearResult(input, params, calcs, nickname), [input, params, calcs, nickname]);
  const facts = useMemo(() => fyiFacts(params, input.year), [params, input.year]);
  const Y = input.year;
  const fmtDiff = (d: number, kind: "eur" | "pct") => (d > 0 ? "+" : d < 0 ? "−" : "") + fmtYoy(Math.abs(d), kind);
  return (
    <Card id="card-yoy" title="FYI – medziročné porovnanie">
      {prev ? (
        <>
          <p className="adv-note">Porovnanie s: {prev.label}.</p>
          <table className="adv">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col" className="r">{Y - 1}</th>
                <th scope="col" className="r">{Y}</th>
                <th scope="col" className="r">Rozdiel</th>
              </tr>
            </thead>
            <tbody>
              {yoyRows(prev.result, result).map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="r">{fmtYoy(r.prev, r.kind)}</td>
                  <td className="r">{fmtYoy(r.cur, r.kind)}</td>
                  <td className={`r ${yoyTone(r) ? `tone-${yoyTone(r)}` : ""}`}>{fmtDiff(r.cur - r.prev, r.kind)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="adv-note">Porovnanie nie je dostupné – chýbajú sadzby alebo uložený výpočet za rok {Y - 1}.</p>
      )}
      {facts.length > 0 && (
        <ul className="fyi">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
