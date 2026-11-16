import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "../engine/calc";
import { buildQuickInput, incomeLimits, sliderMax, toDetailedInput, transferReport, nearestTicks } from "./quick";

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

describe("rýchly výpočet – profil zamestnanec", () => {
  it("príjem = úhrn zo zamestnania, poistné a preddavky z potvrdenia, bez odvodov SZČO", () => {
    const q = { year: 2026, income: 18000, expenses: null, profile: "zamestnanec" as const, empInsurance: 2556, empWithheld: 1900, rentMonthly: 450, rentMonths: 12, rentExpenses: 600 };
    const i = buildQuickInput(q);
    expect(i.profile).toBe("zamestnanec");
    expect(i.employment.gross).toBe(18000);
    expect(i.rental.income).toBe(5400);
    const r = calculate(i);
    expect(r.summary.sp + r.summary.zp).toBe(0);
    expect(r.filing.type).toBe("B");
    const d = toDetailedInput(q, undefined);
    expect(d.employment.taxWithheld).toBe(1900);
  });
});

describe("staircase – schody popiskov limitov", () => {
  it("v skupine blízkych značiek je prvá najnižšie, ďalšie vyššie; vzdialené na stupni 0", async () => {
    const { staircase } = await import("./quick");
    expect(staircase([10, 20, 30, 200, 300, 310], 40)).toEqual([2, 1, 0, 0, 1, 0]);
  });
});

describe("F09 – čo prenos do podrobného výpočtu prepíše a čo zostane", () => {
  const q = { year: 2026, income: 30000, expenses: null };
  const none = { overwritten: [], kept: [] };
  it("bez rozpracovaného alebo s nedotknutým výpočtom sa netreba pýtať", () => {
    expect(transferReport(q, undefined)).toEqual(none);
    expect(transferReport(q, defaultInput(2026))).toEqual(none);
    expect(transferReport(q, defaultInput(2025))).toEqual(none);
  });
  it("iný rok s rozpracovanými údajmi", () => {
    const last = defaultInput(2025);
    last.dds = 100;
    expect(transferReport(q, last).overwritten).toEqual(["celý rozpracovaný výpočet za rok 2025 (prepne sa na rok 2026)"]);
  });
  it("prepíše mesačné príjmy, zamestnávateľov, ručné odvody a výdavky", () => {
    const last = defaultInput(2026);
    last.income.mode = "monthly";
    last.income.monthly[0] = 1000;
    last.employment.items = [
      { name: "A", gross: 1, insurance: 0, taxWithheld: 0, bonusPaid: 0 },
      { name: "B", gross: 1, insurance: 0, taxWithheld: 0, bonusPaid: 0 },
    ];
    last.insurance.zpMonthlyAmount = 150;
    last.overrides = { vydavky: 5000 };
    expect(transferReport({ ...q, profile: "oboje" }, last).overwritten).toEqual([
      "príjmy zadané po mesiacoch (prepnú sa na ročnú sumu)",
      "zoznam 2 zamestnávateľov",
      "ručne zadané mesačné odvody",
      "ručne zadané výdavky",
    ]);
    expect(transferReport({ ...q, zp: 150, expenses: 5000 }, last).overwritten).toEqual(["príjmy zadané po mesiacoch (prepnú sa na ročnú sumu)"]);
  });
  it("príklad z auditu: skutočné výdavky a ručne prepísaná daň zostanú → treba upozorniť", () => {
    const last = defaultInput(2026);
    last.expenses = { mode: "actual", actual: 10000 };
    last.overrides = { dan: 42 };
    const r = transferReport(q, last);
    expect(r.kept).toEqual(["ručný prepis medzivýsledku v Postupe výpočtu", "skutočné výdavky namiesto paušálu"]);
    // prenos do rozpracovaného výpočtu sa líši od rýchleho, nový výpočet sa zhoduje
    const quickTax = calculate(buildQuickInput(q)).summary.tax;
    expect(calculate(toDetailedInput(q, last)).summary.tax).not.toBe(quickTax);
    expect(calculate(buildQuickInput(q)).summary.tax).toBe(quickTax);
  });
  it("deti, manžel/ka, preddavky, poistné po mesiacoch", () => {
    const last = defaultInput(2026);
    last.children = [{ name: "A", birth: "2020-01" }];
    last.spouse.claim = true;
    last.taxAdvancesPaid = 100;
    last.insurance.spPaid[0] = 300;
    expect(transferReport(q, last).kept).toEqual([
      "ručne upravené mesiace zaplateného poistného",
      "dieťa (daňový bonus)",
      "nezdaniteľná časť na manžela/manželku",
      "zaplatené preddavky na daň",
    ]);
  });
});

describe("U06 – najbližšie značky limitov", () => {
  const t = [10, 20, 30, 40, 50].map((limit) => ({ limit }));
  it("posledný prekročený + dva nad príjmom", () => {
    expect(nearestTicks(t, 25).map((x) => x.limit)).toEqual([20, 30, 40]);
    expect(nearestTicks(t, 0).map((x) => x.limit)).toEqual([10, 20]);
    expect(nearestTicks(t, 45).map((x) => x.limit)).toEqual([40, 50]);
    expect(nearestTicks(t, 99).map((x) => x.limit)).toEqual([50]);
    expect(nearestTicks([], 5)).toEqual([]);
  });
});
