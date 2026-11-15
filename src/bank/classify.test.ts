import { describe, expect, it } from "vitest";
import { classify, ruleFromTx } from "./classify";
import type { BankRule, Tx } from "./types";

const tx = (o: Partial<Tx>): Tx => ({ id: "x", date: "2025-03-01", amount: 100, raw: "", ...o });
const cat = (t: Partial<Tx>, rules: BankRule[] = [], own?: string) => classify([tx(t)], rules, { ownIban: own })[0];

describe("classify", () => {
  it("SP výdaj", () => {
    const r = cat({ amount: -50, counterparty: "SOCIÁLNA POISŤOVŇA" });
    expect(r.category).toBe("sp");
    expect(r.reason).toContain("Sociálna poisťovňa");
    expect(cat({ amount: -50, counterparty: "Ústredie", description: "sociálne poistenie 03/2025" }).category).toBe("sp");
  });
  it("ZP výdaj", () => {
    expect(cat({ amount: -30, counterparty: "Všeobecná zdravotná poisťovňa" }).category).toBe("zp");
    expect(cat({ amount: -30, counterparty: "Dôvera ZP" }).category).toBe("zp");
    expect(cat({ amount: -30, counterparty: "Union zdravotná poisťovňa" }).category).toBe("zp");
  });
  it("príjem a ostatný výdaj", () => {
    expect(cat({ counterparty: "Klient" }).category).toBe("prijem");
    expect(cat({ amount: -9, counterparty: "Tesco" }).category).toBe("ine");
  });
  it("vrátenie, úrok, úver, vlastný účet", () => {
    expect(cat({ description: "Vrátenie platby" }).category).toBe("ine");
    expect(cat({ description: "Úrok" }).category).toBe("ine");
    expect(cat({ description: "splatka uveru" }).category).toBe("ine");
    expect(cat({ description: "presun na sporiaci" }).category).toBe("ine");
    const own = cat({ iban: "SK31 1200 0000 1987 4263 7541" }, [], "SK3112000000198742637541");
    expect(own.category).toBe("ine");
    expect(own.reason).toContain("vlastného");
  });
  it("pravidlá majú prednosť", () => {
    const rules: BankRule[] = [{ match: { counterpartyContains: "socialna" }, category: "ine" }];
    const r = cat({ amount: -50, counterparty: "Sociálna poisťovňa" }, rules);
    expect(r.category).toBe("ine");
    expect(r.reason).toMatch(/^Pravidlo:/);
    expect(cat({ iban: "SK11 0000", counterparty: "X" }, [{ match: { iban: "SK110000" }, category: "sp" }]).category).toBe("sp");
    expect(cat({ vs: "42" }, [{ match: { vs: "42" }, category: "zp" }]).category).toBe("zp");
  });
  it("ruleFromTx", () => {
    expect(ruleFromTx(tx({ iban: "SK11 0000", counterparty: "A" }), "sp")).toEqual({ match: { iban: "SK110000" }, category: "sp" });
    expect(ruleFromTx(tx({ counterparty: "A s.r.o." }), "prijem")).toEqual({ match: { counterpartyContains: "A s.r.o." }, category: "prijem" });
  });
});
