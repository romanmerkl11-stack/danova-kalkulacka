import { ResultNotices } from "../ResultNotices";
import { requestFeedback } from "../../feedback/FeedbackDialog";
import { openFile } from "../../store/storage";
import type { ParamSet } from "../../params/types";
import type { BankRule } from "../../bank/types";
import { BankImport } from "../bank/BankImport";
import { ContributionsPanel } from "../ContributionsPanel";
import { useState } from "react";
import type { CalcInput, CalcResult } from "../../engine/types";
import type { Company, SavedCalc } from "../../store/storage";
import { Card } from "../Card";
import { ExportPanel } from "../ExportPanel";
import { FilingPanel } from "../FilingPanel";
import { InputsPanel } from "../InputsPanel";
import type { Update } from "../InputSections";
import { LimitsPanel } from "../LimitsPanel";
import { MonthsTable } from "../MonthsTable";
import { NextYearPanel } from "../NextYearPanel";
import { StepsList } from "../StepsList";
import { SummaryPanel } from "../SummaryPanel";
import { skDate } from "../format";
import { cardDef, resolveLayout, type LayoutItem } from "../calcLayout";
import { unsavedState } from "../unsaved";

interface Props {
  input: CalcInput;
  update: Update;
  replaceInput: (i: CalcInput) => void;
  nickname: string;
  onNickname: (v: string) => void;
  calcLayout?: LayoutItem[];
  ico: string;
  onIco: (ico: string) => void;
  company: Company | null;
  onFound: (c: Company) => void;
  calc: { result: CalcResult | null; error: string | null };
  currentCalc: SavedCalc | null;
  /** uloží výpočet; true až po potvrdenom zápise */
  onSave: (title: string, asNew: boolean) => Promise<boolean>;
  companyName: string;
  onLoadInput: (input: CalcInput, ico?: string) => void;
  params: ParamSet;
  bankRules: BankRule[];
  onBankRules: (r: BankRule[]) => void;
}

function SaveControls({ input, currentCalc, onSave }: Pick<Props, "input" | "currentCalc" | "onSave">) {
  const [asking, setAsking] = useState<null | { asNew: boolean; title: string }>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  /** „Uložené“ sa ukáže až po potvrdenom zápise na disk */
  const doSave = async (title: string, asNew: boolean) => {
    setFailed(false);
    const ok = await onSave(title, asNew);
    if (ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } else setFailed(true);
  };
  const defaultTitle = `Výpočet ${input.year} – ${skDate(new Date().toISOString())}`;
  const state = unsavedState(input, currentCalc?.input ?? null);

  const submit = () => {
    if (!asking) return;
    void doSave(asking.title.trim() || defaultTitle, asking.asNew);
    setAsking(null);
  };

  return (
    <div className="calc-bar-save" aria-label="Uloženie výpočtu">
      {currentCalc ? (
        <span className="calc-bar-note small" title={currentCalc.title}>Upravujete: <strong>{currentCalc.title}</strong></span>
      ) : null}
      {!saved && (state === "dirty" || state === "unsaved") && (
        <span className="unsaved-badge small" role="status">● {state === "dirty" ? "Neuložené zmeny" : "Výpočet nie je uložený"}</span>
      )}
      {asking ? (
        <form
          className="save-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="save-title" className="sr-only">Názov výpočtu</label>
          <input id="save-title" type="text" autoFocus placeholder="Názov výpočtu" value={asking.title} onChange={(e) => setAsking({ ...asking, title: e.target.value })} />
          <button type="submit">Uložiť</button>
          <button type="button" className="ghost" onClick={() => setAsking(null)}>Zrušiť</button>
        </form>
      ) : (
        <div className="save-actions">
          {currentCalc ? (
            <>
              <button type="button" onClick={() => void doSave(currentCalc.title, false)}>Uložiť zmeny</button>
              <button type="button" className="ghost" onClick={() => setAsking({ asNew: true, title: `${currentCalc.title} (kópia)` })}>Uložiť ako nový</button>
            </>
          ) : (
            <button type="button" onClick={() => setAsking({ asNew: true, title: defaultTitle })}>Uložiť výpočet</button>
          )}
          {saved && <span className="good-text" role="status">Uložené</span>}
          {failed && <span className="bad-text" role="alert">Uloženie zlyhalo</span>}
        </div>
      )}
    </div>
  );
}

