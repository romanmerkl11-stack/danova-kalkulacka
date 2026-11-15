import type { CalcInput, CalcResult } from "../../engine/types";
import type { ParamSet } from "../../params/types";
import type { AppData } from "../../store/storage";
import { CalendarCard } from "../advisor/CalendarCard";
import { PausalCard } from "../advisor/PausalCard";
import { ReserveCard } from "../advisor/ReserveCard";
import { YoyCard } from "../advisor/YoyCard";
import "../advisor.css";

interface Props {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  input: CalcInput;
  result: CalcResult | null;
  error: string | null;
  params: ParamSet;
}

export function AdvisorTab({ data, setData, input, result, error, params }: Props) {
  const now = new Date();
  return (
    <div className="advisor">
      <p className="advisor-intro">Tipy a prehľady k vášmu výpočtu. Nič tu nemení výsledky výpočtu.</p>
      {!result ? (
        <div className="box danger">{error ?? "Výpočet sa nepodarilo vykonať."}</div>
      ) : (
        <>
          <ReserveCard result={result} now={now} />
          <CalendarCard result={result} now={now} />
          {result.profile !== "zamestnanec" && (
            <PausalCard
              input={input}
              params={params}
              value={data.advisorActualExpenses}
              onChange={(v) => setData((d) => ({ ...d, advisorActualExpenses: v }))}
            />
          )}
          <YoyCard input={input} result={result} params={params} calcs={data.calcs} nickname={data.lastNickname ?? ""} />
        </>
      )}
    </div>
  );
}
