import { useMemo, useState } from "react";
import { calculate } from "../../engine/calc";
import { eur, pct } from "../../engine/money";
import type { CalcResult } from "../../engine/types";
import type { ParamSet } from "../../params/types";
import type { AppData, SavedCalc } from "../../store/storage";
import { calcToJson, parseCalcJson } from "../../export/json";
import { openFile, saveFileAs } from "../../store/storage";
import { skDate } from "../format";

interface Props {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  params: ParamSet;
  onOpen: (c: SavedCalc) => void;
}

const norm = (s: string) => s.toLocaleLowerCase("sk").normalize("NFD").replace(/[̀-ͯ]/g, "");

const STEP_ROWS: [string, string][] = [
  ["prijmy", "Príjmy"],
  ["vydavky", "Výdavky spolu"],
  ["nczd", "Nezdaniteľná časť"],
  ["dan", "Daň"],
  ["danNaUhradu", "Daň na úhradu"],
  ["spZaplatene", "Sociálne poistenie zaplatené"],
  ["zpZaplatene", "Zdravotné poistenie zaplatené"],
  ["spBuduci", "Sociálne poistenie mesačne od júla budúceho roka"],
  ["zpBuduci", "Zdravotné poistenie mesačne budúci rok"],
];

function tryCalc(c: SavedCalc, params: ParamSet): CalcResult | null {
  try {
    return calculate(c.input, params);
  } catch {
    return null;
  }
}

