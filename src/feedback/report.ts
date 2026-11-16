// Spätná väzba (balík H): hlásenie problému alebo návrhu bez servera.
// Hlásenie sa pripraví ako e-mail (mailto), dá sa skopírovať alebo uložiť do súboru.
// Zámerne NEobsahuje sumy, mená, IČO ani výpisy – len to, čo používateľ sám napíše + technický kontext.

export type FeedbackKind = "problem" | "vypocet" | "ovladanie" | "data" | "navrh" | "ine";

export const KIND_LABEL: Record<FeedbackKind, string> = {
  problem: "Problém",
  vypocet: "Výpočet alebo daňové pravidlo",
  ovladanie: "Ovládanie a vzhľad",
  data: "Ukladanie / import / export",
  navrh: "Návrh",
  ine: "Iné",
};

/** krátky štítok do predmetu e-mailu (na filter v pošte) */
const KIND_TAG: Record<FeedbackKind, string> = {
  problem: "Problém",
  vypocet: "Výpočet",
  ovladanie: "Ovládanie",
  data: "Dáta",
  navrh: "Návrh",
  ine: "Iné",
};

export interface FeedbackDraft {
  id: string;
  kind: FeedbackKind;
  /** čo sa stalo / čo zlepšiť – jediné povinné pole */
  what: string;
  expected: string;
  /** pri chybe výpočtu: sumy, ktoré používateľ vedome uvedie */
  expectedAmount: string;
  appAmount: string;
  steps: string;
  /** odborná poznámka: rok, riadok DP, ustanovenie, zdroj */
  source: string;
  name: string;
  contact: string;
  /** odkiaľ bolo hlásenie otvorené (napr. „Chyba uloženia“) */
  origin?: string;
}

export interface FeedbackContext {
  appVersion: string;
  platform: "web" | "desktop";
  /** všeobecný systém (Windows / macOS / …), nie presná verzia */
  os: string;
  tab: string;
  year: number;
  profile: string;
  paramsDate?: string;
  /** očistený chybový kód/text (bez ciest a údajov) */
  error?: string;
}

export const FEEDBACK_FORMAT = 1;

export const newDraft = (kind: FeedbackKind = "problem", origin?: string): FeedbackDraft => ({
  id: randomId(),
  kind,
  what: "",
  expected: "",
  expectedAmount: "",
  appAmount: "",
  steps: "",
  source: "",
  name: "",
  contact: "",
  origin,
});

/** krátke náhodné ID hlásenia (nie identifikátor osoby ani zariadenia) */
export function randomId(): string {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return "DK-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Všeobecný systém z user agenta (bez verzie). */
export function osName(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "iný";
}

/**
 * Chybový text bez ciest k súborom, e-mailov, IBAN-ov, IČO a dlhých čísel (môžu identifikovať klienta).
 * Je to len poistka – do kontextu sa dávajú hlavne naše vlastné hlášky.
 */
export function scrubError(s: string): string {
  return s
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[cesta]")
    .replace(/(?:\/[\w.-]+){2,}/g, "[cesta]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g, "[IBAN]")
    .replace(/\d[\d\s.,]{4,}\d/g, "[číslo]")
    .slice(0, 300);
}

export const isEmpty = (d: FeedbackDraft) => d.what.trim() === "";

/** Predmet e-mailu: [Daňová kalkulačka][Typ][ID] stručný popis */
export function subject(d: FeedbackDraft): string {
  const first = d.what.trim().split(/\r?\n/)[0].replace(/\s+/g, " ");
  const short = first.length > 60 ? first.slice(0, 57) + "…" : first;
  return `[Daňová kalkulačka][${KIND_TAG[d.kind]}][${d.id}] ${short || "Hlásenie"}`;
}

/** Celý text hlásenia – presne to, čo uvidí používateľ v náhľade. */
export function reportText(d: FeedbackDraft, c: FeedbackContext): string {
  const lines: string[] = [];
  const add = (label: string, v: string) => {
    if (v.trim()) lines.push(`${label}:\n${v.trim()}`, "");
  };
  lines.push(`Typ: ${KIND_LABEL[d.kind]}`, "");
  add("Čo sa stalo / čo zlepšiť", d.what);
  add("Čo som očakával/a", d.expected);
  if (d.kind === "vypocet") {
    add("Očakávaná suma", d.expectedAmount);
    add("Suma z aplikácie", d.appAmount);
  }
  add("Ako to zopakovať", d.steps);
  add("Odborná poznámka / zdroj", d.source);
  add("Meno", d.name);
  add("Kontakt na odpoveď", d.contact);
  lines.push(
    "— Technické údaje (bez daňových údajov) —",
    `ID hlásenia: ${d.id}`,
    `Formát hlásenia: ${FEEDBACK_FORMAT}`,
    `Verzia aplikácie: ${c.appVersion} (${c.platform === "desktop" ? "desktop" : "web"}, ${c.os})`,
    `Sekcia: ${c.tab}${d.origin ? ` · ${d.origin}` : ""}`,
    `Rok a typ výpočtu: ${c.year}, ${c.profile}`,
  );
  if (c.paramsDate) lines.push(`Sadzby z: ${c.paramsDate.slice(0, 10)}`);
  if (c.error) lines.push(`Chyba: ${scrubError(c.error)}`);
  return lines.join("\n");
}

/** Maximálna rozumná dĺžka mailto odkazu (niektoré poštové aplikácie dlhší orežú). */
export const MAILTO_MAX = 1800;

/**
 * mailto odkaz. Pri dlhom texte vráti `tooLong: true` a telo len s výzvou vložiť text zo schránky.
 */
export function mailtoUrl(to: string, d: FeedbackDraft, c: FeedbackContext): { url: string; tooLong: boolean } {
  const enc = encodeURIComponent;
  const full = `mailto:${to}?subject=${enc(subject(d))}&body=${enc(reportText(d, c))}`;
  if (full.length <= MAILTO_MAX) return { url: full, tooLong: false };
  const short = `Hlásenie ${d.id} je dlhé – text som skopíroval/a, vložte ho sem (Ctrl+V / Cmd+V).`;
  return { url: `mailto:${to}?subject=${enc(subject(d))}&body=${enc(short)}`, tooLong: true };
}

// Kontakt na vlastníka. Poskladaný z kúskov, aby ho v zdrojáku nenašli zberače adries;
// vo formulári sa nezobrazuje (uvidí ho až poštová aplikácia).
const C = ["switch", "raven", "gmail", "com"];
export const feedbackAddress = () => `${C[0]}${C[1]}@${C[2]}.${C[3]}`;

/** prečistí uložený koncept (z data.json) */
export function normalizeDraft(raw: unknown): FeedbackDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const kind = (Object.keys(KIND_LABEL) as FeedbackKind[]).includes(r.kind as FeedbackKind) ? (r.kind as FeedbackKind) : "problem";
  const d: FeedbackDraft = {
    id: /^DK-[0-9A-F]{8}$/.test(s(r.id)) ? s(r.id) : randomId(),
    kind,
    what: s(r.what),
    expected: s(r.expected),
    expectedAmount: s(r.expectedAmount),
    appAmount: s(r.appAmount),
    steps: s(r.steps),
    source: s(r.source),
    name: s(r.name),
    contact: s(r.contact),
    origin: typeof r.origin === "string" ? r.origin : undefined,
  };
  return d;
}
