import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculate, defaultInput } from "./engine/calc";
import type { CalcInput } from "./engine/types";
import { setNetContext, type Decision, type NetRequest } from "./net/net";
import { PARAMS } from "./params/data";
import { loadData, saveData, type AppData, type Company } from "./store/storage";
import { InputsPanel } from "./ui/InputsPanel";
import { LimitsPanel } from "./ui/LimitsPanel";
import { MonthsTable } from "./ui/MonthsTable";
import { NextYearPanel } from "./ui/NextYearPanel";
import { PermissionDialog } from "./ui/PermissionDialog";
import { StepsList } from "./ui/StepsList";
import { SummaryPanel } from "./ui/SummaryPanel";

const TABS = ["Výpočet", "História", "Sadzby", "Nastavenia", "Ako sa to počíta"] as const;
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
  const [tab, setTab] = useState<Tab>("Výpočet");
  const [ico, setIco] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const dataRef = useRef<AppData | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadData().then((d) => {
      dataRef.current = d;
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

  if (!data || !input || !calc) return <div className="loading">Načítavam…</div>;

  const company = data.companies.find((c) => c.ico === ico) ?? null;
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

      {tab !== "Výpočet" ? (
        <main className="page">
          <section className="card">
            <h2>{tab}</h2>
            <p>Pripravuje sa.</p>
          </section>
        </main>
      ) : (
        <main className="layout">
          <InputsPanel input={input} update={update} replaceInput={replaceInput} ico={ico} onIco={setIco} company={company} onFound={onFound} />
          <div className="results">
            {calc.error || !calc.result ? (
              <div className="box danger" role="alert">
                Výpočet sa nepodarilo dokončiť: {calc.error}
              </div>
            ) : (
              <>
                <SummaryPanel result={calc.result} />
                <LimitsPanel result={calc.result} />
                <MonthsTable input={input} result={calc.result} update={update} />
                <StepsList result={calc.result} input={input} update={update} />
                <NextYearPanel result={calc.result} />
              </>
            )}
          </div>
        </main>
      )}

      {pending && <PermissionDialog req={pending.req} onDecide={decide} />}
    </div>
  );
}
