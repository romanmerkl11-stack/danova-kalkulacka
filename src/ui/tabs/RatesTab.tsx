import { useMemo, useState } from "react";
import { eur, pct } from "../../engine/money";
import { NetDenied } from "../../net/net";
import { fetchParamsUpdate, type ParamsUpdate } from "../../net/sources";
import { diffYears, flattenYear, type ParamRow } from "../../params/flatten";
import type { ParamSet } from "../../params/types";
import type { AppData } from "../../store/storage";
import { formatSkNumber, skDate } from "../format";

interface Props {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  params: ParamSet;
  defaultYear: number;
  update: ParamsUpdate | null;
  setUpdate: (u: ParamsUpdate | null) => void;
}

const fmtValue = (v: number, unit: ParamRow["unit"]) => (unit === "€" ? eur(v) : unit === "%" ? pct(v) : formatSkNumber(v));
const GROUPS: ParamRow["group"][] = ["Daň", "Sociálne poistenie", "Zdravotné poistenie", "DPH"];

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const period = (from?: string, to?: string) => (from ? `${skDate(from)} – ${to ? skDate(to) : "do odvolania"}` : "");

export function RatesTab({ data, setData, params, defaultYear, update, setUpdate }: Props) {
  const years = Object.keys(params).map(Number).sort((a, b) => a - b);
  const [year, setYear] = useState(years.includes(defaultYear) ? defaultYear : years[years.length - 1]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [accepted, setAccepted] = useState<string | null>(null);

  const yp = params[year];
  const rows = useMemo(() => (yp ? flattenYear(yp) : []), [yp]);
  const isAccepted = year in data.acceptedParams;
  const unconfigured = data.settings.paramsUrl.includes("OWNER");

  const diffs = useMemo(() => (update ? diffYears(params, update.years) : []), [params, update]);
  const diffYearsList = [...new Set(diffs.map((d) => d.year))];

  const check = async () => {
    setBusy(true);
    setMsg(null);
    setAccepted(null);
    try {
      const u = await fetchParamsUpdate(data.settings.paramsUrl);
      setUpdate(u);
      const d = diffYears(params, u.years);
      setChecked(Object.fromEntries([...new Set(d.map((x) => x.year))].map((y) => [y, true])));
    } catch (e) {
      setUpdate(null);
      setMsg(e instanceof NetDenied ? "Prístup zamietnutý." : `Kontrola sa nepodarila: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!update) return;
    const ys = diffYearsList.filter((y) => checked[y] !== false);
    if (ys.length === 0) return;
    setData((d) => ({ ...d, acceptedParams: { ...d.acceptedParams, ...Object.fromEntries(ys.map((y) => [y, update.years[y]])) } }));
    setAccepted(`Prijaté sadzby pre ${ys.join(", ")}.`);
  };

  const revert = () => {
    if (!window.confirm(`Vrátiť zabalené sadzby pre rok ${year}? Prijaté aktualizované hodnoty sa zahodia.`)) return;
    setData((d) => {
      const ap = { ...d.acceptedParams };
      delete ap[year];
      return { ...d, acceptedParams: ap };
    });
  };

  return (
    <main className="page wide">
      <section className="card">
        <h2>Sadzby a limity</h2>
        <div className="row rates-head">
          <label htmlFor="rates-year">Rok</label>
          <select id="rates-year" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "auto" }}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {yp && <span className={yp.status === "platné" ? "badge" : "badge warn"}>{yp.status}</span>}
        </div>
        {isAccepted && (
          <div className="box info">
            <p style={{ margin: "0 0 8px" }}>Používajú sa prijaté aktualizované sadzby.</p>
            <button type="button" className="ghost" onClick={revert}>Vrátiť zabalené sadzby</button>
          </div>
        )}
        {yp && !yp.tax && <div className="box warn">Daňové parametre pre rok {year} ešte nie sú známe.</div>}

        {GROUPS.map((g) => {
          const gr = rows.filter((r) => r.group === g);
          if (gr.length === 0) return null;
          return (
            <div key={g}>
              <h3>{g}</h3>
              <div className="table-wrap">
                <table className="months rates">
                  <thead>
                    <tr>
                      <th scope="col">Parameter</th>
                      <th scope="col" className="r">Hodnota</th>
                      <th scope="col">Platí od – do</th>
                      <th scope="col">Zdroj</th>
                      <th scope="col">Overené</th>
                      <th scope="col">Poznámka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gr.map((r) => (
                      <tr key={r.key}>
                        <th scope="row" style={{ textTransform: "none", whiteSpace: "normal" }}>{r.label}</th>
                        <td className="r">{fmtValue(r.value, r.unit)}</td>
                        <td>{period(r.p?.validFrom, r.p?.validTo)}</td>
                        <td>{r.p?.source ? <a href={r.p.source} target="_blank" rel="noreferrer">{host(r.p.source)}</a> : ""}</td>
                        <td>{r.p ? r.p.verified ? "✓" : <span className="warn-text">⚠ neoverené</span> : ""}</td>
                        <td style={{ whiteSpace: "normal" }}>{r.p?.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {yp?.dph.note && <p className="note small">{yp.dph.note}</p>}
      </section>

      <section className="card">
        <h2>Kontrola nových sadzieb</h2>
        <p className="note">Appka si stiahne jeden súbor so sadzbami a ukáže vám rozdiely. Nič sa nezmení, kým výslovne nepotvrdíte.</p>
        <div className="row">
          <button type="button" onClick={check} disabled={unconfigured || busy}>{busy ? "Kontrolujem…" : "Skontrolovať nové sadzby"}</button>
        </div>
        {unconfigured && <p className="note small warn-text">Adresa súboru sadzieb ešte nie je nastavená (Nastavenia).</p>}
        {msg && <p className="note warn-text" role="alert">{msg}</p>}
        {accepted && <p className="good-text" role="status">{accepted}</p>}
        {update && (
          <div>
            {update.publishedAt && <p className="note small">Súbor publikovaný: {skDate(update.publishedAt)}</p>}
            {diffs.length === 0 ? (
              <p>Sadzby sú aktuálne.</p>
            ) : (
              <>
                {diffYearsList.map((y) => (
                  <div key={y} className="rates-diff">
                    <label className="check">
                      <input type="checkbox" checked={checked[y] !== false} onChange={(e) => setChecked((c) => ({ ...c, [y]: e.target.checked }))} />
                      <strong>Rok {y}</strong>
                      {!(y in params) && <span className="badge manual">nový rok</span>}
                    </label>
                    <div className="table-wrap">
                      <table className="months">
                        <thead>
                          <tr>
                            <th scope="col">Parameter</th>
                            <th scope="col" className="r">Doteraz</th>
                            <th scope="col" className="r">Nová hodnota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffs.filter((d) => d.year === y).map((d) => (
                            <tr key={d.key}>
                              <th scope="row" style={{ textTransform: "none", whiteSpace: "normal" }}>{d.label}</th>
                              <td className="r">{d.before === undefined ? "—" : formatSkNumber(d.before)}</td>
                              <td className="r">{d.after === undefined ? "odstránené" : formatSkNumber(d.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <div className="row">
                  <button type="button" onClick={accept} disabled={diffYearsList.every((y) => checked[y] === false)}>Prijať vybrané</button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
