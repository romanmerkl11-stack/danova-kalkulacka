import type { CalcInput, EmployerItem } from "../engine/types";
import { round2 } from "../engine/money";
import { NumberInput } from "./NumberInput";

const blank = (): EmployerItem => ({ name: "", gross: 0, insurance: 0, taxWithheld: 0, bonusPaid: 0 });

/** Riadky zamestnávateľov; staré vstupy len s plochými poľami sa ukážu ako prvý riadok. */
export function employerRows(e: CalcInput["employment"]): EmployerItem[] {
  if (e.items && e.items.length > 0) return e.items;
  return [{ name: "", gross: e.gross, insurance: e.insurance, taxWithheld: e.taxWithheld, bonusPaid: e.bonusPaid }];
}

/** Zapíše riadky aj súčty do plochých polí (aby sa nerozchádzali). */
export function applyEmployerRows(e: CalcInput["employment"], items: EmployerItem[]) {
  const sumOf = (f: (i: EmployerItem) => number) => round2(items.reduce((a, it) => a + (f(it) || 0), 0));
  e.items = items;
  e.gross = sumOf((i) => i.gross);
  e.insurance = sumOf((i) => i.insurance);
  e.taxWithheld = sumOf((i) => i.taxWithheld);
  e.bonusPaid = sumOf((i) => i.bonusPaid);
}

interface Props {
  employment: CalcInput["employment"];
  onChange: (items: EmployerItem[]) => void;
}

export function EmployerRows({ employment, onChange }: Props) {
  const rows = employerRows(employment);
  const set = (i: number, patch: Partial<EmployerItem>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="employer-rows">
      {rows.map((r, i) => (
        <div className="employer-row" key={i}>
          <div className="employer-head">
            <input
              type="text"
              aria-label={`Zamestnávateľ ${i + 1}`}
              placeholder={`Zamestnávateľ ${i + 1}`}
              value={r.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            {rows.length > 1 && (
              <button type="button" className="ghost icon" aria-label={`Odstrániť zamestnávateľa ${r.name || i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
                ×
              </button>
            )}
          </div>
          <NumberInput label="Úhrn príjmov" value={r.gross} onChange={(v) => set(i, { gross: v ?? 0 })} />
          <NumberInput label="Poistné zamestnanca" value={r.insurance} onChange={(v) => set(i, { insurance: v ?? 0 })} />
          <NumberInput label="Zrazené preddavky na daň" value={r.taxWithheld} onChange={(v) => set(i, { taxWithheld: v ?? 0 })} />
          <NumberInput label="Vyplatený bonus" value={r.bonusPaid} onChange={(v) => set(i, { bonusPaid: v ?? 0 })} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, blank()])}>+ Ďalší zamestnávateľ</button>
      <p className="note small">Údaje nájdete na Potvrdení o zdaniteľnej mzde od zamestnávateľa.</p>
    </div>
  );
}
