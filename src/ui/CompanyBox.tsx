import { useEffect, useState } from "react";
import { NetDenied } from "../net/net";
import { Card } from "./Card";
import { lookupCompany, searchCompanies, validIco, withDetail } from "../net/sources";
import type { Company } from "../store/storage";

interface Props {
  nickname: string;
  onNickname: (v: string) => void;
  ico: string;
  onIco: (ico: string) => void;
  company: Company | null;
  onFound: (c: Company) => void;
  title?: string;
}

const MIN_NAME = 3;

export function CompanyBox({ nickname, onNickname, ico, onIco, company, onFound, title = "Podnikateľ" }: Props) {
  const [query, setQuery] = useState(ico);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<Company[] | null>(null);
  // hľadanie v registri je skryté, kým si ho používateľ neotvorí
  const [searchOpen, setSearchOpen] = useState(false);

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
        if (c) {
          onFound(c);
          setSearchOpen(false);
        } else setMsg("Pre toto IČO sa v registri nič nenašlo.");
      } else {
        const list = await searchCompanies(q);
        if (list.length === 0) setMsg(`Nenašiel sa žiadny aktívny podnikateľ ani firma s názvom „${q}“.`);
        else if (list.length === 1) await pick(list[0]);
        else setHits(list);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (c: Company) => {
    setHits(null);
    setQuery(c.ico);
    onIco(c.ico);
    onFound(c);
    setSearchOpen(false);
    setBusy(true);
    try {
      onFound(await withDetail(c));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      id="card-company"
      title={title}
      className="company-card"
      actions={
        <button
          type="button"
          className={`icon-btn${searchOpen ? " active" : ""}`}
          aria-label={searchOpen ? "Skryť hľadanie v registri" : "Hľadať v registri (IČO alebo obchodné meno)"}
          title={searchOpen ? "Skryť hľadanie v registri" : "Hľadať v registri (IČO alebo obchodné meno)"}
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen(!searchOpen);
            setHits(null);
            setMsg(null);
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
        </button>
      }
    >
      <div className="field">
        <label htmlFor="nickname">Názov</label>
        <input id="nickname" type="text" value={nickname} placeholder="napr. Ja, Mama" autoComplete="off" onChange={(e) => onNickname(e.target.value)} />
        <p className="note small">Pod týmto názvom sa výpočty ukladajú v Histórii (napr. „Ja“, „Mama“). IČO ani obchodné meno nie sú povinné.</p>
      </div>
      {searchOpen && (
        <>
          <div className="field">
            <label htmlFor="ico">Hľadať v registri – IČO alebo obchodné meno</label>
            <div className="row search-row">
              <input
                id="ico"
                type="text"
                value={query}
                autoFocus
                placeholder="napr. 12345678 alebo Novák"
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search();
                }}
              />
              <button type="button" className="small-btn" onClick={search} disabled={!canSearch || busy}>
                {busy ? "Hľadám…" : "Hľadať"}
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
                    <button type="button" className="hit" onClick={() => void pick(c)}>
                      <strong>{c.name}</strong>
                      <span className="small">IČO {c.ico}{c.address ? ` · ${c.address}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {company && (
        <dl className="company">
          <dt>Obchodné meno</dt>
          <dd>{company.name}</dd>
          <dt>IČO</dt>
          <dd>{company.ico}</dd>
          {company.address && (<><dt>Adresa</dt><dd>{company.address}</dd></>)}
          {company.legalForm && (<><dt>Právna forma</dt><dd>{company.legalForm}</dd></>)}
          {company.nace && (<><dt>SK NACE</dt><dd>{company.nace}</dd></>)}
          {company.established && (<><dt>Vznik</dt><dd>{company.established.split("-").reverse().map(Number).join(". ")}</dd></>)}
          {company.activities && (
            <>
              <dt>Predmety podnikania</dt>
              <dd>
                <ul className="small">{company.activities.map((a) => <li key={a}>{a}</li>)}</ul>
              </dd>
            </>
          )}
        </dl>
      )}
    </Card>
  );
}