function openCard(id: string) {
  window.dispatchEvent(new CustomEvent("dk-open-card", { detail: id }));
  window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

export function CalcTab({ input, update, replaceInput, nickname, onNickname, calcLayout, ico, onIco, company, onFound, calc, currentCalc, onSave, companyName, onLoadInput, params, bankRules, onBankRules }: Props) {
  const [bankOpen, setBankOpen] = useState(false);
  const emp = (input.profile ?? "szco") === "zamestnanec";
  // karty špecifické pre SZČO sa pri profile „zamestnanec“ nezobrazujú
  const SZCO_ONLY = ["card-months", "card-next", "card-contrib", "card-bank"];
  const layout = resolveLayout(calcLayout).filter((l) => l.visible && !(emp && SZCO_ONLY.includes(l.id)));
  const result = calc.result;

  const render = (id: string) => {
    if (!result) return null;
    switch (id) {
      case "card-steps": return <StepsList result={result} input={input} update={update} />;
      case "card-filing": return <FilingPanel result={result} />;
      case "card-months": return <MonthsTable input={input} result={result} update={update} />;
      case "card-summary": return <SummaryPanel result={result} />;
      case "card-limits": return <LimitsPanel result={result} />;
      case "card-next": return <NextYearPanel result={result} />;
      case "card-contrib": return <ContributionsPanel result={result} params={params} />;
      case "card-bank":
        return (
          <Card id="card-bank" title="Výpis z účtu" defaultOpen={false}>
            <p className="note small">Nahrajte výpis (PDF, Excel, CSV alebo XML) – appka nájde príjmy a platby do Sociálnej a zdravotnej poisťovne a rozpíše ich do mesiacov. Výpis sa spracuje len v tomto počítači.</p>
            <button type="button" onClick={() => setBankOpen(true)}>Nahrať výpis z účtu</button>
          </Card>
        );
      case "card-export":
        return <ExportPanel result={result} input={input} ico={ico} companyName={companyName} title={currentCalc?.title ?? `Výpočet ${input.year}`} onLoad={onLoadInput} />;
      default: return null;
    }
  };

  return (
    <main className="layout calc-tab">
      <InputsPanel input={input} update={update} replaceInput={replaceInput} nickname={nickname} onNickname={onNickname} ico={ico} onIco={onIco} company={company} onFound={onFound} params={params} />
      <div className="results">
        {calc.error || !result ? (
          <div className="box danger" role="alert">
            Výpočet sa nepodarilo dokončiť: {calc.error}{" "}
            <button type="button" className="link-btn" onClick={() => requestFeedback({ kind: "vypocet", origin: "Chyba výpočtu", error: calc.error ?? undefined })}>
              Nahlásiť tento problém
            </button>
          </div>
        ) : (
          <>
            <ResultNotices result={result} />
            {layout.map((l) => <div key={l.id} className="result-slot">{render(l.id)}</div>)}
          </>
        )}
      </div>
      {result && (
        <div className="calc-bar" role="region" aria-label="Uloženie a rýchle odkazy">
          <SaveControls input={input} currentCalc={currentCalc} onSave={onSave} />
          <nav className="calc-bar-links" aria-label="Rýchle odkazy na karty">
            {layout.map((l) => (
              <button key={l.id} type="button" className="ghost chip" onClick={() => openCard(l.id)}>
                {cardDef(l.id)?.short ?? l.id}
              </button>
            ))}
          </nav>
        </div>
      )}
      {bankOpen && (
        <BankImport
          input={input}
          rules={bankRules}
          onRulesChange={onBankRules}
          onApply={(i) => {
            replaceInput(i);
            setBankOpen(false);
          }}
          onClose={() => setBankOpen(false)}
          openFile={openFile}
        />
      )}
    </main>
  );
}
