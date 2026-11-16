import { useState } from "react";
import { NetDenied, SOURCE_LABELS } from "../../net/net";
import { checkAppUpdate, type ReleaseInfo } from "../../net/sources";
import { isTauri, makeBackup, openFile, parseBackup, saveFileAs, saveSafetyCopy, type AppData, type Settings, type SourceId } from "../../store/storage";
import { APP_VERSION, isNewerVersion, windowsDownloadUrl } from "../../version";
import { skDateTime } from "../format";
import { cardDef, resolveLayout } from "../calcLayout";

interface Props {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  /** nahradí všetky dáta a uloží ich; true = zápis potvrdený */
  onReplaceData: (d: AppData) => Promise<boolean>;
}

const RESULT_LABEL = { ok: "v poriadku", chyba: "chyba", zamietnuté: "zamietnuté" } as const;

export function SettingsTab({ data, setData, onReplaceData }: Props) {
  const s = data.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setData((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const setAllow = (src: SourceId, v: boolean) => setData((d) => ({ ...d, settings: { ...d.settings, alwaysAllow: { ...d.settings.alwaysAllow, [src]: v } } }));

  const layout = resolveLayout(s.calcLayout);
  const setLayout = (l: typeof layout) => set("calcLayout", l);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= layout.length) return;
    const l = layout.slice();
    [l[i], l[j]] = [l[j], l[i]];
    setLayout(l);
  };

  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [restore, setRestore] = useState<AppData | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [upd, setUpd] = useState<{ busy: boolean; msg?: string; release?: ReleaseInfo | null; checked?: boolean }>({ busy: false });

  const backup = async () => {
    setBackupMsg(null);
    try {
      const name = `danova-kalkulacka-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
      const ok = await saveFileAs(name, makeBackup(data), "Záloha", "json");
      setBackupMsg(ok ? "Záloha uložená." : "Ukladanie zrušené.");
    } catch (e) {
      setBackupMsg(`Zálohu sa nepodarilo uložiť: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const pickRestore = async () => {
    setBackupMsg(null);
    setRestore(null);
    try {
      const f = await openFile("Záloha", ["json"]);
      if (!f) return;
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(f.bytes));
      } catch {
        throw new Error("Súbor nie je záloha Daňovej kalkulačky.");
      }
      setRestore(parseBackup(raw));
    } catch (e) {
      setBackupMsg(`Zálohu nemožno obnoviť: ${e instanceof Error ? e.message : String(e)} Súčasné dáta sa nezmenili.`);
    }
  };

  const checkUpdate = async () => {
    setUpd({ busy: true });
    try {
      const release = await checkAppUpdate(s.updateRepo);
      setUpd({ busy: false, release, checked: true });
    } catch (e) {
      setUpd({ busy: false, msg: e instanceof NetDenied ? "Prístup zamietnutý." : `Kontrola sa nepodarila: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const clearLog = () => {
    if (window.confirm("Naozaj vymazať celý log prístupov na internet?")) setData((d) => ({ ...d, netLog: [] }));
  };

  const repoUnset = s.updateRepo.includes("OWNER");
  const log = [...data.netLog].reverse();

  return (
    <main className="page wide">
      <section className="card">
        <h2>Dáta a zálohy</h2>
        <p className="note">
          Vaše dáta (výpočty, firmy, nastavenia) sú uložené {isTauri() ? "v priečinku aplikácie (AppData\\Roaming\\sk.danovakalkulacka\\data.json)" : "v úložisku prehliadača"}.
        </p>
        <div className="row">
          <button type="button" onClick={backup}>Zálohovať všetky dáta</button>
          <button type="button" className="ghost" onClick={pickRestore}>Obnoviť zo zálohy</button>
        </div>
        {backupMsg && <p className="note" role="status">{backupMsg}</p>}
        {restore && (
          <div className="box warn" role="alert" style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 8px" }}>
              Záloha obsahuje {restore.calcs.length} výpočtov a {restore.companies.length} firiem. Obnovením sa nahradia všetky súčasné dáta v appke – predtým sa automaticky uloží ich bezpečnostná kópia.
            </p>
            <div className="row">
              <button
                type="button"
                disabled={restoring}
                onClick={async () => {
                  setRestoring(true);
                  try {
                    // bezpečnostná kópia súčasných dát – bez nej sa neobnovuje
                    let where: string;
                    try {
                      where = await saveSafetyCopy(data);
                    } catch (e) {
                      setBackupMsg(`Bezpečnostnú kópiu súčasných dát sa nepodarilo uložiť (${e instanceof Error ? e.message : String(e)}). Obnova zrušená, dáta sa nezmenili.`);
                      setRestore(null);
                      return;
                    }
                    const ok = await onReplaceData(restore);
                    setRestore(null);
                    setBackupMsg(
                      ok
                        ? `Dáta boli obnovené zo zálohy. Predchádzajúce dáta sú uložené ${where}.`
                        : `Dáta sú obnovené v aplikácii, ale nepodarilo sa ich uložiť. Predchádzajúce dáta sú uložené ${where}.`,
                    );
                  } finally {
                    setRestoring(false);
                  }
                }}
              >
                Nahradiť súčasné dáta
              </button>
              <button type="button" className="ghost" onClick={() => setRestore(null)}>Zrušiť</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Internet a súkromie</h2>
        <p className="note small">Appka ide na internet len pri vyhľadaní firmy, kontrole sadzieb a kontrole novej verzie – vždy podľa nastavení nižšie. Vaše daňové výpočty sa nikam neodosielajú; server dostane len samotnú požiadavku (pri vyhľadaní firmy hľadané IČO alebo názov) a bežné sieťové údaje.</p>
        <label className="check">
          <input type="checkbox" checked={s.offline} onChange={(e) => set("offline", e.target.checked)} />
          Úplne offline – appka nikdy nejde na internet
        </label>
        <label className="check">
          <input type="checkbox" checked={s.neverAsk} disabled={s.offline} onChange={(e) => set("neverAsk", e.target.checked)} />
          Nepýtať sa – rovno ísť na internet
        </label>
        <h3>Zdroje povolené natrvalo</h3>
        {(Object.keys(SOURCE_LABELS) as SourceId[]).map((src) => (
          <label key={src} className="check">
            <input type="checkbox" checked={!!s.alwaysAllow[src]} onChange={(e) => setAllow(src, e.target.checked)} />
            {SOURCE_LABELS[src]} – vždy povoliť
          </label>
        ))}
        <h3>Kontroly pri štarte</h3>
        <label className="check">
          <input type="checkbox" checked={s.checkParamsOnStart} onChange={(e) => set("checkParamsOnStart", e.target.checked)} />
          Pri štarte skontrolovať nové sadzby
        </label>
        <label className="check">
          <input type="checkbox" checked={s.checkUpdatesOnStart} onChange={(e) => set("checkUpdatesOnStart", e.target.checked)} />
          Pri štarte skontrolovať novú verziu aplikácie
        </label>
        <p className="note small">Kontroly pri štarte sa riadia aj ostatnými povoleniami – bez povolenia sa appka spýta.</p>
      </section>

      <section className="card">
        <h2>Aktualizácia aplikácie</h2>
        <p className="note">{isTauri() ? "Nainštalovaná verzia" : "Verzia"}: {APP_VERSION}</p>
        {!isTauri() && (
          <p>
            <a className="download-btn" href={windowsDownloadUrl()}>⬇ Stiahnuť aplikáciu pre Windows</a>{" "}
            <span className="note small">Po spustení súboru môže Windows ukázať „Systém Windows ochránil váš počítač“ – kliknite na „Ďalšie informácie“ → „Spustiť aj tak“.</span>
          </p>
        )}
        <div className="row">
          <button type="button" onClick={checkUpdate} disabled={repoUnset || upd.busy}>{upd.busy ? "Kontrolujem…" : "Skontrolovať novú verziu"}</button>
        </div>
        {repoUnset && <p className="note small warn-text">Repozitár aplikácie ešte nie je nastavený (Nastavenia → Pokročilé a diagnostika).</p>}
        {upd.msg && <p className="note warn-text" role="alert">{upd.msg}</p>}
        {upd.checked &&
          (upd.release && isNewerVersion(upd.release.version, APP_VERSION) ? (
            <p role="status">
              Je dostupná nová verzia <strong>{upd.release.version}</strong>.{" "}
              <a href={upd.release.downloadUrl ?? upd.release.url} target="_blank" rel="noreferrer">Stiahnuť</a>
            </p>
          ) : (
            <p role="status">Používate najnovšiu verziu.</p>
          ))}
      </section>
      <section className="card">
        <h2>Karty na záložke Výpočet</h2>
        <p className="note small">Zvoľte, ktoré karty sa zobrazia v pravom stĺpci záložky Výpočet, a ich poradie.</p>
        <ul className="layout-list">
          {layout.map((l, i) => {
            const name = cardDef(l.id)?.title ?? l.id;
            return (
              <li key={l.id} className="layout-row">
                <label className="check">
                  <input type="checkbox" checked={l.visible} onChange={(e) => setLayout(layout.map((x) => (x.id === l.id ? { ...x, visible: e.target.checked } : x)))} />
                  {name}
                </label>
                <span className="row">
                  <button type="button" className="ghost icon" aria-label={`Posunúť vyššie – ${name}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="ghost icon" aria-label={`Posunúť nižšie – ${name}`} disabled={i === layout.length - 1} onClick={() => move(i, 1)}>↓</button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="row">
          <button type="button" className="ghost" onClick={() => set("calcLayout", undefined)}>Obnoviť predvolené</button>
        </div>
      </section>

      <section className="card">
        <details className="advanced">
          <summary><h2>Pokročilé a diagnostika</h2></summary>
          <p className="note small">Technické nastavenia – bežne ich netreba meniť.</p>
        <div className="field">
          <label htmlFor="params-url">Adresa súboru so sadzbami</label>
          <input id="params-url" type="text" value={s.paramsUrl} onChange={(e) => set("paramsUrl", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="update-repo">Repozitár aplikácie na GitHube (vlastník/repozitár)</label>
          <input id="update-repo" type="text" value={s.updateRepo} onChange={(e) => set("updateRepo", e.target.value)} />
        </div>

        <h3>Log prístupov na internet</h3>
        <p className="note small">Log môže obsahovať hľadané IČO alebo názov firmy a je súčasťou zálohy.</p>
        {log.length === 0 ? (
          <p className="note">Appka zatiaľ nešla na internet.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="months netlog">
                <thead>
                  <tr>
                    <th scope="col">Dátum a čas</th>
                    <th scope="col">Zdroj</th>
                    <th scope="col">Adresa</th>
                    <th scope="col">Čo sa odoslalo</th>
                    <th scope="col">Výsledok</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e, i) => (
                    <tr key={`${e.at}-${i}`}>
                      <td>{skDateTime(e.at)}</td>
                      <td style={{ whiteSpace: "normal" }}>{SOURCE_LABELS[e.source] ?? e.source}</td>
                      <td className="mono wrap" style={{ whiteSpace: "normal" }}>{e.url}</td>
                      <td style={{ whiteSpace: "normal" }}>{e.sent}</td>
                      <td>{RESULT_LABEL[e.result] ?? e.result}</td>
                      <td style={{ whiteSpace: "normal" }}>{e.detail ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="danger-btn" onClick={clearLog}>Vymazať log</button>
            </div>
          </>
        )}
        </details>
      </section>
    </main>
  );
}
