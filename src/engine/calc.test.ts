import { describe, expect, it } from "vitest";
import { PARAMS } from "../params/data";
import { calculate, defaultInput, nczdFor, progressiveTax, spFromVZ } from "./calc";

describe("poistné SP po fondoch zodpovedá sumám Sociálnej poisťovne", () => {
  it.each([
    [2024, 652, 216.13],
    [2025, 715, 237.02],
    [2026, 914.4, 303.11],
    [2027, 972, 322.21],
  ])("%i: VZ %f → %f", (y, vz, expected) => {
    expect(spFromVZ(vz, PARAMS[y].sp)).toBe(expected);
    expect(PARAMS[y].sp.minPoistne.value).toBe(expected);
  });
  it("mikroodvod 2026 a 2027", () => {
    expect(spFromVZ(396.24, PARAMS[2026].sp)).toBe(131.34);
    expect(spFromVZ(421.2, PARAMS[2027].sp)).toBe(139.61);
  });
  it("min. preddavok ZP = sadzba × min. VZ", () => {
    for (const y of [2024, 2025, 2026, 2027]) {
      const zp = PARAMS[y].zp;
      expect(Math.round(zp.minVZ.value * zp.rate * 100) / 100).toBe(zp.minPreddavok.value);
    }
  });
});

describe("Excel používateľa – hárok podklady 2024", () => {
  // príjmy vymyslený kontrolný príklad: 31 500; SP 12 × 216,13; ZP 12 × 97,80
  const input = defaultInput(2024);
  input.income.annual = 31500;
  input.insurance.shiftOneMonth = false;
  const r = calculate(input);
  const v = (id: string) => r.stepById[id].value;

  it("poistné 3 767,16 €", () => {
    expect(v("spZaplatene")).toBe(2593.56);
    expect(v("zpZaplatene")).toBe(1173.6);
    expect(v("poistne")).toBe(3767.16);
  });
  it("výdavky a základ dane ako v Exceli", () => {
    expect(v("pausal")).toBe(18900);
    expect(v("vydavky")).toBe(22667.16);
    expect(v("czd6")).toBe(8832.84);
    expect(v("nczd")).toBe(5646.48);
    expect(v("zd6")).toBe(3186.36);
  });
  it("daň 15 % (Excel 477,954 → zaokrúhlené nadol na centy)", () => {
    expect(v("sadzba15")).toBe(1);
    expect(v("dan")).toBe(477.95);
  });
});

describe("strop paušálnych výdavkov 20 000 €", () => {
  it("pri príjme 40 000 € sa uplatní len 20 000 € a zobrazí sa varovanie", () => {
    const input = defaultInput(2025);
    input.income.annual = 40000;
    const r = calculate(input);
    expect(r.stepById.pausal60.value).toBe(24000);
    expect(r.stepById.pausal.value).toBe(20000);
    expect(r.warnings.some((w) => w.id === "pausal-cap")).toBe(true);
    const cap = r.limits.find((l) => l.id === "pausalCap")!;
    expect(cap.limit).toBe(33333.33);
    expect(cap.exceeded).toBe(true);
  });
});

describe("2026 – progresia a NČZD", () => {
  it("NČZD sa kráti ZD/3 nad 26 083,13 €", () => {
    const T = PARAMS[2026].tax!;
    expect(nczdFor(26083.13, T)).toBe(5966.73);
    expect(nczdFor(30000, T)).toBe(4661.11);
    expect(nczdFor(44000, T)).toBe(0);
  });
  it("pásma 19/25/30/35 %", () => {
    const T = PARAMS[2026].tax!;
    const { tax } = progressiveTax(80000, T);
    const expected = 43983.32 * 0.19 + (60349.21 - 43983.32) * 0.25 + (75010.32 - 60349.21) * 0.3 + (80000 - 75010.32) * 0.35;
    expect(tax).toBeCloseTo(expected, 6);
  });
  it("príjmy nad 100 000 € → progresívna sadzba", () => {
    const input = defaultInput(2026);
    input.income.annual = 120000;
    input.expenses = { mode: "actual", actual: 30000 };
    const r = calculate(input);
    expect(r.stepById.sadzba15.value).toBe(0);
    expect(r.stepById.danProg).toBeDefined();
    expect(r.stepById.dan15).toBeUndefined();
  });
});

describe("odvody na budúci rok", () => {
  it("nízky príjem 2026 → mikroodvod 2027", () => {
    const input = defaultInput(2026);
    input.income.annual = 8000;
    const r = calculate(input);
    expect(r.next.spRegime).toBe("mikro");
    expect(r.next.spFromJuly).toBe(139.61);
  });
  it("vyšší príjem → VZ zo základu dane, ohraničený minimom", () => {
    const input = defaultInput(2025);
    input.income.annual = 30000;
    const r = calculate(input);
    expect(r.next.spRegime).toBe("standard");
    // čiastkový ZD / 1,486 / 12 vs. min 914,40
    const czd6 = r.stepById.czd6.value;
    const vz = Math.max(914.4, Math.ceil((czd6 / 1.486 / 12) * 100) / 100);
    expect(r.next.spVZ).toBeCloseTo(vz, 2);
    expect(r.next.spFromJuly).toBe(spFromVZ(vz, PARAMS[2026].sp));
  });
});

describe("prepísanie hodnoty", () => {
  it("ručne zadaná NČZD sa použije v ďalšom výpočte", () => {
    const input = defaultInput(2026);
    input.income.annual = 30000;
    input.overrides = { nczd: 1000 };
    const r = calculate(input);
    expect(r.stepById.nczd.value).toBe(1000);
    expect(r.stepById.nczd.overridden).toBe(true);
    expect(r.stepById.zd6.value).toBe(Math.round((r.stepById.czd6.value - 1000) * 100) / 100);
  });
});

describe("mesačný režim", () => {
  it("dopočíta chýbajúce mesiace priemerom a predpovie prekročenie limitu", () => {
    const input = defaultInput(2026);
    input.income.mode = "monthly";
    input.income.monthly = [5000, 5000, 5000, 5000, null, null, null, null, null, null, null, null];
    const r = calculate(input);
    expect(r.stepById.prijmy.value).toBe(60000);
    const dph = r.limits.find((l) => l.id === "dph")!;
    expect(dph.exceeded).toBe(true);
    expect(dph.projectedMonth).toBe(11);
    expect(r.warnings.some((w) => w.id === "projected")).toBe(true);
  });
  it("posun platieb: január platí december predošlého roka", () => {
    const input = defaultInput(2026);
    input.income.annual = 20000;
    const r = calculate(input);
    expect(r.months[0].covers).toBe("12/2025");
    expect(r.months[0].sp).toBe(237.02);
    expect(r.months[1].sp).toBe(303.11);
  });
});
