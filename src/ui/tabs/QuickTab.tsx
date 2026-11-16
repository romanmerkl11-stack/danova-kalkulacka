import { ResultNotices } from "../ResultNotices";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { calculate } from "../../engine/calc";
import { eur, pct } from "../../engine/money";
import type { CalcInput, CalcResult } from "../../engine/types";
import type { ParamSet } from "../../params/types";
import type { AppData } from "../../store/storage";
import { NumberInput } from "../NumberInput";
import { formatSkNumber } from "../format";
import { StepsList } from "../StepsList";
import { AssignNotice } from "../AssignNotice";
import { filingHeadline } from "../FilingPanel";
import { staircase } from "../quick";
import { buildQuickInput, contributionLimits, contributionThresholds, incomeLimits, taxStartThreshold, SLIDER_STEP, sliderMax, toDetailedInput, transferReport, type TransferReport, withoutOwnContributions, type QuickState } from "../quick";

interface Props {
  quick: NonNullable<AppData["quick"]>;
  onQuick: (q: QuickState) => void;
  params: ParamSet;
  years: number[];
  lastInput: CalcInput | undefined;
  onDetailed: (i: CalcInput) => void;
  /** prejsť na Výpočet bez zmeny údajov */
  onOpenDetailed: () => void;
}

