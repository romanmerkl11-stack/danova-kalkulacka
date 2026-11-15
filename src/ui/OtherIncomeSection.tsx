import type { CalcInput, OtherItem } from "../engine/types";
import { eur, round2 } from "../engine/money";
import { Card } from "./Card";
import type { Update } from "./InputSections";
import { NumberInput } from "./NumberInput";

const KINDS: { id: OtherItem["kind"]; label: string }[] = [
  { id: "prilezitostna", label: "Príležitostná činnosť / prenájom hnuteľných vecí" },
  { id: "ine", label: "Iné ostatné príjmy" },
];

/** Ostatné príjmy podľa § 8 – riadky s druhom, názvom, príjmom a výdavkami. */
export function OtherIncomeSection({ input, update }: { input: CalcInput; update: Update }) {
  const items = input.other?.items ?? [];
  const setItems = (next: OtherItem[]) => update((d) => void (d.other = { items: next }));
  const set = (i: number, patch: Partial<OtherItem>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const totalIncome = round2(items.reduce((a, it) => a + (it.income || 0), 0));
  const totalExpenses = round2(items.reduce((a, it) => a + (it.expenses || 0), 0));
  return (
    <Card id="card-other" title="Ostatné príjmy (§ 8)" defaultOpen={false} className="card-small">
      {items.length === 0 && <p className="note">Zatiaľ žiadny príjem.</p>}
      {items.map((it, i) => (
        <div className="employer-row" key={i}>
          <div className="employer-head">
            <select aria-label={`Druh príjmu ${i + 1}`} value={it.kind} onChange={(e) => set(i, { kind: e.target.value as OtherItem["kind"] })}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
            <button type="button" className="ghost icon" aria-label={`Odstrániť príjem ${it.name || i + 1}`} onClick={() => setItems(items.filter((_, k) => k !== i))}>
              ×
            </button>
          </div>
          <div className="field">
            <label htmlFor={`other-name-${i}`}>Názov</label>
            <input id={`other-name-${i}`} type="text" placeholder="napr. brigáda, predaj auta" value={it.name} onChange={(e) => set(i, { name: e.target.value })} />
          </div>
          <NumberInput label="Príjem" value={it.income} onChange={(v) => set(i, { income: Math.max(0, v ?? 0) })} />
          <NumberInput label="Výdavky" value={it.expenses} onChange={(v) => set(i, { expenses: Math.max(0, v ?? 0) })} />
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { kind: "prilezitostna", name: "", income: 0, expenses: 0 }])}>+ Pridať príjem</button>
      {items.length > 0 && (
        <p className="note">Spolu príjmy: <strong>{eur(totalIncome)}</strong>, výdavky: <strong>{eur(totalExpenses)}</strong></p>
      )}
      <p className="note small">
        Príjem z prenájmu (§ 6 ods. 3) a z príležitostných činností a prenájmu hnuteľných vecí je oslobodený do 500 € ročne spolu – najprv sa uplatní na prenájom, zvyšok na tieto príjmy.
        Pri iných príjmoch (napr. predaj veci, autorské) oslobodenia si posúďte sami a zadajte len zdaniteľnú časť. Strata z ostatných príjmov sa neodpočítava.
      </p>
    </Card>
  );
}
