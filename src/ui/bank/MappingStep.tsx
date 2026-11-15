import { useMemo, useState } from "react";
import { applyMapping, type ColumnField, type ColumnMapping, type TableParseResult } from "../../bank/parseTable";
import { eur } from "../../engine/money";

const FIELDS: { f: ColumnField; label: string }[] = [
  { f: "date", label: "Dátum" },
  { f: "amount", label: "Suma (so znamienkom)" },
  { f: "credit", label: "Príjem (kredit)" },
  { f: "debit", label: "Výdaj (debet)" },
  { f: "counterparty", label: "Protistrana" },
  { f: "iban", label: "IBAN protistrany" },
  { f: "vs", label: "Variabilný symbol" },
  { f: "description", label: "Popis" },
];

interface Props {
  fileName: string;
  table: TableParseResult;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

/** Ručné priradenie stĺpcov, keď ich automaticky nepoznáme. */
export function MappingStep({ fileName, table, onConfirm, onCancel }: Props) {
  const [mapping, setMapping] = useState<ColumnMapping>(table.mapping);
  const preview = useMemo(() => applyMapping(table.rows.slice(0, 40), mapping).slice(0, 5), [table.rows, mapping]);
  const ok = mapping.date !== undefined && (mapping.amount !== undefined || mapping.credit !== undefined || mapping.debit !== undefined);

  const set = (f: ColumnField, v: string) =>
    setMapping((m) => {
      const n = { ...m };
      if (v === "") delete n[f];
      else n[f] = Number(v);
      return n;
    });

  return (
    <section className="bank-step" aria-label="Priradenie stĺpcov">
      <h3>Priradenie stĺpcov – {fileName}</h3>
      <p className="note">
        Stĺpce sa nepodarilo rozpoznať automaticky. Vyberte, ktorý stĺpec je dátum a suma (alebo príjem a výdaj). Ostatné sú voliteľné.
      </p>
      <div className="bank-map-grid">
        {FIELDS.map(({ f, label }) => (
          <div className="field" key={f}>
            <label htmlFor={`map-${f}`}>{label}</label>
            <select id={`map-${f}`} value={mapping[f] ?? ""} onChange={(e) => set(f, e.target.value)}>
              <option value="">— nepoužiť —</option>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {i + 1}. {h || "(bez názvu)"}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <h4>Náhľad prvých riadkov</h4>
      {preview.length === 0 ? (
        <p className="note warn-text">Zatiaľ sa nepodarilo prečítať žiadny riadok – skontrolujte dátum a sumu.</p>
      ) : (
        <div className="table-wrap">
          <table className="bank-table">
            <thead>
              <tr>
                <th>Dátum</th>
                <th>Protistrana / popis</th>
                <th className="r">Suma</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.counterparty || t.description || "—"}</td>
                  <td className="r">{eur(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" disabled={!ok} onClick={() => onConfirm(mapping)}>
          Použiť mapovanie
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Zrušiť súbor
        </button>
      </div>
    </section>
  );
}