function Compare({ a, b, params }: { a: SavedCalc; b: SavedCalc; params: ParamSet }) {
  const ra = useMemo(() => tryCalc(a, params), [a, params]);
  const rb = useMemo(() => tryCalc(b, params), [b, params]);
  if (!ra || !rb) return <div className="box danger">Jeden z výpočtov sa nepodarilo prepočítať.</div>;

  const rows: { label: string; a: string; b: string; diff: string; dn: number }[] = [];
  const money = (label: string, x: number, y: number) => rows.push({ label, a: eur(x), b: eur(y), diff: eur(y - x), dn: y - x });
  for (const [id, label] of STEP_ROWS) {
    const sa = ra.stepById[id];
    const sb = rb.stepById[id];
    if (sa && sb) money(label, sa.value, sb.value);
  }
  money("Čistý príjem", ra.summary.net, rb.summary.net);
  money("Čistý príjem mesačne", ra.summary.netMonthly, rb.summary.netMonthly);
  rows.push({
    label: "Efektívne zaťaženie",
    a: pct(ra.summary.effectiveRate),
    b: pct(rb.summary.effectiveRate),
    diff: pct(rb.summary.effectiveRate - ra.summary.effectiveRate),
    dn: rb.summary.effectiveRate - ra.summary.effectiveRate,
  });

  return (
    <section className="card" aria-label="Porovnanie výpočtov">
      <h2>Porovnanie</h2>
      <div className="table-wrap">
        <table className="months compare">
          <thead>
            <tr>
              <th scope="col">Položka</th>
              <th scope="col" className="r">A: {a.title}</th>
              <th scope="col" className="r">B: {b.title}</th>
              <th scope="col" className="r">Rozdiel (B − A)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" style={{ textTransform: "none" }}>{r.label}</th>
                <td className="r">{r.a}</td>
                <td className="r">{r.b}</td>
                <td className="r">{r.dn > 0 ? "+" : ""}{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HistoryTab({ data, setData, params, onOpen }: Props) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [ioError, setIoError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const groups = useMemo(() => {
    const q = norm(filter.trim());
    const list = data.calcs
      .filter((c) => !q || norm(`${c.title} ${c.companyName} ${c.nickname ?? ""} ${c.ico}`).includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const map = new Map<string, { name: string; ico: string; items: SavedCalc[] }>();
    for (const c of list) {
      const key = c.nickname ? `n:${c.nickname}` : `${c.ico}|${c.companyName}`;
      const g = map.get(key) ?? { name: c.nickname || c.companyName, ico: c.nickname ? "" : c.ico, items: [] };
      g.items.push(c);
      map.set(key, g);
    }
    return [...map.values()];
  }, [data.calcs, filter]);

  const toggle = (id: string) => {
    setComparing(false);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const duplicate = (c: SavedCalc) => {
    const now = new Date().toISOString();
    const copy: SavedCalc = { ...structuredClone(c), id: crypto.randomUUID(), title: `${c.title} (kópia)`, createdAt: now, updatedAt: now };
    setData((d) => ({ ...d, calcs: [...d.calcs, copy] }));
  };
  const remove = (c: SavedCalc) => {
    if (!window.confirm(`Naozaj zmazať výpočet „${c.title}“?`)) return;
    setData((d) => ({ ...d, calcs: d.calcs.filter((x) => x.id !== c.id) }));
    setSelected((s) => s.filter((x) => x !== c.id));
  };
  const commitRename = () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (title) setData((d) => ({ ...d, calcs: d.calcs.map((x) => (x.id === renaming.id ? { ...x, title, updatedAt: new Date().toISOString() } : x)) }));
    setRenaming(null);
  };

  const exportJson = async (c: SavedCalc) => {
    setIoError(null);
    try {
      await saveFileAs(`vypocet-${c.ico || "bez-ico"}-${c.year}.json`, calcToJson(c), "Výpočet (JSON)", "json");
    } catch (e) {
      setIoError(e instanceof Error ? e.message : String(e));
    }
  };
  const importJson = async () => {
    setIoError(null);
    try {
      const f = await openFile("Výpočet (JSON)", ["json"]);
      if (!f) return;
      const parsed = parseCalcJson(new TextDecoder().decode(f.bytes));
      const saved: SavedCalc = { ...parsed, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
      setData((d) => ({ ...d, calcs: [...d.calcs, saved] }));
    } catch (e) {
      setIoError(e instanceof Error ? e.message : String(e));
    }
  };

  const pair = selected.length === 2 ? selected.map((id) => data.calcs.find((c) => c.id === id)) : [];
  const cmp = pair.length === 2 && pair[0] && pair[1] ? ([pair[0], pair[1]] as const) : null;

  if (data.calcs.length === 0) {
    return (
      <main className="page">
        <section className="card">
          <h2>História</h2>
          <p>Zatiaľ nemáte žiadne uložené výpočty.</p>
          <div className="row"><button type="button" className="ghost" onClick={importJson}>Importovať výpočet (JSON)</button></div>
          {ioError && <div className="box danger" role="alert">{ioError}</div>}
          <p className="note">V záložke „Výpočet“ zadajte údaje a stlačte tlačidlo „Uložiť výpočet“. Uložené výpočty sa tu zoskupia podľa IČO a môžete ich znova otvoriť, duplikovať alebo porovnať.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page wide">
      <section className="card">
        <div className="row">
          <h2 style={{ flex: 1, margin: 0 }}>História výpočtov</h2>
          <button type="button" className="ghost" onClick={importJson}>Importovať výpočet (JSON)</button>
        </div>
        {ioError && <div className="box danger" role="alert">{ioError}</div>}
        <div className="field">
          <label htmlFor="hist-filter">Filter (názov, firma, IČO)</label>
          <input id="hist-filter" type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="napr. Novák alebo 12345678" />
        </div>
        {selected.length === 1 && <p className="note small">Vyberte ešte jeden výpočet na porovnanie.</p>}
        {selected.length > 2 && <p className="note small warn-text">Na porovnanie vyberte presne dva výpočty.</p>}
        {groups.length === 0 && <p className="note">Filtru nezodpovedá žiadny výpočet.</p>}
        {groups.map((g) => (
          <div key={`${g.ico}|${g.name}`} className="hist-group">
            <h3>{g.name}{g.ico ? ` · IČO ${g.ico}` : ""}</h3>
            <ul className="hist-list">
              {g.items.map((c) => (
                <li key={c.id} className="hist-row">
                  <label className="check hist-check">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Vybrať ${c.title} na porovnanie`} />
                  </label>
                  <div className="hist-main">
                    {renaming?.id === c.id ? (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename();
                        }}
                      >
                        <input type="text" autoFocus value={renaming.title} onChange={(e) => setRenaming({ id: c.id, title: e.target.value })} aria-label="Nový názov" />
                        <button type="submit">Uložiť</button>
                        <button type="button" className="ghost" onClick={() => void exportJson(c)}>Export JSON</button>
                    <button type="button" className="ghost" onClick={() => setRenaming(null)}>Zrušiť</button>
                      </form>
                    ) : (
                      <strong>{c.title}</strong>
                    )}
                    <div className="small note">
                      Rok {c.year} · upravené {skDate(c.updatedAt)}
                    </div>
                    <dl className="hist-nums small">
                      <div><dt>Príjmy</dt><dd>{eur(c.summary.income)}</dd></div>
                      <div><dt>Daň</dt><dd>{eur(c.summary.tax)}</dd></div>
                      <div><dt>Daň na úhradu</dt><dd>{eur(c.summary.taxToPay)}</dd></div>
                      <div><dt>Čistý príjem</dt><dd>{eur(c.summary.net)}</dd></div>
                    </dl>
                  </div>
                  <div className="hist-actions">
                    <button type="button" onClick={() => onOpen(c)}>Otvoriť</button>
                    <button type="button" className="ghost" onClick={() => duplicate(c)}>Duplikovať</button>
                    <button type="button" className="ghost" onClick={() => void exportJson(c)}>Export JSON</button>
                    <button type="button" className="ghost" onClick={() => setRenaming({ id: c.id, title: c.title })}>Premenovať</button>
                    <button type="button" className="danger-btn" onClick={() => remove(c)}>Zmazať</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {selected.length === 2 && cmp && (
          <div className="row">
            <button type="button" onClick={() => setComparing(true)}>Porovnať</button>
          </div>
        )}
      </section>
      {cmp && comparing && <Compare a={cmp[0]} b={cmp[1]} params={params} />}
    </main>
  );
}
