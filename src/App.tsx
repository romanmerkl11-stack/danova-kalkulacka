import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate, defaultInput } from "./engine/calc";
import type { CalcInput } from "./engine/types";
import { setNetContext, type Decision, type NetRequest } from "./net/net";
import { PARAMS } from "./params/data";
import { loadData, saveData, type AppData, type Company, type SavedCalc } from "./store/storage";
import { fetchParamsUpdate, checkAppUpdate, type ParamsUpdate, type ReleaseInfo } from "./net/sources";
import { diffYears } from "./params/flatten";
import { PermissionDialog } from "./ui/PermissionDialog";
import { PrintReport } from "./ui/PrintReport";
import { QuickTab } from "./ui/tabs/QuickTab";
import { CalcTab } from "./ui/tabs/CalcTab";
import { HistoryTab } from "./ui/tabs/HistoryTab";
import { HowTab } from "./ui/tabs/HowTab";
import { RatesTab } from "./ui/tabs/RatesTab";
import { SettingsTab } from "./ui/tabs/SettingsTab";
import { APP_VERSION, isNewerVersion } from "./version";

const TABS = ["Rýchly výpočet", "Výpočet", "História", "Sadzby", "Nastavenia", "Ako sa to počíta"] as const;
type Tab = (typeof TABS)[number];

const years = Object.keys(PARAMS).map(Number);
const MIN_YEAR = Math.min(...years);
const MAX_YEAR = Math.max(...years);
const startYear = () => Math.min(MAX_YEAR, Math.max(MIN_YEAR, new Date().getFullYear()));

interface Pending {
  req: NetRequest;
  resolve: (d: Decision) => void;
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("Rýchly výpočet");
  const [ico, setIcoState] = useState("");
  const [currentCalcId, setCurrentCalcId] = useState<string | null>(null);
  const [paramsUpdate, setParamsUpdate] = useState<ParamsUpdate | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [appRelease, setAppRelease] = useState<ReleaseInfo | null>(null);
  const startupRef = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const dataRef = useRef<AppData | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadData().then((d) => {
      dataRef.current = d;
      setIcoState(d.lastIco ?? "");
      setData(d);
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
      ask: (req) => new Promise<Decision>((resolve) => setPending({ req, resolve })),
      onAlwaysAllow: (source) =>
        setData((d) => (d ? { ...d, settings: { ...d.settings, alwaysAllow: { ...d.settings.alwaysAllow, [source]: true } } } : d)),
      log: (entry) => setData((d) => (d ? { ...d, netLog: [...d.netLog, entry].slice(-500) } : d)),
    });
  }, [ready]);

  // ukladanie s oneskorením
  useEffect(() => {
    if (!data) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    const t = window.setTimeout(() => void saveData(data), 500);
    return () => window.clearTimeout(t);
  }, [data]);

  // jednorazové kontroly po načítaní (podľa nastavení; sieťová vrstva sa pýta na povolenie)
  useEffect(() => {
    if (!ready || startupRef.current) return;
    startupRef.current = true;
    const st = dataRef.current!.settings;
    if (st.checkParamsOnStart && !st.paramsUrl.includes("OWNER")) {
      fetchParamsUpdate(st.paramsUrl)
        .then((u) => {
          const merged = { ...PARAMS, ...dataRef.current!.acceptedParams };
          if (diffYears(merged, u.years).length > 0) setParamsUpdate(u);
        })
        .catch(() => undefined);
    }
    if (st.checkUpdatesOnStart && !st.updateRepo.includes("OWNER")) {
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

  const params = useMemo(() => (data ? { ...PARAMS, ...data.acceptedParams } : PARAMS), [data]);

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

  const saveCalc = (title: string, asNew: boolean) => {
    if (!input || !calc?.result) return;
    const r = calc.result.summary;
    const now = new Date().toISOString();
    const base = {
      ico,
      companyName: displayName,
      nickname: nickname.trim() || undefined,
      year: input.year,
      input: structuredClone(input),
      summary: { income: r.income, tax: r.tax, taxToPay: r.taxToPay, sp: r.sp, zp: r.zp, net: r.net },
      updatedAt: now,
    };
    if (!asNew && currentCalc) {
      setData((d) => (d ? { ...d, calcs: d.calcs.map((c) => (c.id === currentCalc.id ? { ...c, ...base, title } : c)) } : d));
    } else {
      const id = crypto.randomUUID();
      const saved: SavedCalc = { id, title, createdAt: now, ...base };
      setData((d) => (d ? { ...d, calcs: [...d.calcs, saved] } : d));
      setCurrentCalcId(id);
    }
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

  const replaceAllData = (d: AppData) => {
    setData(d);
    setIcoState(d.lastIco ?? "");
    setCurrentCalcId(null);
  };

  if (!data || !input || !calc) return <div className="loading">Načítavam…</div>;

  const decide = (d: Decision) => {
    pending?.resolve(d);
    setPending(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Daňová kalkulačka SZČO</h1>
        <nav className="tabs" role="tablist" aria-label="Sekcie">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
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
      {appRelease && (
        <div className="banner" role="status">
          <span>Je dostupná nová verzia aplikácie {appRelease.version}.</span>
          <a href={appRelease.url} target="_blank" rel="noreferrer">Stiahnuť</a>
          <button type="button" className="icon ghost" onClick={() => setAppRelease(null)} aria-label="Zavrieť oznámenie">×</button>
        </div>
      )}

      {tab === "Rýchly výpočet" && (
        <QuickTab
          quick={data.quick ?? { year: startYear(), income: 0, expenses: null }}
          onQuick={(q) => setData((d) => (d ? { ...d, quick: q } : d))}
          params={params}
          years={years.slice().sort((a, b) => a - b)}
          onDetailed={(i) => {
            setData((d) => (d ? { ...d, lastInput: i } : d));
            setCurrentCalcId(null);
            setTab("Výpočet");
          }}
          lastInput={data.lastInput}
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
      {tab === "Nastavenia" && <SettingsTab data={data} setData={(fn) => setData((d) => (d ? fn(d) : d))} onReplaceData={replaceAllData} />}
      {tab === "Ako sa to počíta" && <HowTab year={input.year} params={params} />}

      <PrintReport result={calc.result} input={input} title={currentCalc?.title ?? `Výpočet ${input.year}`} companyName={displayName} ico={ico} />

      {pending && <PermissionDialog req={pending.req} onDecide={decide} />}
    </div>
  );
}
