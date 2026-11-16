import { openExternal } from "./net/open";
import { ProfileTitle } from "./ui/ProfileSwitch";
import { effectiveParams, paramsDateFor } from "./params/merge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate, defaultInput } from "./engine/calc";
import type { CalcInput } from "./engine/types";
import { setNetContext, type Decision, type NetRequest } from "./net/net";
import { createAskQueue } from "./net/askQueue";
import { PARAMS } from "./params/data";
import { isTauri, loadData, makeBackup, resolveCorrupt, saveData, saveDataSyncWeb, saveFileAs, type AppData, type Company, type LoadResult, type SavedCalc } from "./store/storage";
import { RecoveryScreen } from "./ui/RecoveryScreen";
import { FEEDBACK_EVENT, FeedbackDialog, requestFeedback, type FeedbackRequest } from "./feedback/FeedbackDialog";
import { newDraft, osName } from "./feedback/report";
import { PROFILES } from "./ui/ProfileSwitch";
import { fetchParamsUpdate, checkAppUpdate, type ParamsUpdate, type ReleaseInfo } from "./net/sources";
import { diffYears } from "./params/flatten";
import { PermissionDialog } from "./ui/PermissionDialog";
import { PrintReport } from "./ui/PrintReport";
import { QuickTab } from "./ui/tabs/QuickTab";
import { CalcTab } from "./ui/tabs/CalcTab";
import { HistoryTab } from "./ui/tabs/HistoryTab";
import { HowTab } from "./ui/tabs/HowTab";
import { RatesTab } from "./ui/tabs/RatesTab";
import { AdvisorTab } from "./ui/tabs/AdvisorTab";
import { SettingsTab } from "./ui/tabs/SettingsTab";
import { APP_VERSION, isNewerVersion } from "./version";

const TABS = ["Rýchly výpočet", "Výpočet", "História", "Sadzby", "Poradca", "Nastavenia", "Ako sa to počíta"] as const;
type Tab = (typeof TABS)[number];

const years = Object.keys(PARAMS).map(Number);
const MIN_YEAR = Math.min(...years);
const MAX_YEAR = Math.max(...years);
const startYear = () => Math.min(MAX_YEAR, Math.max(MIN_YEAR, new Date().getFullYear()));


