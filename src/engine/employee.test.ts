import { describe, expect, it } from "vitest";
import { PARAMS } from "../params/data";
import { calculate, defaultInput, progressiveTax } from "./calc";
import { round2 } from "./money";

const Y = 2026;
const T = PARAMS[Y].tax!;
const emp = () => {
  const i = defaultInput(Y);
  i.profile = "zamestnanec";
  return i;
};

describe("zamestnanec – len § 5", () => {
  const i = emp();
  i.employment = { gross: 18000, insurance: 2556, taxWithheld: 1900, bonusPaid: 0 };
  const r = calculate(i);
  const base = 18000 - 2556;
  const nczd = T.nczd.value; // základ dane je pod hranicou krátenia
  it("bez odvodov SZČO a bez SZČO krokov", () => {
    expect(r.summary.sp).toBe(0);
    expect(r.summary.zp).toBe(0);
    expect(r.stepById.poistne).toBeUndefined();
    expect(r.stepById.spZaplatene).toBeUndefined();
    expect(r.stepById.pausal).toBeUndefined();
    expect(r.next.spRegime).toBe("none");
    expect(r.next.spFromJuly).toBe(0);
    expect(r.limits.some((l) => ["dph", "spVznik", "pausalCap", "rate15"].includes(l.id))).toBe(false);
    expect(r.summary.employeeInsurance).toBe(2556);
  });
  it("daň = progresívna z (hrubá − poistné − NČZD), typ A, RZ", () => {
    const expectedTax = round2(Math.floor(progressiveTax(base - nczd, T).tax * 100) / 100);
    expect(r.stepById.nczd.value).toBe(nczd);
    expect(r.summary.tax).toBe(expectedTax);
    expect(r.summary.taxToPay).toBe(round2(expectedTax - 1900));
    expect(r.filing.type).toBe("A");
    expect(r.filing.canUseRZ).toBe(true);
    expect(r.filing.mustFile).toBe(false);
    expect(r.filing.deadline).toBe("31. 3. 2027");
  });
});

describe("zamestnanec + prenájom", () => {
  const i = emp();
  i.employment = { gross: 18000, insurance: 2556, taxWithheld: 1900, bonusPaid: 0 };
  i.rental = { income: 5400, expenses: 600 };
  const r = calculate(i);
  it("oslobodenie 500 €, výdavky pomerne, typ B, povinné DP", () => {
    const expBase = 4900 - (4900 / 5400) * 600;
    expect(r.stepById.najom.value).toBe(round2(expBase));
    expect(r.filing.type).toBe("B");
    expect(r.filing.mustFile).toBe(true);
    expect(r.filing.canUseRZ).toBe(false);
    const prog = round2(18000 - 2556 - T.nczd.value + round2(expBase));
    expect(r.stepById.danProg.value).toBe(Math.floor(progressiveTax(prog, T).tax * 100) / 100);
  });
});

describe("spoločné oslobodenie 500 € (prenájom + § 8)", () => {
  it("prenájom 300 + príležitostné 400 → prenájom bez dane, § 8 zdaniteľných 200", () => {
    const i = emp();
    i.rental = { income: 300, expenses: 0 };
    i.other = { items: [{ kind: "prilezitostna", name: "brigáda", income: 400, expenses: 0 }] };
    const r = calculate(i);
    expect(r.stepById.najom.value).toBe(0);
    expect(r.stepById.ostatneOslobodenie.value).toBe(200);
    expect(r.stepById.czd8.value).toBe(200);
    expect(r.filing.type).toBe("B");
  });
  it("výdavky k príležitostným príjmom pomerne", () => {
    const i = emp();
    i.other = { items: [{ kind: "prilezitostna", name: "x", income: 1000, expenses: 200 }] };
    const r = calculate(i);
    expect(r.stepById.ostatneVydavky.value).toBe(100);
    expect(r.stepById.czd8.value).toBe(400);
  });
});

describe("§ 8 strata", () => {
  it("strata nezníži základ ani iné príjmy", () => {
    const i = emp();
    i.employment = { gross: 18000, insurance: 2556, taxWithheld: 0, bonusPaid: 0 };
    i.other = { items: [{ kind: "ine", name: "predaj", income: 100, expenses: 900 }] };
    const r = calculate(i);
    expect(r.stepById.czd8.value).toBe(0);
    const j = emp();
    j.employment = i.employment;
    expect(r.summary.tax).toBe(calculate(j).summary.tax);
  });
});

describe("viac zamestnávateľov", () => {
  it("sčíta sa do jedného kroku § 5", () => {
    const i = emp();
    i.employment.items = [
      { name: "A", gross: 10000, insurance: 1400, taxWithheld: 500, bonusPaid: 0 },
      { name: "B", gross: 8000, insurance: 1156, taxWithheld: 400, bonusPaid: 0 },
    ];
    const r = calculate(i);
    expect(r.stepById.czd5.value).toBe(18000 - 2556);
    expect(r.stepById.czd5.formula).toContain("A:");
  });
});

describe("profil szco / oboje", () => {
  it("oboje a szco bez zamestnania dávajú rovnaký výsledok", () => {
    const a = defaultInput(Y);
    a.income.annual = 30000;
    const b = structuredClone(a);
    b.profile = "oboje";
    expect(calculate(b).summary).toEqual(calculate(a).summary);
  });
  it("filing limit zahŕňa zdaniteľný § 8", () => {
    const i = defaultInput(Y);
    i.income.annual = 1000;
    const r = calculate(i);
    expect(r.filing.type).toBe("B");
    expect(r.limits.find((l) => l.id === "filing")!.current).toBe(1000);
  });
});
