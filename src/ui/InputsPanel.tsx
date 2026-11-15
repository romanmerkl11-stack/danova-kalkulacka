import { defaultInput } from "../engine/calc";
import type { CalcInput } from "../engine/types";
import { PARAMS } from "../params/data";
import type { Company } from "../store/storage";
import { Card } from "./Card";
import { CompanyBox } from "./CompanyBox";
import { ChildrenSection, EmploymentSection, OtherSections, RentalSection, SpouseSection, type Update } from "./InputSections";
import { ExpenseRows } from "./ExpenseRows";
import { expenseTotal } from "./expenseItems";
import { NumberInput } from "./NumberInput";
import { eur } from "../engine/money";

const fmt = (v: number | undefined) => (v === undefined ? "–" : eur(v));

interface Props {
  input: CalcInput;
  update: Update;
  replaceInput: (i: CalcInput) => void;
  nickname: string;
  onNickname: (v: string) => void;
  ico: string;
  onIco: (ico: string) => void;
  company: Company | null;
  onFound: (c: Company) => void;
}

const YEARS = Object.keys(PARAMS).map(Number).sort((a, b) => a - b);

export function InputsPanel({ nickname, onNickname, input, update, replaceInput, ico, onIco, company, onFound }: Props) {
  const reset = () => {
    if (window.confirm("Naozaj chcete vynulovať všetky vstupy?")) replaceInput(defaultInput(input.year));
  };

  return (
    <div className="inputs">
      <CompanyBox nickname={nickname} onNickname={onNickname} ico={ico} onIco={onIco} company={company} onFound={onFound} />

      <Card id="card-basic" title="Základné údaje">
        <div className="field">
          <label htmlFor="year">Zdaňovacie obdobie (rok)</label>
          <select id="year" value={input.year} onChange={(e) => update((d) => void (d.year = Number(e.target.value)))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend>Príjmy z podnikania</legend>
          <div className="radio-row">
            <label className="check"><input type="radio" name="imode" checked={input.income.mode === "annual"} onChange={() => update((d) => void (d.income.mode = "annual"))} /> Ročne</label>
            <label className="check"><input type="radio" name="imode" checked={input.income.mode === "monthly"} onChange={() => update((d) => void (d.income.mode = "monthly"))} /> Mesačne</label>
          </div>
          {input.income.mode === "annual" ? (
            <NumberInput label="Príjmy za rok" value={input.income.annual} onChange={(v) => update((d) => void (d.income.annual = v ?? 0))} />
          ) : (
            <>
              <p className="note">Príjmy zadajte v tabuľke „Odvody po mesiacoch“.</p>
              <label className="check">
                <input type="checkbox" checked={input.income.extrapolate} onChange={(e) => update((d) => void (d.income.extrapolate = e.target.checked))} />
                Dopočítať chýbajúce mesiace priemerom
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Výdavky</legend>
          <div className="radio-row">
            <label className="check"><input type="radio" name="emode" checked={input.expenses.mode === "pausal"} onChange={() => update((d) => void (d.expenses.mode = "pausal"))} /> Paušálne (60 %, max 20 000 €)</label>
            <label className="check"><input type="radio" name="emode" checked={input.expenses.mode === "actual"} onChange={() => update((d) => void (d.expenses.mode = "actual"))} /> Skutočné</label>
          </div>
          {input.expenses.mode === "actual" && (
            <>
              {input.expenses.items && input.expenses.items.length > 0 ? (
                <p className="note">Skutočné výdavky za rok: <strong>{eur(input.expenses.actual)}</strong> (súčet riadkov)</p>
              ) : (
                <NumberInput label="Skutočné výdavky za rok" value={input.expenses.actual} onChange={(v) => update((d) => void (d.expenses.actual = v ?? 0))} />
              )}
              <p className="note small">Alebo rozpíšte po mesiacoch (voda, plyn, telefón…):</p>
              <ExpenseRows
                label="výdavky"
                items={input.expenses.items ?? []}
                onChange={(items) =>
                  update((d) => {
                    if (items.length === 0) delete d.expenses.items;
                    else d.expenses.items = items;
                    d.expenses.actual = expenseTotal(items);
                  })
                }
              />
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Sociálne poistenie</legend>
          <div className="field">
            <label htmlFor="sp-regime">Režim od júla</label>
            <select
              id="sp-regime"
              value={input.insurance.spRegimeH2}
              onChange={(e) => update((d) => void (d.insurance.spRegimeH2 = e.target.value as CalcInput["insurance"]["spRegimeH2"]))}
            >
              <option value="standard">Podľa vymeriavacieho základu / minimum</option>
              <option value="mikro">Mikroodvod</option>
              <option value="none">Nie som povinne poistený</option>
            </select>
          </div>
          <label className="check">
            <input type="checkbox" checked={input.insurance.shiftOneMonth} onChange={(e) => update((d) => void (d.insurance.shiftOneMonth = e.target.checked))} />
            Posun o mesiac (január platí za december)
          </label>
        </fieldset>

        <fieldset>
          <legend>Moje mesačné odvody</legend>
          <p className="note small">Sumy, ktoré naozaj platíte. Prázdne = appka použije minimum, resp. výpočet z daňového priznania.</p>
          <NumberInput
            label={`Sociálne poistenie január – jún ${input.year}`}
            value={input.insurance.spJanJun}
            allowNull
            placeholder={`min. ${fmt(PARAMS[input.year]?.sp.minPoistne.value)}`}
            onChange={(v) => update((d) => void (d.insurance.spJanJun = v))}
          />
          <NumberInput
            label={`Sociálne poistenie júl – december ${input.year}`}
            value={input.insurance.spJulDec}
            allowNull
            placeholder={`podľa DP za ${input.year - 1}`}
            onChange={(v) => update((d) => void (d.insurance.spJulDec = v))}
          />
          <NumberInput
            label={`Zdravotné poistenie mesačne ${input.year}`}
            value={input.insurance.zpMonthlyAmount}
            allowNull
            placeholder={`min. ${fmt(PARAMS[input.year]?.zp.minPreddavok.value)}`}
            onChange={(v) => update((d) => void (d.insurance.zpMonthlyAmount = v))}
          />
        </fieldset>
      </Card>

      <EmploymentSection input={input} update={update} />
      <RentalSection input={input} update={update} />
      <ChildrenSection input={input} update={update} />
      <SpouseSection input={input} update={update} />
      <OtherSections input={input} update={update} />

      <button type="button" className="danger-btn" onClick={reset}>Vynulovať vstupy</button>
    </div>
  );
}
