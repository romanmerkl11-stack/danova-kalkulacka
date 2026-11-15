import { eur } from "../engine/money";
import type { ExpenseItem } from "../engine/types";
import { EXPENSE_PRESETS, expenseTotal } from "./expenseItems";
import { NumberInput } from "./NumberInput";

interface Props {
  items: ExpenseItem[];
  onChange: (items: ExpenseItem[]) => void;
  /** označenie pre čítačky, napr. „prenájom“ */
  label: string;
  /** tlačidlá rýchleho pridania (predvolene bežné výdavky) */
  presets?: readonly string[];
}

/** Tabuľka mesačných výdavkov (voda, plyn, telefón…); ročný súčet = suma × mesiace. */
export function ExpenseRows({ items, onChange, label, presets = EXPENSE_PRESETS }: Props) {
  const set = (i: number, patch: Partial<ExpenseItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const add = (name = "") => onChange([...items, { name, monthly: 0, months: 12 }]);
  const unused = presets.filter((p) => !items.some((it) => it.name === p));

  return (
    <div className="expense-rows">
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="months expense-table">
            <thead>
              <tr>
                <th scope="col">Názov</th>
                <th scope="col" className="r">Mesačne</th>
                <th scope="col" className="r">Mesiacov</th>
                <th scope="col" className="r">Ročne</th>
                <th scope="col"><span className="sr-only">Odstrániť</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <input type="text" aria-label={`Názov výdavku ${i + 1} – ${label}`} value={it.name} placeholder="napr. Voda" onChange={(e) => set(i, { name: e.target.value })} />
                  </td>
                  <td className="r">
                    <NumberInput ariaLabel={`Mesačná suma – ${it.name || i + 1}`} value={it.monthly} onChange={(v) => set(i, { monthly: v ?? 0 })} />
                  </td>
                  <td className="r">
                    <input
                      type="number"
                      className="months-input"
                      min={1}
                      max={12}
                      aria-label={`Počet mesiacov – ${it.name || i + 1}`}
                      value={it.months}
                      onChange={(e) => set(i, { months: Math.min(12, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
                    />
                  </td>
                  <td className="r">{eur(expenseTotal([it]))}</td>
                  <td>
                    <button type="button" className="ghost icon" aria-label={`Odstrániť riadok ${it.name || i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>Spolu za rok</th>
                <td className="r">{eur(expenseTotal(items))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="chips" role="group" aria-label="Rýchle pridanie výdavku">
        {unused.map((p) => (
          <button key={p} type="button" className="chip" onClick={() => add(p)}>+ {p}</button>
        ))}
        <button type="button" className="chip" onClick={() => add()}>+ Iný riadok</button>
      </div>
    </div>
  );
}
