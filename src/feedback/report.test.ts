import { describe, expect, it } from "vitest";
import { MAILTO_MAX, feedbackAddress, mailtoUrl, newDraft, normalizeDraft, osName, reportText, scrubError, subject, type FeedbackContext } from "./report";

const ctx: FeedbackContext = { appVersion: "0.1.0", platform: "desktop", os: "Windows", tab: "Výpočet", year: 2026, profile: "SZČO", paramsDate: "2026-11-15T23:00" };
const draft = () => ({ ...newDraft("vypocet"), id: "DK-0A1B2C3D", what: "Daň nesedí s mojím výpočtom", expectedAmount: "1 200 €", appAmount: "1 250 €", source: "DP typ B, r. 116" });

describe("H – hlásenie spätnej väzby", () => {
  it("predmet na filter v pošte", () => {
    expect(subject(draft())).toBe("[Daňová kalkulačka][Výpočet][DK-0A1B2C3D] Daň nesedí s mojím výpočtom");
    expect(subject({ ...draft(), what: "x".repeat(100) })).toMatch(/…$/);
  });

  it("text obsahuje to, čo používateľ napísal, a technický kontext – nič viac", () => {
    const t = reportText(draft(), ctx);
    expect(t).toContain("Typ: Výpočet alebo daňové pravidlo");
    expect(t).toContain("Očakávaná suma:\n1 200 €");
    expect(t).toContain("Verzia aplikácie: 0.1.0 (desktop, Windows)");
    expect(t).toContain("Sadzby z: 2026-11-15");
    expect(t).not.toContain("Ako to zopakovať"); // prázdne polia sa vynechajú
    expect(t).not.toContain(feedbackAddress());
  });

  it("sumy sa pri inom type nepridajú", () => {
    expect(reportText({ ...draft(), kind: "navrh" }, ctx)).not.toContain("Očakávaná suma");
  });

  it("chybový text bez ciest, e-mailov, IBAN a dlhých čísel", () => {
    const s = scrubError("Chyba C:\\Users\\Mama\\AppData\\data.json /Users/x/klient.pdf jan@firma.sk SK31 1200 0000 1987 4263 7541 IČO 12345678");
    expect(s).not.toMatch(/Mama|klient|jan@|SK31|12345678/);
  });

  it("mailto: krátke celé, dlhé len s výzvou na vloženie", () => {
    const short = mailtoUrl("a@b.sk", draft(), ctx);
    expect(short.tooLong).toBe(false);
    expect(decodeURIComponent(short.url)).toContain("Daň nesedí");
    const long = mailtoUrl("a@b.sk", { ...draft(), what: "dlhý text ".repeat(300) }, ctx);
    expect(long.tooLong).toBe(true);
    expect(long.url.length).toBeLessThan(MAILTO_MAX);
  });

  it("adresa je poskladaná správne", () => {
    expect(feedbackAddress()).toMatch(/^[a-z]+@gmail\.com$/);
  });

  it("systém bez verzie", () => {
    expect(osName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(osName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macOS");
  });

  it("uložený koncept sa prečistí", () => {
    expect(normalizeDraft(null)).toBeUndefined();
    const d = normalizeDraft({ id: "zly", kind: "x", what: 5, steps: "a" })!;
    expect(d.id).toMatch(/^DK-[0-9A-F]{8}$/);
    expect(d.kind).toBe("problem");
    expect(d.what).toBe("");
    expect(d.steps).toBe("a");
  });
});
