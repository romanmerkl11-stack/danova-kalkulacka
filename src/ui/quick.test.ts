import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "../engine/calc";
import { buildQuickInput, incomeLimits, sliderMax, toDetailedInput } from "./quick";

describe("rýchly výpočet", () => {
  it("automatické výdavky: bez prepisu", () => {
    const i = buildQuickInput({ year: 2026, income: 30000, expenses: null });
    expect(i.income.mode).toBe("annual");
    expect(i.income.annual).toBe(30000);
    expect(i.overrides.vydavky).toBeUndefined();
  });
  it("vlastné výdavky: prepis kroku vydavky preteká do dane", () => {
    const q = { year: 2026, income: 30000, expenses: 25000 };
    const auto = calculate(buildQuickInput({ ...q, expenses: null }));
    const own = calculate(buildQuickInput(q));
    expect(buildQuickInput(q).overrides.vydavky).toBe(25000);
    expect(own.stepById["vydavky"].value).toBe(25000);
    expect(own.summary.tax).toBeLessThan(auto.summary.tax);
  });
  it("limity podľa príjmov pre 2026", () => {
    const r = calculate(buildQuickInput({ year: 2026, income: 0, expenses: null }));
    const lim = incomeLimits(r.limits);
    expect(lim.some((l) => l.id === "pausalCap" && Math.abs(l.limit - 33333.33) < 0.01)).toBe(true);
    expect(lim.some((l) => l.id === "rate15")).toBe(true);
    expect(lim.every((l) => l.measure === "príjmy" || l.measure.startsWith("obrat"))).toBe(true);
    expect(sliderMax(r.limits)).toBeGreaterThanOrEqual(120000);
  });
  it("prenos do podrobného výpočtu", () => {
    const last = defaultInput(2026);
    last.dds = 500;
    const d = toDetailedInput({ year: 2026, income: 50000, expenses: 1000 }, last);
    expect(d.dds).toBe(500);
    expect(d.overrides.vydavky).toBe(1000);
    const other = toDetailedInput({ year: 2025, income: 1, expenses: null }, last);
    expect(other.dds).toBe(0);
    expect(other.year).toBe(2025);
  });
});

describe("vlastné mesačné odvody v rýchlom výpočte", () => {
  it("zadané sumy idú do vstupu aj do podrobného výpočtu, prázdne = automaticky", () => {
    const q = { year: 2026, income: 20000, expenses: null, spH1: 303.11, spH2: null, zp: 121.92 };
    const i = buildQuickInput(q);
    expect(i.insurance.spJanJun).toBe(303.11);
    expect(i.insurance.spJulDec).toBeNull();
    expect(i.insurance.zpMonthlyAmount).toBe(121.92);
    expect(toDetailedInput(q, undefined).insurance.zpMonthlyAmount).toBe(121.92);
  });
});

describe("hranice odvodov nad minimum", () => {
  it("SP a ZP: pri hranici sú odvody na budúci rok minimálne, nad ňou vyššie", async () => {
    const { PARAMS } = await import("../params/data");
    const { contributionThresholds } = await import("./quick");
    const q = { year: 2026, income: 0, expenses: null };
    const t = contributionThresholds(q, PARAMS);
    const sp = t.find((x) => x.id === "spNadMin")!;
    const zp = t.find((x) => x.id === "zpNadMin")!;
    const at = (income: number) => calculate(buildQuickInput({ ...q, income })).next;
    expect(at(sp.limit - 50).spFromJuly).toBe(PARAMS[2027].sp.minPoistne.value);
    expect(at(sp.limit + 50).spFromJuly).toBeGreaterThan(PARAMS[2027].sp.minPoistne.value);
    expect(at(zp.limit - 50).zpMonthly).toBe(PARAMS[2027].zp.minPreddavok.value);
    expect(at(zp.limit + 50).zpMonthly).toBeGreaterThan(PARAMS[2027].zp.minPreddavok.value);
  });
});

describe("hranica, od ktorej začnem platiť daň", () => {
  it("tesne pod hranicou je daň 0, tesne nad ňou kladná", async () => {
    const { PARAMS } = await import("../params/data");
    const { taxStartThreshold } = await import("./quick");
    const q = { year: 2026, income: 0, expenses: null };
    const [t] = taxStartThreshold(q, PARAMS);
    expect(t.id).toBe("danStart");
    expect(calculate(buildQuickInput({ ...q, income: t.limit - 1 })).summary.tax).toBe(0);
    expect(calculate(buildQuickInput({ ...q, income: t.limit + 1 })).summary.tax).toBeGreaterThan(0);
  });
});
