import { useDeferredValue, useMemo } from "react";
import { calculate } from "../../engine/calc";
import { eur, pct } from "../../engine/money";
import type { CalcInput, CalcResult } from "../../engine/types";
import type { ParamSet } from "../../params/types";
import type { AppData } from "../../store/storage";
import { NumberInput } from "../NumberInput";
import { formatSkNumber } from "../format";
import { buildQuickInput, contributionLimits, contributionThresholds, incomeLimits, SLIDER_STEP, sliderMax, toDetailedInput, withoutOwnContributions, type QuickState } from "../quick";

interface Props {
  quick: NonNullable<AppData["quick"]>;
  onQuick: (q: QuickState) => void;
  params: ParamSet;
  years: number[];
  lastInput: CalcInput | undefined;
  onDetailed: (i: CalcInput) => void;
}

const REGIME = { standard: "", mikro: "mikroodvod", none: "nie ste povinne poistený", unknown: "" } as const;

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={`stat ${tone ?? ""}`}>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export function QuickTab({ quick, onQuick, params, years, lastInput, onDetailed }: Props) {
  // plynulé ťahanie slidera: výpočet beží s oneskorenou hodnotou
  const dq = useDeferredValue(quick);

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
    () => contributionThresholds({ ...dq, income: 0 }, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dq.year, dq.expenses, dq.spH1, dq.spH2, dq.zp, params],
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
  // popisky značiek do riadkov tak, aby sa neprekrývali (každý ďalší do prvého riadku, kde je miesto)
  const LABEL_GAP = 0.14; // približná šírka popisku ako podiel dĺžky posuvníka
  const rowEnds: number[] = [];
  const rows: number[] = ticks.map((l) => {
    const pos = l.limit / max;
    let r = rowEnds.findIndex((end) => pos - end >= LABEL_GAP);
    if (r === -1) r = rowEnds.length;
    rowEnds[r] = pos;
    return r;
  });
  const s = result.summary;
  const n = result.next;
  const refund = s.taxToPay < 0;
  // povinnosť podať DP platí takmer vždy – na rýchlej obrazovke by len rušila
  // „spMin“ z enginu je meraný na základe dane – na tejto obrazovke ho nahrádzajú hranice v príjmoch
  const exceeded = [...result.limits.filter((l) => l.exceeded && l.id !== "filing" && l.id !== "spMin"), ...contributionLimits(thresholds, result.summary.income).filter((l) => l.exceeded)];
  const income = Math.min(quick.income, max);

  return (
    <main className="quick">
      <div className="quick-inputs">
        <section className="card" aria-label="Príjmy">
          <div className="quick-head">
            <h2>Príjmy za rok</h2>
            <select aria-label="Rok" value={quick.year} onChange={(e) => set({ year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <NumberInput className="big" ariaLabel="Príjmy za rok" value={quick.income} onChange={(v) => set({ income: Math.max(0, v ?? 0) })} />
          <div className="slider-wrap" style={{ ["--rows" as string]: Math.max(1, rowEnds.length) }}>
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
                const passed = quick.income > l.limit;
                const row = rows[idx];
                return (
                  <div
                    key={l.id}
                    className={`tick${passed ? " passed" : ""}${pos(l) < 0.2 ? " tip-left" : pos(l) > 0.8 ? " tip-right" : ""}`}
                    style={{ left: `${Math.min(100, pos(l) * 100)}%`, ["--row" as string]: row }}
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

        <section className="card" aria-label="Výdavky">
          <div className="quick-head">
            <h2>Výdavky</h2>
            {quick.expenses !== null && (
              <button type="button" className="link-btn" onClick={() => set({ expenses: null })}>Vrátiť automatiku</button>
            )}
          </div>
          <NumberInput
            className="big"
            ariaLabel="Výdavky"
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
        </section>
      </div>

      <section className="card" aria-label="Výsledok">
        <div className="stats">
          <Stat label="Daň" value={eur(s.tax)} sub={Math.abs(s.taxToPay - s.tax) > 0.005 ? `${refund ? "Preplatok" : "Na úhradu"}: ${eur(Math.abs(s.taxToPay))}` : undefined} tone="main" />
          <Stat label={`Odvody za ${result.year}`} value={eur(s.sp + s.zp)} sub={`SP ${eur(s.sp)} · ZP ${eur(s.zp)}`} />
          <Stat
            label={`Nové odvody ${n.year}`}
            value={`${eur(n.spFromJuly + n.zpMonthly)} / mes.`}
            sub={`SP od 7/${n.year}: ${eur(n.spFromJuly)}${REGIME[n.spRegime] ? ` (${REGIME[n.spRegime]})` : ""} · ZP ${n.year}: ${eur(n.zpMonthly)}`}
          />
          <Stat label="Čistý príjem ročne" value={eur(s.net)} sub={`${eur(s.netMonthly)} mesačne`} tone="good" />
          <Stat label="Efektívne zaťaženie" value={pct(s.effectiveRate)} sub="daň + odvody z príjmov" />
        </div>
      </section>

      {exceeded.length > 0 && (
        <div className="quick-warn">
          {exceeded.map((l) => (
            <div key={l.id} className="box warn" role="status">
              <strong>{l.label}</strong> – prekročené o {eur(l.current - l.limit)} (limit {eur(l.limit)}). {l.consequence}
            </div>
          ))}
        </div>
      )}

      <div className="quick-actions">
        <button type="button" onClick={() => onDetailed(toDetailedInput(quick, lastInput))}>Podrobný výpočet →</button>
      </div>
    </main>
  );
}
