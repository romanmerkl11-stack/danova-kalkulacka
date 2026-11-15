import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "../../engine/calc";
import { PARAMS } from "../../params/data";
import type { CalcInput } from "../../engine/types";
import { buildDeadlines, buildIcs } from "./calendar";
import { compareExpenses } from "./pausal";
import { computeReserve } from "./reserve";
import { fyiFacts, yoyRows, findPrevSaved } from "./yoy";
import type { SavedCalc } from "../../store/storage";

const years = Object.keys(PARAMS).map(Number).sort((a, b) => a - b);
const Y = years[years.length - 1];
const withIncome = (year: number): CalcInput => {
  const i = defaultInput(year);
  i.income = { ...i.income, mode: "annual", annual: 40000 };
  return i;
};

describe("rezerva", () => {
  const r = calculate(withIncome(Y), PARAMS);
  it("delí sumu počtom mesiacov do 31. 3.", () => {
    const now = new Date(Y, 10, 15); // november Y -> nov, dec, jan, feb, mar = 5
    const res = computeReserve(r, now);
    expect(res.monthsLeft).toBe(5);
    expect(res.total).toBeCloseTo(Math.max(0, r.summary.taxToPay) + Math.max(0, r.next.zpSettlement), 2);
    expect(res.monthly).toBeCloseTo(res.total / 5, 1);
  });
  it("po termíne = zaplatiť hneď", () => {
    const res = computeReserve(r, new Date(Y + 1, 4, 1));
    if (res.total > 0) expect(res.payNow).toBe(true);
    expect(res.monthly === null || res.total === 0).toBe(true);
  });
  it("zamestnanec nemá ZP", () => {
    const i = withIncome(Y);
    i.profile = "zamestnanec";
    const res = computeReserve(calculate(i, PARAMS), new Date(Y, 5, 1));
    expect(res.zpSettlement).toBe(0);
    expect(res.increase).toBeNull();
  });
});

describe("kalendár a .ics", () => {
  const r = calculate(withIncome(Y), PARAMS);
  const now = new Date(Date.UTC(Y, 5, 10, 12));
  const ev = buildDeadlines(r, now);
  it("obsahuje DP 31. 3. a odvody opakovane", () => {
    expect(ev.find((e) => e.id === "dp")?.date).toBe(`${Y + 1}-03-31`);
    expect(ev.find((e) => e.id === "odvody")?.recur).toBeTruthy();
    expect([...ev].map((e) => e.date)).toEqual([...ev].map((e) => e.date).sort());
  });
  it("ics: CRLF, dátumy, RRULE, alarm", () => {
    const ics = buildIcs(ev, now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain(`DTSTART;VALUE=DATE:${Y + 1}0331`);
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=8;COUNT=12");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).toContain("DTSTAMP:");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });
  it("zamestnanec s RZ má 15. 2.", () => {
    const i = withIncome(Y);
    i.profile = "zamestnanec";
    i.income = { ...i.income, annual: 0 };
    i.employment = { gross: 20000, insurance: 2700, taxWithheld: 2000, bonusPaid: 0 };
    const rr = calculate(i, PARAMS);
    const e = buildDeadlines(rr, now);
    expect(e.some((x) => x.id === "odvody")).toBe(false);
    if (rr.filing.canUseRZ) expect(e.find((x) => x.id === "rz")?.date).toBe(`${Y + 1}-02-15`);
  });
});

describe("paušál vs skutočné", () => {
  const i = withIncome(Y);
  it("veľmi vysoké výdavky vyhrajú, nulové prehrajú", () => {
    expect(compareExpenses(i, PARAMS, 39000).better).toBe("actual");
    const c = compareExpenses(i, PARAMS, 0);
    expect(c.better).toBe("pausal");
    expect(c.pausalAdvantage).toBeCloseTo(c.pausal.net - c.actual.net, 2);
  });
});

describe("medziročné porovnanie", () => {
  it("riadky a FYI", () => {
    const a = calculate(withIncome(Y - 1), PARAMS);
    const b = calculate(withIncome(Y), PARAMS);
    expect(yoyRows(a, b)).toHaveLength(5);
    expect(fyiFacts(PARAMS, Y).length).toBeLessThanOrEqual(4);
  });
  it("vyberie rovnakú prezývku", () => {
    const mk = (id: string, nickname: string, updatedAt: string) => ({ id, year: Y - 1, nickname, updatedAt }) as unknown as SavedCalc;
    const list = [mk("a", "Mama", "2025-01-01"), mk("b", "Ja", "2025-02-01"), mk("c", "Ja", "2025-01-01")];
    expect(findPrevSaved(list, Y, "Mama")?.id).toBe("a");
    expect(findPrevSaved(list, Y, "Nikto")?.id).toBe("b");
  });
});