const REGIME = { standard: "", mikro: "mikroodvod", none: "nie ste povinne poistený", unknown: "" } as const;

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={`stat ${tone ?? ""}`}>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export function QuickTab({ quick, onQuick, params, years, lastInput, onDetailed, onOpenDetailed }: Props) {
  const [transfer, setTransfer] = useState<TransferReport | null>(null);
  // plynulé ťahanie slidera: výpočet beží s oneskorenou hodnotou
  const dq = useDeferredValue(quick);

  // šírka posuvníka v px – na rozostúpenie šikmých popiskov limitov
  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderW, setSliderW] = useState(0);
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSliderW(el.clientWidth));
    ro.observe(el);
    setSliderW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const calc = useMemo(() => {
    try {
      const auto = calculate(buildQuickInput(dq, false), params);
      const result: CalcResult = dq.expenses === null ? auto : calculate(buildQuickInput(dq, true), params);
      const own = dq.spH1 != null || dq.spH2 != null || dq.zp != null;
      const base = own ? calculate(buildQuickInput(withoutOwnContributions(dq), false), params) : auto;
      return { auto, result, base, error: null as string | null };
    } catch (e) {
      return { auto: null, result: null, base: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [dq, params]);

  // hranice „odvody nad minimum“ nezávisia od príjmu → prepočet len pri zmene roka, výdavkov či odvodov
  const thresholds = useMemo(
    () => [...taxStartThreshold({ ...dq, income: 0 }, params), ...(dq.profile === "zamestnanec" ? [] : contributionThresholds({ ...dq, income: 0 }, params))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dq.year, dq.expenses, dq.spH1, dq.spH2, dq.zp, dq.profile, dq.empGross, dq.empInsurance, dq.empWithheld, dq.rentMonthly, dq.rentMonths, dq.rentExpenses, params],
  );

  const set = (patch: Partial<QuickState>) => onQuick({ ...quick, ...patch });

  const { auto, result, base } = calc;
  if (!auto || !result || !base) {
    return (
      <main className="quick">
        <div className="box danger" role="alert">Výpočet sa nepodarilo dokončiť: {calc.error}</div>
      </main>
    );
  }

  const autoExpenses = auto.stepById["vydavky"]?.value ?? 0;
  // automatické mesačné odvody (bez mojich zadaných súm) – platby za marec a september roka
  const monthAmount = (kind: "sp" | "zp", m: number) => base.months.find((r) => r.covers === `${m}/${base.year}`)?.[kind] ?? 0;
  const money = (v: number) => v.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const contribFields: { key: "spH1" | "spH2" | "zp"; label: string; auto: number }[] = [
    { key: "spH1", label: "SP jan – jún", auto: monthAmount("sp", 3) },
    { key: "spH2", label: "SP júl – dec", auto: monthAmount("sp", 9) },
    { key: "zp", label: "ZP", auto: monthAmount("zp", 3) },
  ];
  const ownContrib = contribFields.some((f) => quick[f.key] != null);
  const max = sliderMax(auto.limits);
  const contrib = contributionLimits(thresholds, quick.income);
  const ticks = [...incomeLimits(auto.limits), ...contrib].sort((x, y) => x.limit - y.limit);
  // schody: v hustej skupine prvý popisok najnižšie, ďalšie vyššie (šikmé texty sa tak nekrížia)
  const steps = staircase(ticks.map((l) => Math.min(1, l.limit / max) * sliderW), 70);
  const maxStep = Math.max(0, ...steps);
  const s = result.summary;
  const n = result.next;
  const refund = s.taxToPay < 0;
  // povinnosť podať DP platí takmer vždy – na rýchlej obrazovke by len rušila
  // „spMin“ z enginu je meraný na základe dane – na tejto obrazovke ho nahrádzajú hranice v príjmoch
  const exceeded = [...result.limits.filter((l) => l.exceeded && l.id !== "filing" && l.id !== "spMin"), ...contributionLimits(thresholds, result.summary.income).filter((l) => l.exceeded)];
  const income = Math.min(quick.income, max);
  const profile = quick.profile ?? "szco";
  const emp = profile === "zamestnanec";
  const both = profile === "oboje";
  const f = result.filing;

  return (
    <main className="quick">
      <div className="quick-inputs">
        <section className="card" aria-label="Príjmy">
          <div className="quick-head">
            <h2>{emp ? "Úhrn príjmov za rok" : "Príjmy za rok"}</h2>
            <select aria-label="Rok" value={quick.year} onChange={(e) => set({ year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <NumberInput className="big" ariaLabel={emp ? "Úhrn príjmov za rok" : "Príjmy za rok"} value={quick.income} onChange={(v) => set({ income: Math.max(0, v ?? 0) })} />
          <div className="slider-wrap slanted" ref={sliderRef} style={{ ["--steps" as string]: maxStep }}>
            <input
              type="range"
              min={0}
              max={max}
              step={SLIDER_STEP}
              value={income}
              aria-label="Príjmy za rok – posuvník"
              onChange={(e) => set({ income: Number(e.target.value) })}
            />
            <div className="ticks">
              {ticks.map((l, idx) => {
                const pos = (x: { limit: number }) => Math.min(1, x.limit / max);
                const step = steps[idx] ?? 0;
                const passed = quick.income > l.limit;
                return (
                  <div
                    key={l.id}
                    className={`tick${passed ? " passed" : ""}${pos(l) < 0.2 ? " tip-left" : pos(l) > 0.8 ? " tip-right" : ""}${pos(l) * sliderW + 64 > sliderW ? " label-right" : ""}`}
                    style={{ left: `${Math.min(100, pos(l) * 100)}%`, ["--step" as string]: step }}
                    tabIndex={0}
                    role="note"
                    aria-label={`${l.label}: ${eur(l.limit)}. ${l.consequence}`}
                  >
<span>{formatSkNumber(Math.round(l.limit))} €</span>
                    <div className="tick-tip" role="tooltip">
                      <strong>{l.label}</strong>
                      <div className="tick-tip-amount">
                        {eur(l.limit)} {passed ? <em className="danger-text">– prekročené o {eur(quick.income - l.limit)}</em> : <em>– zostáva {eur(l.limit - quick.income)}</em>}
                      </div>
                      <div>{l.consequence}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {emp && (
          <section className="card" aria-label="Údaje z potvrdenia a prenájom">
            <div className="quick-head"><h2>Z potvrdenia o zdaniteľnej mzde</h2></div>
            <div className="quick-contrib">
              <NumberInput label="Poistné" allowNull value={quick.empInsurance ?? null} placeholder="0,00" onChange={(v) => set({ empInsurance: v === null ? null : Math.max(0, v) })} />
              <NumberInput label="Preddavky" allowNull value={quick.empWithheld ?? null} placeholder="0,00" onChange={(v) => set({ empWithheld: v === null ? null : Math.max(0, v) })} />
            </div>
            <p className="note small">Údaje nájdete na Potvrdení od zamestnávateľa. Prázdne pole = 0 €.</p>
            <div className="quick-head quick-contrib-head"><h2>Prenájom (voliteľné)</h2></div>
            <div className="quick-contrib">
              <NumberInput label="Nájom mesačne" allowNull value={quick.rentMonthly ?? null} placeholder="0,00" onChange={(v) => set({ rentMonthly: v === null ? null : Math.max(0, v) })} />
              <NumberInput label="Mesiacov" suffix="" allowNull value={quick.rentMonths ?? 12} placeholder="12" onChange={(v) => set({ rentMonths: v === null ? null : Math.min(12, Math.max(0, Math.round(v))) })} />
              <NumberInput label="Výdavky za rok" allowNull value={quick.rentExpenses ?? null} placeholder="0,00" onChange={(v) => set({ rentExpenses: v === null ? null : Math.max(0, v) })} />
            </div>
          </section>
        )}

        {!emp && <section className="card" aria-label="Daňové výdavky">
          <div className="quick-head">
            <h2>Daňové výdavky</h2>
            {quick.expenses !== null && (
              <button type="button" className="link-btn" onClick={() => set({ expenses: null })}>Vrátiť automatiku</button>
            )}
          </div>
          <NumberInput
            className="big"
            ariaLabel="Daňové výdavky"
            allowNull
            value={quick.expenses}
            placeholder={autoExpenses.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            onChange={(v) => set({ expenses: v === null ? null : Math.max(0, v) })}
          />
          {quick.expenses !== null && <p className="note small">Vlastná suma (automaticky by bolo {eur(autoExpenses)}).</p>}

          <div className="quick-head quick-contrib-head">
            <h2>Odvody mesačne {quick.year}</h2>
            {ownContrib && (
              <button type="button" className="link-btn" onClick={() => set({ spH1: null, spH2: null, zp: null })}>Vrátiť automatiku</button>
            )}
          </div>
          <div className="quick-contrib">
            {contribFields.map((f) => (
              <NumberInput
                key={f.key}
                label={f.label}
                allowNull
                value={quick[f.key] ?? null}
                placeholder={money(f.auto)}
                onChange={(v) => set({ [f.key]: v === null ? null : Math.max(0, v) })}
              />
            ))}
          </div>
          {both && (
            <div className="quick-emp-block">
              <div className="quick-head quick-contrib-head"><h2>Zamestnanie</h2></div>
              <div className="quick-contrib">
                <NumberInput label="Úhrn príjmov" allowNull value={quick.empGross ?? null} placeholder="0,00" onChange={(v) => set({ empGross: v === null ? null : Math.max(0, v) })} />
                <NumberInput label="Poistné" allowNull value={quick.empInsurance ?? null} placeholder="0,00" onChange={(v) => set({ empInsurance: v === null ? null : Math.max(0, v) })} />
                <NumberInput label="Preddavky" allowNull value={quick.empWithheld ?? null} placeholder="0,00" onChange={(v) => set({ empWithheld: v === null ? null : Math.max(0, v) })} />
              </div>
              <p className="note small">Z Potvrdenia o zdaniteľnej mzde. Prázdne pole = 0 €.</p>
            </div>
          )}
        </section>}
      </div>

      <section className="card" aria-label="Výsledok">
        {emp ? (
          <div className="stats">
            <Stat label="Daň" value={eur(s.tax)} tone="main" />
            <Stat label={refund ? "Preplatok" : "Nedoplatok"} value={eur(Math.abs(s.taxToPay))} sub={refund ? "vráti vám daňový úrad / zamestnávateľ" : "doplatíte pri daňovom priznaní"} tone={refund ? "good" : "main"} />
            <Stat label="Daňové priznanie" value={f.type ? `typ ${f.type}` : "netreba"} sub={filingHeadline(result)} />
            <Stat label="Príjem po dani a odvodoch" value={eur(s.net)} sub={`${eur(s.netMonthly)} mesačne`} tone="good" />
          </div>
        ) : (
        <div className="stats">
          <Stat label="Daň" value={eur(s.tax)} sub={Math.abs(s.taxToPay - s.tax) > 0.005 ? `${refund ? "Preplatok" : "Na úhradu"}: ${eur(Math.abs(s.taxToPay))}` : undefined} tone="main" />
          <Stat label={`Odvody za ${result.year}`} value={eur(s.sp + s.zp)} sub={`SP ${eur(s.sp)} · ZP ${eur(s.zp)}`} />
          <Stat
            label={`Nové odvody ${n.year} mesačne`}
            value={n.paramsStatus === "chýbajú" ? "Zatiaľ neznáme" : eur(n.spFromJuly + n.zpMonthly)}
            sub={
              n.paramsStatus === "chýbajú"
                ? `Sadzby odvodov na rok ${n.year} ešte nie sú známe.`
                : `${n.paramsStatus === "predbežné" ? "Odhad (predbežné sadzby) · " : ""}SP od 7/${n.year}: ${eur(n.spFromJuly)}${REGIME[n.spRegime] ? ` (${REGIME[n.spRegime]})` : ""} · ZP ${n.year}: ${eur(n.zpMonthly)}`
            }
          />
          {s.income > 0 ? (
            <>
              <Stat
                label="Príjem po dani a odvodoch"
                value={eur(s.net)}
                sub={`${eur(s.netMonthly)} mesačne · zaťaženie ${s.effectiveRate > 1 ? "nad 100 %" : pct(s.effectiveRate)} (daň + odvody)`}
                tone="good"
              />
            </>
          ) : (
            <Stat label="Príjem po dani a odvodoch" value="—" sub="Zadajte príjmy za rok – odvody sa platia aj bez príjmov." tone="good" />
          )}
        </div>
        )}
      </section>

      <AssignNotice tax={result.summary.tax} year={result.year} />
      <ResultNotices result={result} hideLimitWarnings />

      {exceeded.length > 0 && (
        <div className="quick-warn">
          {exceeded.map((l) => (
            <div key={l.id} className="box warn" role="status">
              <strong>{l.label}</strong> – prekročené o {eur(l.current - l.limit)} (limit {eur(l.limit)}). {l.consequence}
            </div>
          ))}
        </div>
      )}

      <StepsList result={result} input={buildQuickInput(dq, dq.expenses !== null)} update={() => undefined} readOnly cardId="card-quick-steps" defaultOpen={false} />

      <div className="quick-actions">
        <button
          type="button"
          onClick={() => {
            const r = transferReport(quick, lastInput);
            if (r.overwritten.length > 0 || r.kept.length > 0) setTransfer(r);
            else onDetailed(toDetailedInput(quick, lastInput));
          }}
        >
          Podrobný výpočet →
        </button>
      </div>
      {transfer && (
        <div className="box warn" role="alert">
          <p style={{ margin: "0 0 6px" }}>
            <strong>Máte rozpracovaný podrobný výpočet.</strong> Ako ho chcete použiť?
          </p>
          {transfer.overwritten.length > 0 && (
            <>
              <p style={{ margin: "0 0 4px" }}>Prenos prepíše:</p>
              <ul style={{ margin: "0 0 8px" }}>
                {transfer.overwritten.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
          {transfer.kept.length > 0 && (
            <>
              <p style={{ margin: "0 0 4px" }}>Zostane z rozpracovaného výpočtu a výsledok sa bude líšiť od rýchleho:</p>
              <ul style={{ margin: "0 0 8px" }}>
                {transfer.kept.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setTransfer(null);
                onDetailed(buildQuickInput(quick));
              }}
            >
              Nový podrobný výpočet z týchto údajov
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setTransfer(null);
                onDetailed(toDetailedInput(quick, lastInput));
              }}
            >
              Použiť na rozpracovaný výpočet
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setTransfer(null);
                onOpenDetailed();
              }}
            >
              Otvoriť podrobný bez prenosu
            </button>
            <button type="button" className="ghost" onClick={() => setTransfer(null)}>Zrušiť</button>
          </div>
          <p className="note small" style={{ margin: "8px 0 0" }}>Nový výpočet nahradí rozpracovaný (uložené výpočty v Histórii sa nezmenia) a zhodne sa s Rýchlym výpočtom.</p>
        </div>
      )}
    </main>
  );
}
