import { useState } from "react";
import { CATEGORY_LABEL, type Category, type ClassifiedTx } from "../../bank/types";
import { eur } from "../../engine/money";
import { skDate } from "../format";

type Filter = "all" | Category | "outside";

interface Props {
  txs: ClassifiedTx[];
  year: number;
  /** ids transakcií, ktorých kategóriu zmenil používateľ (ponúkne sa zapamätanie) */
  touched: Set<string>;
  onCategory: (tx: ClassifiedTx, c: Category) => void;
  onRemember: (tx: ClassifiedTx) => void;
}

const CATS: Category[] = ["prijem", "sp", "zp", "ine"];

export function ReviewTable({ txs, year, touched, onCategory, onRemember }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const inYear = txs.filter((t) => Number(t.date.slice(0, 4)) === year);
  const outside = txs.length - inYear.length;
  const shown = filter === "outside" ? txs.filter((t) => Number(t.date.slice(0, 4)) !== year) : filter === "all" ? inYear : inYear.filter((t) => t.category === filter);
  const count = (c: Category) => inYear.filter((t) => t.category === c).length;

  const tab = (f: Filter, label: string) => (
    <button key={f} type="button" className={`bank-tab ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
      {label}
    </button>
  );

  return (
    <section aria-label="Prehľad transakcií">
      <div className="bank-tabs">
        {tab("all", `Všetko (${inYear.length})`)}
        {CATS.map((c) => tab(c, `${CATEGORY_LABEL[c]} (${count(c)})`))}
        {outside > 0 && tab("outside", `Mimo roka ${year} (${outside})`)}
      </div>
      {shown.length === 0 ? (
        <p className="note">Žiadne transakcie v tomto zobrazení.</p>
      ) : (
        <div className="table-wrap bank-scroll">
          <table className="bank-table">
            <thead>
              <tr>
                <th>Dátum</th>
                <th>Protistrana / popis</th>
                <th>IBAN</th>
                <th>VS</th>
                <th className="r">Suma</th>
                <th>Kategória</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className={filter === "outside" ? "bank-out" : undefined}>
                  <td>{skDate(t.date)}</td>
                  <td className="bank-wide">
                    <div>{t.counterparty || t.description || "—"}</div>
                    {t.counterparty && t.description && <div className="bank-sub">{t.description}</div>}
                  </td>
                  <td className="mono bank-iban">{t.iban ?? ""}</td>
                  <td>{t.vs ?? ""}</td>
                  <td className={`r ${t.amount < 0 ? "bank-neg" : "bank-pos"}`}>{eur(t.amount)}</td>
                  <td>
                    <select aria-label="Kategória" value={t.category} onChange={(e) => onCategory(t, e.target.value as Category)}>
                      {CATS.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <div className="bank-sub">{touched.has(t.id) ? "Ručne zmenené" : t.reason}</div>
                    {touched.has(t.id) && (
                      <button type="button" className="link-btn" onClick={() => onRemember(t)}>
                        Zapamätať pre ďalšie výpisy
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
