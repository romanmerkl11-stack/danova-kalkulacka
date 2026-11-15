import { useState } from "react";
import type { CalcInput, CalcResult } from "../../engine/types";
import type { Company, SavedCalc } from "../../store/storage";
import { InputsPanel } from "../InputsPanel";
import type { Update } from "../InputSections";
import { LimitsPanel } from "../LimitsPanel";
import { MonthsTable } from "../MonthsTable";
import { NextYearPanel } from "../NextYearPanel";
import { StepsList } from "../StepsList";
import { SummaryPanel } from "../SummaryPanel";
import { skDate } from "../format";

interface Props {
  input: CalcInput;
  update: Update;
  replaceInput: (i: CalcInput) => void;
  ico: string;
  onIco: (ico: string) => void;
  company: Company | null;
  onFound: (c: Company) => void;
  calc: { result: CalcResult | null; error: string | null };
  currentCalc: SavedCalc | null;
  onSave: (title: string, asNew: boolean) => void;
}

function SavePanel({ input, currentCalc, onSave }: Pick<Props, "input" | "currentCalc" | "onSave">) {
  const [asking, setAsking] = useState<null | { asNew: boolean; title: string }>(null);
  const [saved, setSaved] = useState(false);

  const flash = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };
  const defaultTitle = `Výpočet ${input.year} – ${skDate(new Date().toISOString())}`;

  const submit = () => {
    if (!asking) return;
    onSave(asking.title.trim() || defaultTitle, asking.asNew);
    setAsking(null);
    flash();
  };

  return (
    <section className="card" aria-label="Uloženie výpočtu">
      {currentCalc ? (
        <p className="note">
          Upravujete uložený výpočet: <strong>{currentCalc.title}</strong>
        </p>
      ) : (
        <p className="note">Tento výpočet zatiaľ nie je uložený.</p>
      )}
      {asking ? (
        <form
          className="save-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="field">
            <label htmlFor="save-title">Názov výpočtu</label>
            <input id="save-title" type="text" autoFocus value={asking.title} onChange={(e) => setAsking({ ...asking, title: e.target.value })} />
          </div>
          <div className="row">
            <button type="submit">Uložiť</button>
            <button type="button" className="ghost" onClick={() => setAsking(null)}>Zrušiť</button>
          </div>
        </form>
      ) : (
        <div className="row save-actions">
          {currentCalc ? (
            <>
              <button type="button" onClick={() => { onSave(currentCalc.title, false); flash(); }}>Uložiť zmeny</button>
              <button type="button" className="ghost" onClick={() => setAsking({ asNew: true, title: `${currentCalc.title} (kópia)` })}>Uložiť ako nový</button>
            </>
          ) : (
            <button type="button" onClick={() => setAsking({ asNew: true, title: defaultTitle })}>Uložiť výpočet</button>
          )}
          {saved && <span className="good-text" role="status">Uložené</span>}
        </div>
      )}
    </section>
  );
}

export function CalcTab({ input, update, replaceInput, ico, onIco, company, onFound, calc, currentCalc, onSave }: Props) {
  return (
    <main className="layout">
      <InputsPanel input={input} update={update} replaceInput={replaceInput} ico={ico} onIco={onIco} company={company} onFound={onFound} />
      <div className="results">
        {calc.error || !calc.result ? (
          <div className="box danger" role="alert">
            Výpočet sa nepodarilo dokončiť: {calc.error}
          </div>
        ) : (
          <>
            <SavePanel input={input} currentCalc={currentCalc} onSave={onSave} />
            <SummaryPanel result={calc.result} />
            <LimitsPanel result={calc.result} />
            <MonthsTable input={input} result={calc.result} update={update} />
            <StepsList result={calc.result} input={input} update={update} />
            <NextYearPanel result={calc.result} />
          </>
        )}
      </div>
    </main>
  );
}
