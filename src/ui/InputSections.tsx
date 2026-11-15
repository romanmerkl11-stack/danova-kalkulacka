import type { ReactNode } from "react";
import type { CalcInput } from "../engine/types";
import { Card } from "./Card";
import { ExpenseRows } from "./ExpenseRows";
import { expenseTotal, RENTAL_EXPENSE_PRESETS } from "./expenseItems";
import { round2 } from "../engine/money";
import { eur } from "../engine/money";
import { NumberInput } from "./NumberInput";

export type Update = (fn: (draft: CalcInput) => void) => void;
interface Props {
  input: CalcInput;
  update: Update;
}

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <Card id={id} title={title} defaultOpen={false} className="card-small">
    {children}
  </Card>
);

export function EmploymentSection({ input, update }: Props) {
  const e = input.employment;
  return (
    <Section id="card-employment" title="Zamestnanie (§ 5)">
      <NumberInput label="Hrubý príjem zo zamestnania" value={e.gross} onChange={(v) => update((d) => void (d.employment.gross = v ?? 0))} />
      <NumberInput label="Poistné zaplatené zamestnancom" value={e.insurance} onChange={(v) => update((d) => void (d.employment.insurance = v ?? 0))} />
      <NumberInput label="Preddavky na daň zrazené zamestnávateľom" value={e.taxWithheld} onChange={(v) => update((d) => void (d.employment.taxWithheld = v ?? 0))} />
      <NumberInput label="Vyplatený daňový bonus" value={e.bonusPaid} onChange={(v) => update((d) => void (d.employment.bonusPaid = v ?? 0))} />
    </Section>
  );
}

/** Nájomné mesačne × počet mesiacov → ročný príjem z prenájmu. */
function RentalIncome({ input, update }: Props) {
  const r = input.rental;
  // staršie výpočty mali len ročnú sumu → zobraz ako mesačnú (/12)
  const monthly = r.incomeMonthly ?? (r.income ? round2(r.income / 12) : 0);
  const months = r.incomeMonths ?? 12;
  const set = (m: number, n: number) =>
    update((d) => {
      d.rental.incomeMonthly = m;
      d.rental.incomeMonths = n;
      d.rental.income = round2(m * n);
    });
  return (
    <div className="rental-income">
      <div className="row rental-income-row">
        <NumberInput label="Nájomné mesačne" value={monthly} onChange={(v) => set(Math.max(0, v ?? 0), months)} />
        <div className="field months-field">
          <label htmlFor="rental-months">Mesiacov</label>
          <input id="rental-months" type="number" min={0} max={12} value={months} onChange={(e) => set(monthly, Math.min(12, Math.max(0, Number(e.target.value) || 0)))} />
        </div>
      </div>
      <p className="note">Príjmy z prenájmu za rok: <strong>{eur(r.income)}</strong></p>
    </div>
  );
}

export function RentalSection({ input, update }: Props) {
  return (
    <Section id="card-rental" title="Prenájom (§ 6 ods. 3)">
      <RentalIncome input={input} update={update} />
      {input.rental.items && input.rental.items.length > 0 ? (
        <p className="note">Výdavky na prenájom: <strong>{eur(input.rental.expenses)}</strong> (súčet riadkov)</p>
      ) : (
        <NumberInput label="Výdavky na prenájom" value={input.rental.expenses} onChange={(v) => update((d) => void (d.rental.expenses = v ?? 0))} />
      )}
      <p className="note small">Alebo rozpíšte po mesiacoch:</p>
      <ExpenseRows
        label="prenájom"
        items={input.rental.items ?? []}
        presets={RENTAL_EXPENSE_PRESETS}
        onChange={(items) =>
          update((d) => {
            if (items.length === 0) delete d.rental.items;
            else d.rental.items = items;
            d.rental.expenses = expenseTotal(items);
          })
        }
      />
    </Section>
  );
}

export function ChildrenSection({ input, update }: Props) {
  return (
    <Section id="card-children" title="Deti">
      {input.children.length === 0 && <p className="note">Zatiaľ žiadne dieťa.</p>}
      {input.children.map((c, i) => (
        <div className="row child" key={i}>
          <input
            type="text"
            aria-label={`Meno dieťaťa ${i + 1}`}
            placeholder="Meno"
            value={c.name}
            onChange={(e) => update((d) => void (d.children[i].name = e.target.value))}
          />
          <input
            type="month"
            aria-label={`Dátum narodenia dieťaťa ${i + 1}`}
            value={c.birth}
            onChange={(e) => update((d) => void (d.children[i].birth = e.target.value))}
          />
          <button type="button" className="ghost" aria-label={`Odstrániť dieťa ${i + 1}`} onClick={() => update((d) => void d.children.splice(i, 1))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => update((d) => void d.children.push({ name: "", birth: "" }))}>
        + Pridať dieťa
      </button>
    </Section>
  );
}

export function SpouseSection({ input, update }: Props) {
  const s = input.spouse;
  return (
    <Section id="card-spouse" title="Manžel/ka">
      <label className="check">
        <input type="checkbox" checked={s.claim} onChange={(e) => update((d) => void (d.spouse.claim = e.target.checked))} />
        Uplatniť nezdaniteľnú časť na manžela/ku
      </label>
      {s.claim && (
        <>
          <NumberInput label="Vlastný príjem manžela/ky" value={s.income} onChange={(v) => update((d) => void (d.spouse.income = v ?? 0))} />
          <div className="field">
            <label htmlFor="sp-months">Počet mesiacov (1–12)</label>
            <input
              id="sp-months"
              type="number"
              min={1}
              max={12}
              value={s.months}
              onChange={(e) => update((d) => void (d.spouse.months = Math.min(12, Math.max(1, Math.round(Number(e.target.value) || 1)))))}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export function OtherSections({ input, update }: Props) {
  return (
    <>
      <Section id="card-dds" title="Doplnkové dôchodkové sporenie (DDS)">
        <NumberInput label="Zaplatené príspevky na DDS za rok" value={input.dds} onChange={(v) => update((d) => void (d.dds = v ?? 0))} />
      </Section>
      <Section id="card-loss" title="Strata z minulých rokov">
        <NumberInput label="Strata na odpočet" value={input.lossCarry} onChange={(v) => update((d) => void (d.lossCarry = v ?? 0))} />
      </Section>
      <Section id="card-advances" title="Zaplatené preddavky na daň">
        <NumberInput label="Preddavky zaplatené počas roka" value={input.taxAdvancesPaid} onChange={(v) => update((d) => void (d.taxAdvancesPaid = v ?? 0))} />
      </Section>
    </>
  );
}
