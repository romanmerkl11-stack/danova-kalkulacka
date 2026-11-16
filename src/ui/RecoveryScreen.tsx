import { useState } from "react";
import { emptyData, isTauri, openFile, parseBackup, saveFileAs, type AppData, type LoadResult } from "../store/storage";

interface Props {
  info: Extract<LoadResult, { status: "corrupt" }>;
  /** pokračovať s vybranými dátami (poškodený obsah sa predtým odloží ako kópia) */
  onResolve: (d: AppData) => Promise<void>;
}

const counts = (d: AppData) => `${d.calcs.length} výpočtov, ${d.companies.length} firiem`;
const today = () => new Date().toISOString().slice(0, 10);

/** Uložené dáta sa nedali načítať – nič sa neprepíše, kým používateľ nerozhodne. */
export function RecoveryScreen({ info, onResolve }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportRaw = () =>
    run(async () => {
      const ok = await saveFileAs(`danova-kalkulacka-poskodene-${today()}.json`, info.raw, "Dáta", "json");
      setMsg(ok ? "Poškodené dáta sú uložené do súboru." : "Ukladanie zrušené.");
    });

  const fromBackup = () =>
    run(async () => {
      const f = await openFile("Záloha", ["json"]);
      if (!f) return;
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(f.bytes));
      } catch {
        throw new Error("Súbor nie je záloha Daňovej kalkulačky.");
      }
      await onResolve(parseBackup(raw));
    });

  const where = isTauri() ? "v priečinku aplikácie ako data.poskodene-….json" : "v úložisku prehliadača";

  return (
    <div className="recovery">
      <section className="card">
        <h2>Uložené dáta sa nepodarilo načítať</h2>
        <div className="box danger" role="alert">
          <p style={{ margin: 0 }}>{info.error}</p>
        </div>
        <p>
          Pôvodné dáta sme <strong>nezmenili ani neprepísali</strong>. Kým nevyberiete, ako pokračovať, aplikácia nič neukladá.
        </p>

        <div className="row">
          {info.raw.trim() !== "" && (
            <button type="button" className="ghost" disabled={busy} onClick={exportRaw}>Uložiť poškodené dáta do súboru</button>
          )}
          {info.bak && (
            <button type="button" disabled={busy} onClick={() => run(() => onResolve(info.bak!))}>
              Obnoviť automatickú kópiu ({counts(info.bak)})
            </button>
          )}
          <button type="button" className={info.bak ? "ghost" : undefined} disabled={busy} onClick={fromBackup}>Obnoviť zo zálohy…</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setConfirmEmpty(true)}>Začať s prázdnymi dátami</button>
        </div>
        {info.bak && <p className="note">Automatická kópia je posledná verzia dát, ktorá sa dala načítať (pred posledným uložením).</p>}

        {confirmEmpty && (
          <div className="box warn" role="alert" style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 8px" }}>
              Aplikácia začne bez výpočtov a firiem. Poškodené dáta sa predtým odložia {where}, aby sa dali neskôr poslať na opravu.
            </p>
            <div className="row">
              <button type="button" disabled={busy} onClick={() => run(() => onResolve(emptyData()))}>Začať s prázdnymi dátami</button>
              <button type="button" className="ghost" onClick={() => setConfirmEmpty(false)}>Zrušiť</button>
            </div>
          </div>
        )}
        {msg && <p className="note" role="status">{msg}</p>}
      </section>
    </div>
  );
}