export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("Rýchly výpočet");
  // úzke okno: záložky v rozbaľovacom menu ☰
  const [menuOpen, setMenuOpen] = useState(false);
  const [ico, setIcoState] = useState("");
  const [currentCalcId, setCurrentCalcId] = useState<string | null>(null);
  const [paramsUpdate, setParamsUpdate] = useState<ParamsUpdate | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [appRelease, setAppRelease] = useState<ReleaseInfo | null>(null);
  const startupRef = useRef(false);
  // otázky na povolenie internetu idú cez front – zobrazí sa vždy jedna
  const [pendingReq, setPendingReq] = useState<NetRequest | null>(null);
  const askQueue = useMemo(() => createAskQueue(setPendingReq), []);
  const dataRef = useRef<AppData | null>(null);
  const loadedRef = useRef(false);
  // ochrana dát: poškodené dáta → obrazovka obnovy; stav zápisu
  const [corrupt, setCorrupt] = useState<Extract<LoadResult, { status: "corrupt" }> | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // spätná väzba: otvorené okno + chyba, z ktorej sa otvorilo
  const [feedback, setFeedback] = useState<FeedbackRequest | null>(null);
  const timerRef = useRef<number | null>(null);
  /** dáta sa zmenili a ešte nie sú potvrdene zapísané */
  const dirtyRef = useRef(false);
  /** posledné dáta odoslané na zápis (aby sa neukladali dvakrát) */
  const lastSavedRef = useRef<AppData | null>(null);

  // desktop: odkazy na web (target=_blank) otvoriť v predvolenom prehliadači, nie vo vnútri appky
  useEffect(() => {
    if (!isTauri()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !/^https?:/i.test(a.href)) return;
      e.preventDefault();
      void openExternal(a.href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    loadData().then((r) => {
      if (r.status === "corrupt") {
        setCorrupt(r);
        return;
      }
      dataRef.current = r.data;
      setIcoState(r.data.lastIco ?? "");
      setData(r.data);
    });
  }, []);

  // aktuálne dáta pre sieťovú vrstvu
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // sieťová vrstva – nastaví sa raz po načítaní
  const ready = data !== null;
  useEffect(() => {
    if (!ready) return;
    setNetContext({
      getSettings: () => dataRef.current!.settings,
      ask: askQueue.ask,
      onAlwaysAllow: (source) =>
        setData((d) => (d ? { ...d, settings: { ...d.settings, alwaysAllow: { ...d.settings.alwaysAllow, [source]: true } } } : d)),
      log: (entry) => setData((d) => (d ? { ...d, netLog: [...d.netLog, entry].slice(-500) } : d)),
    });
  }, [ready]);

  /** Zapíše dáta hneď; vráti true až po potvrdenom zápise. Chyba sa ukáže v pruhu hore. */
  const persist = useCallback(async (d: AppData): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastSavedRef.current = d;
    dirtyRef.current = true;
    try {
      await saveData(d);
      if (dataRef.current === d) dirtyRef.current = false;
      setSaveErr(null);
      return true;
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  // ukladanie s oneskorením
  useEffect(() => {
    if (!data) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      lastSavedRef.current = data;
      return;
    }
    if (data === lastSavedRef.current) return;
    dirtyRef.current = true;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void persist(data);
    }, 500);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [data, persist]);

  // „Nahlásiť tento problém“ odkiaľkoľvek v appke
  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent<FeedbackRequest>).detail ?? {};
      setData((d) => {
        if (!d) return d;
        // rozpísaný koncept sa nezahodí; nový sa založí len keď žiadny nie je
        const draft = d.feedbackDraft && d.feedbackDraft.what.trim() !== "" ? d.feedbackDraft : newDraft(r.kind ?? "problem", r.origin);
        return { ...d, feedbackDraft: draft };
      });
      setFeedback(r);
    };
    window.addEventListener(FEEDBACK_EVENT, on);
    return () => window.removeEventListener(FEEDBACK_EVENT, on);
  }, []);

  // pri zatváraní neprísť o posledné zmeny
  useEffect(() => {
    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      let disposed = false;
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const f = await getCurrentWindow().onCloseRequested(async (ev) => {
          const d = dataRef.current;
          if (!d || !dirtyRef.current) return; // nič neuložené → zavrie sa
          if (await persist(d)) return;
          const { ask } = await import("@tauri-apps/plugin-dialog");
          const close = await ask("Posledné zmeny sa nepodarilo uložiť. Zavrieť aplikáciu aj tak? Neuložené zmeny sa stratia.", {
            title: "Daňová kalkulačka",
            kind: "warning",
            okLabel: "Zavrieť",
            cancelLabel: "Nezatvárať",
          });
          if (!close) ev.preventDefault();
        });
        if (disposed) f();
        else unlisten = f;
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    }
    const flush = () => {
      if (timerRef.current === null || !dataRef.current) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      lastSavedRef.current = dataRef.current;
      if (saveDataSyncWeb(dataRef.current)) dirtyRef.current = false;
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      if (dirtyRef.current) e.preventDefault(); // prehliadač sa opýta, či odísť
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [persist]);

  // jednorazové kontroly po načítaní (podľa nastavení; sieťová vrstva sa pýta na povolenie)
  useEffect(() => {
    if (!ready || startupRef.current) return;
    startupRef.current = true;
    const st = dataRef.current!.settings;
    if (st.checkParamsOnStart && !st.paramsUrl.includes("OWNER")) {
      fetchParamsUpdate(st.paramsUrl)
        .then((u) => {
          const merged = effectiveParams(dataRef.current!.acceptedParams, dataRef.current!.acceptedParamsDate);
          if (diffYears(merged, u.years).length > 0) setParamsUpdate(u);
        })
        .catch(() => undefined);
    }
    // kontrola novej verzie má zmysel len v desktopovej appke (web je vždy aktuálny)
    if (isTauri() && st.checkUpdatesOnStart && !st.updateRepo.includes("OWNER")) {
      checkAppUpdate(st.updateRepo)
        .then((r) => {
          if (r && isNewerVersion(r.version, APP_VERSION)) setAppRelease(r);
        })
        .catch(() => undefined);
    }
  }, [ready]);

  const input: CalcInput | null = useMemo(() => (data ? (data.lastInput ?? defaultInput(startYear())) : null), [data]);

  const replaceInput = useCallback((i: CalcInput) => setData((d) => (d ? { ...d, lastInput: i } : d)), []);
  const update = useCallback(
    (fn: (draft: CalcInput) => void) =>
      setData((d) => {
        if (!d) return d;
        const draft = structuredClone(d.lastInput ?? defaultInput(startYear()));
        fn(draft);
        return { ...d, lastInput: draft };
      }),
    [],
  );

  const setIco = useCallback((v: string) => {
    setIcoState(v);
    setData((d) => (d ? { ...d, lastIco: v } : d));
  }, []);

  const onFound = useCallback((c: Company) => {
    setData((d) => (d ? { ...d, companies: [...d.companies.filter((x) => x.ico !== c.ico), c] } : d));
  }, []);

  const params = useMemo(() => (data ? effectiveParams(data.acceptedParams, data.acceptedParamsDate) : PARAMS), [data]);

  const calc = useMemo(() => {
    if (!input) return null;
    try {
      return { result: calculate(input, params), error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, params]);

  const currentCalc = data?.calcs.find((c) => c.id === currentCalcId) ?? null;

  const company = data?.companies.find((c) => c.ico === ico) ?? null;
  const nickname = data?.lastNickname ?? "";
  const setNickname = (v: string) => setData((d) => (d ? { ...d, lastNickname: v } : d));
  const displayName = nickname.trim() || company?.name || "Bez mena";

  const saveCalc = (title: string, asNew: boolean): Promise<boolean> => {
    if (!data || !input || !calc?.result) return Promise.resolve(false);
    const r = calc.result.summary;
    const now = new Date().toISOString();
    const base = {
      ico,
      companyName: displayName,
      nickname: nickname.trim() || undefined,
      year: input.year,
      input: structuredClone(input),
      summary: { income: r.income, tax: r.tax, taxToPay: r.taxToPay, sp: r.sp, zp: r.zp, net: r.net },
      // sadzby, s ktorými sa výpočet urobil (História ukáže, ak sa odvtedy zmenili)
      params: params[input.year] ? structuredClone(params[input.year]) : undefined,
      paramsNext: params[input.year + 1] ? structuredClone(params[input.year + 1]) : undefined,
      appVersion: APP_VERSION,
      paramsDate: paramsDateFor(input.year, data.acceptedParams, data.acceptedParamsDate),
      updatedAt: now,
    };
    let next: AppData;
    if (!asNew && currentCalc) {
      next = { ...data, calcs: data.calcs.map((c) => (c.id === currentCalc.id ? { ...c, ...base, title } : c)) };
    } else {
      const id = crypto.randomUUID();
      const saved: SavedCalc = { id, title, createdAt: now, ...base };
      next = { ...data, calcs: [...data.calcs, saved] };
      setCurrentCalcId(id);
    }
    // uložiť hneď – „Uložené“ sa ukáže až po potvrdenom zápise
    setData(next);
    return persist(next);
  };

  const openCalc = (c: SavedCalc) => {
    setData((d) => (d ? { ...d, lastInput: structuredClone(c.input), lastIco: c.ico, lastNickname: c.nickname ?? "" } : d));
    setIcoState(c.ico);
    setCurrentCalcId(c.id);
    setTab("Výpočet");
  };

  const loadInput = (i: CalcInput, newIco?: string) => {
    setData((d) => (d ? { ...d, lastInput: i, ...(newIco ? { lastIco: newIco } : {}) } : d));
    if (newIco) setIcoState(newIco);
    setCurrentCalcId(null);
  };

  const replaceAllData = (d: AppData): Promise<boolean> => {
    setData(d);
    setIcoState(d.lastIco ?? "");
    setCurrentCalcId(null);
    return persist(d);
  };

  if (corrupt)
    return (
      <RecoveryScreen
        info={corrupt}
        onResolve={async (d) => {
          await resolveCorrupt(corrupt.raw);
          setCorrupt(null);
          dataRef.current = d;
          setIcoState(d.lastIco ?? "");
          setData(d);
          await persist(d);
        }}
      />
    );

  if (!data || !input || !calc) return <div className="loading">Načítavam…</div>;

  const backupNow = async () => {
    try {
      await saveFileAs(`danova-kalkulacka-zaloha-${new Date().toISOString().slice(0, 10)}.json`, makeBackup(data), "Záloha", "json");
    } catch (e) {
      setSaveErr(`zálohu sa nepodarilo uložiť: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const decide = (d: Decision) => {
    askQueue.decide(d);
  };

  // profil (živnosť / zamestnanec / oboje) – spoločný pre obe záložky, určuje aj farebný akcent appky
  const profile = (tab === "Rýchly výpočet" ? data.quick?.profile : input.profile) ?? data.quick?.profile ?? input.profile ?? "szco";

  return (
    <div className="app" data-profile={profile}>
      <header className="app-header">
        <ProfileTitle
          value={profile}
          onChange={(p) =>
            setData((d) =>
              d
                ? {
                    ...d,
                    quick: { ...(d.quick ?? { year: startYear(), income: 0, expenses: null }), profile: p },
                    lastInput: { ...(d.lastInput ?? defaultInput(startYear())), profile: p },
                  }
                : d,
            )
          }
        />
        <button type="button" className="link-btn feedback-link" onClick={() => requestFeedback()}>
          {data.feedbackDraft?.what.trim() ? "Rozpísané hlásenie" : "Nahlásiť problém / návrh"}
        </button>
        <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="main-tabs" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="menu-icon" aria-hidden="true">☰</span>
          {tab}
        </button>
        <nav id="main-tabs" className={`tabs${menuOpen ? " open" : ""}`} role="tablist" aria-label="Sekcie">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => {
                setTab(t);
                setMenuOpen(false);
              }}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {paramsUpdate && !bannerDismissed && diffYears(params, paramsUpdate.years).length > 0 && (
        <div className="banner" role="status">
          <span>Sú dostupné nové sadzby – pozrite záložku Sadzby.</span>
          <button type="button" className="link-btn" onClick={() => setTab("Sadzby")}>Otvoriť</button>
          <button type="button" className="icon ghost" onClick={() => setBannerDismissed(true)} aria-label="Zavrieť oznámenie">×</button>
        </div>
      )}
      {saveErr && (
        <div className="banner error" role="alert">
          <span>
            <strong>Zmeny sa nepodarilo uložiť</strong> ({saveErr}). Zatiaľ sú len v otvorenom okne – skúste to znova alebo si dáta zálohujte do súboru.
          </span>
          <button type="button" onClick={() => void persist(dataRef.current ?? data)}>Skúsiť znova</button>
          <button type="button" className="ghost" onClick={() => void backupNow()}>Zálohovať do súboru</button>
          <button type="button" className="link-btn" onClick={() => requestFeedback({ kind: "data", origin: "Chyba uloženia", error: saveErr })}>Nahlásiť tento problém</button>
        </div>
      )}
      {appRelease && (
        <div className="banner" role="status">
          <span>
            Je k dispozícii nová verzia <strong>{appRelease.version}</strong> (máte {APP_VERSION}). Stiahnite ju a spustite – nainštaluje sa cez starú, výpočty zostanú.
          </span>
          <button type="button" onClick={() => void openExternal(appRelease.downloadUrl ?? appRelease.url)}>Stiahnuť</button>
          <button type="button" className="icon ghost" onClick={() => setAppRelease(null)} aria-label="Zavrieť oznámenie">×</button>
        </div>
      )}

      {tab === "Rýchly výpočet" && (
        <QuickTab
          quick={data.quick ?? { year: startYear(), income: 0, expenses: null }}
          onQuick={(q) => setData((d) => (d ? { ...d, quick: q } : d))}
          params={params}
          years={Object.keys(params).map(Number).sort((a, b) => a - b)}
          onDetailed={(i) => {
            setData((d) => (d ? { ...d, lastInput: i } : d));
            setCurrentCalcId(null);
            setTab("Výpočet");
          }}
          lastInput={data.lastInput}
          onOpenDetailed={() => setTab("Výpočet")}
        />
      )}
      {tab === "Výpočet" && (
        <CalcTab
          input={input}
          update={update}
          replaceInput={replaceInput}
          nickname={nickname}
          onNickname={setNickname}
          calcLayout={data.settings.calcLayout}
          ico={ico}
          onIco={setIco}
          company={company}
          onFound={onFound}
          calc={calc}
          currentCalc={currentCalc}
          onSave={saveCalc}
          companyName={displayName}
          onLoadInput={loadInput}
          params={params}
          bankRules={data.bankRules ?? []}
          onBankRules={(r) => setData((d) => (d ? { ...d, bankRules: r } : d))}
        />
      )}
      {tab === "História" && <HistoryTab data={data} setData={(fn) => setData((d) => (d ? fn(d) : d))} params={params} onOpen={openCalc} />}
      {tab === "Sadzby" && (
        <RatesTab data={data} setData={(fn) => setData((d) => (d ? fn(d) : d))} params={params} defaultYear={input.year} update={paramsUpdate} setUpdate={setParamsUpdate} />
      )}
      {tab === "Poradca" && (
        <AdvisorTab data={data} setData={(fn) => setData((d) => (d ? fn(d) : d))} input={input} result={calc.result} error={calc.error} params={params} />
      )}
      {tab === "Nastavenia" && <SettingsTab data={data} setData={(fn) => setData((d) => (d ? fn(d) : d))} onReplaceData={replaceAllData} />}
      {tab === "Ako sa to počíta" && <HowTab year={input.year} params={params} />}

      <PrintReport result={calc.result} input={input} title={currentCalc?.title ?? `Výpočet ${input.year}`} companyName={displayName} ico={ico} />

      {feedback && data.feedbackDraft && (
        <FeedbackDialog
          draft={data.feedbackDraft}
          context={{
            appVersion: APP_VERSION,
            platform: isTauri() ? "desktop" : "web",
            os: osName(navigator.userAgent),
            tab,
            year: tab === "Rýchly výpočet" ? (data.quick?.year ?? input.year) : input.year,
            profile: PROFILES.find((p) => p.id === profile)?.label ?? profile,
            paramsDate: paramsDateFor(input.year, data.acceptedParams, data.acceptedParamsDate),
            error: feedback.error,
          }}
          onDraft={(fd) => setData((d) => (d ? { ...d, feedbackDraft: fd } : d))}
          onDone={() => {
            setData((d) => (d ? { ...d, feedbackDraft: undefined } : d));
            setFeedback(null);
          }}
          onClose={() => setFeedback(null)}
        />
      )}
      {pendingReq && <PermissionDialog key={`${pendingReq.source}|${pendingReq.url}`} req={pendingReq} onDecide={decide} />}
    </div>
  );
}
