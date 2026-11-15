import { useEffect, useState } from "react";
import { NetDenied } from "../net/net";
import { lookupCompany, registryLinks, searchCompanies, validIco } from "../net/sources";
import type { Company } from "../store/storage";

interface Props {
  ico: string;
  onIco: (ico: string) => void;
  company: Company | null;
  onFound: (c: Company) => void;
}

const MIN_NAME = 3;

export function CompanyBox({ ico, onIco, company, onFound }: Props) {
  const [query, setQuery] = useState(ico);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<Company[] | null>(null);

  // keď sa IČO zmení zvonku (napr. výber z histórie), prenesie sa do poľa
  useEffect(() => {
    if (ico) setQuery(ico);
  }, [ico]);

  const q = query.trim();
  const isIco = /^\d+$/.test(q);
  const canSearch = isIco ? validIco(q) : q.length >= MIN_NAME;

  const onQuery = (v: string) => {
    setQuery(v);
    setHits(null);
    setMsg(null);
    const t = v.trim();
    onIco(/^\d{8}$/.test(t) ? t : "");
  };

  const fail = (e: unknown) =>
    setMsg(e instanceof NetDenied ? "Prístup zamietnutý – údaje môžete zadať ručne." : `Nepodarilo sa načítať údaje: ${e instanceof Error ? e.message : String(e)}`);

  const search = async () => {
    if (!canSearch) return;
    setBusy(true);
    setMsg(null);
    setHits(null);
    try {
      if (isIco) {
        const c = await lookupCompany(q);
        if (c) onFound(c);
        else setMsg("Pre toto IČO sa v registri nič nenašlo.");
      } else {
        const list = await searchCompanies(q);
        if (list.length === 0) setMsg(`Nenašiel sa žiadny aktívny podnikateľ ani firma s názvom „${q}“.`);
        else if (list.length === 1) pick(list[0]);
        else setHits(list);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const pick = (c: Company) => {
    setHits(null);
    setQuery(c.ico);
    onIco(c.ico);
    onFound(c);
  };

  return (
    <section className="card">
      <h2>Podnikateľ</h2>
      <div className="field">
        <label htmlFor="ico">IČO alebo obchodné meno</label>
        <div className="row">
          <input
            id="ico"
            type="text"
            value={query}
            placeholder="napr. 12345678 alebo Novák"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
          />
          <button type="button" onClick={search} disabled={!canSearch || busy}>
            {busy ? "Hľadám…" : "Hľadať v registri"}
          </button>
        </div>
        {!isIco && q.length > 0 && q.length < MIN_NAME && <p className="note small">Zadajte aspoň {MIN_NAME} znaky názvu.</p>}
        {isIco && q.length > 0 && !validIco(q) && <p className="note small">IČO má 8 číslic.</p>}
      </div>
      {msg && <p className="note warn-text" role="alert">{msg}</p>}
      {hits && (
        <div className="hits">
          <p className="note small">Nájdené: {hits.length}{hits.length >= 30 ? " (zobrazených prvých 30 – spresnite názov)" : ""}. Vyberte:</p>
          <ul className="hit-list">
            {hits.map((c) => (
              <li key={c.ico}>
                <button type="button" className="hit" onClick={() => pick(c)}>
                  <strong>{c.name}</strong>
                  <span className="small">IČO {c.ico}{c.address ? ` · ${c.address}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {company && (
        <dl className="company">
          <dt>Názov</dt>
          <dd>{company.name}</dd>
          <dt>IČO</dt>
          <dd>{company.ico}</dd>
          {company.address && (<><dt>Adresa</dt><dd>{company.address}</dd></>)}
          {company.legalForm && (<><dt>Právna forma</dt><dd>{company.legalForm}</dd></>)}
          {company.nace && (<><dt>SK NACE</dt><dd>{company.nace}</dd></>)}
        </dl>
      )}
      {validIco(ico) && (
        <p className="links small">
          {registryLinks(ico).map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
          ))}
        </p>
      )}
    </section>
  );
}
