// Lokálne úložisko. V desktopovej appke (Tauri) je to jeden súbor data.json v priečinku aplikácie
// (napr. C:\Users\<meno>\AppData\Roaming\sk.danovakalkulacka\data.json). V prehliadači localStorage.
// Nič sa neodosiela na internet.

import type { CalcInput } from "../engine/types";
import { sanitizeInput } from "../engine/sanitize";
import { normalizeDraft, type FeedbackDraft } from "../feedback/report";
import type { ParamSet, YearParams } from "../params/types";
import type { BankRule } from "../bank/types";

export interface Company {
  ico: string;
  name: string;
  address?: string;
  legalForm?: string;
  nace?: string;
  established?: string;
  dic?: string;
  /** interné id v Registri právnických osôb (pre načítanie detailu) */
  rpoId?: number;
  /** predmety podnikania (živnosti) */
  activities?: string[];
  /** odkiaľ a kedy sa údaje doťahovali */
  fetchedFrom?: string;
  fetchedAt?: string;
}

export interface SavedCalc {
  id: string;
  ico: string;
  companyName: string;
  /** názov, pod ktorým sa výpočet ukladá (anonymne, napr. „Mama“) */
  nickname?: string;
  title: string;
  year: number;
  createdAt: string;
  updatedAt: string;
  input: CalcInput;
  /** sadzby roka výpočtu v čase uloženia (staršie uloženia ich nemajú) */
  params?: YearParams;
  /** sadzby nasledujúceho roka (budúce odvody), ak boli známe */
  paramsNext?: YearParams;
  /** dátum týchto sadzieb (PARAMS_DATE alebo dátum prijatej aktualizácie) */
  paramsDate?: string;
  /** verzia aplikácie pri uložení */
  appVersion?: string;
  /** stručný výsledok pre prehľad histórie */
  summary: { income: number; tax: number; taxToPay: number; sp: number; zp: number; net: number };
}

export type SourceId = "rpo" | "params" | "appUpdate";

export interface Settings {
  /** nepýtať sa pred prístupom na internet (pre všetky zdroje) */
  neverAsk: boolean;
  /** úplne offline – žiadne požiadavky */
  offline: boolean;
  /** zdroje povolené natrvalo */
  alwaysAllow: Partial<Record<SourceId, boolean>>;
  /** pri štarte skontrolovať nové sadzby (stále podľa povolení) */
  checkParamsOnStart: boolean;
  checkUpdatesOnStart: boolean;
  /** adresa kurátorovaného súboru sadzieb */
  paramsUrl: string;
  /** GitHub repozitár pre aktualizácie appky (owner/repo) */
  updateRepo: string;
  /** poradie a viditeľnosť kariet na záložke Výpočet (výsledkový stĺpec) */
  calcLayout?: { id: string; visible: boolean }[];
}

export interface NetLogEntry {
  at: string;
  source: SourceId;
  url: string;
  sent: string;
  result: "ok" | "chyba" | "zamietnuté";
  detail?: string;
}

export interface AppData {
  version: 1;
  companies: Company[];
  calcs: SavedCalc[];
  settings: Settings;
  /** sadzby prijaté používateľom (prepisujú zabalené) */
  acceptedParams: ParamSet;
  /** dátum zverejnenia prijatých sadzieb (publishedAt) */
  acceptedParamsDate?: string;
  netLog: NetLogEntry[];
  lastInput?: CalcInput;
  /** naposledy použité IČO */
  lastIco?: string;
  /** naposledy použitý názov */
  lastNickname?: string;
  /** skutočné výdavky zadané v záložke Poradca (nemení výpočet) */
  advisorActualExpenses?: number;
  /** rozpísané hlásenie spätnej väzby (zostane do odoslania alebo zahodenia) */
  feedbackDraft?: FeedbackDraft;
  /** naučené pravidlá pre triedenie pohybov z výpisu z účtu */
  bankRules?: BankRule[];
  /** stav záložky Rýchly výpočet */
  quick?: {
    year: number;
    income: number;
    expenses: number | null;
    spH1?: number | null;
    spH2?: number | null;
    zp?: number | null;
    profile?: "szco" | "zamestnanec" | "oboje";
    empGross?: number | null;
    empInsurance?: number | null;
    empWithheld?: number | null;
    rentMonthly?: number | null;
    rentMonths?: number | null;
    rentExpenses?: number | null;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  neverAsk: false,
  offline: false,
  alwaysAllow: {},
  checkParamsOnStart: false,
  checkUpdatesOnStart: true,
  paramsUrl: "https://raw.githubusercontent.com/romanmerkl11-stack/danova-kalkulacka/main/params/params.json",
  updateRepo: "romanmerkl11-stack/danova-kalkulacka",
};

export const emptyData = (): AppData => ({
  version: 1,
  companies: [],
  calcs: [],
  settings: { ...DEFAULT_SETTINGS },
  acceptedParams: {},
  netLog: [],
});

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const LS_KEY = "danova-kalkulacka-data";
const FILE = "data.json";

/** staré uložené nastavenia mali namiesto repa zástupný text „OWNER“ → nahradiť predvoleným */
/** (aj neplatné hodnoty – napr. null zo zálohy – nahradí predvolenými) */
const withRealRepo = (st: Settings): Settings => ({
  ...st,
  paramsUrl: typeof st.paramsUrl === "string" && !st.paramsUrl.includes("OWNER") ? st.paramsUrl : DEFAULT_SETTINGS.paramsUrl,
  updateRepo: typeof st.updateRepo === "string" && !st.updateRepo.includes("OWNER") ? st.updateRepo : DEFAULT_SETTINGS.updateRepo,
});

const cleanLayout = (st: Settings): Settings => {
  const l = st.calcLayout;
  if (l === undefined) return st;
  const ok = Array.isArray(l) ? l.filter((x) => x && typeof x.id === "string" && typeof x.visible === "boolean") : [];
  return { ...st, calcLayout: ok.length > 0 ? ok : undefined };
};

const thisYear = () => new Date().getFullYear();
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function normalize(raw: unknown): AppData {
  const d = emptyData();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<AppData>;
  return {
    version: 1,
    companies: Array.isArray(r.companies) ? r.companies : [],
    // vstupy výpočtov prečistené (chýbajúce polia zo staršej verzie, neplatné čísla)
    calcs: Array.isArray(r.calcs)
      ? r.calcs.map((c) => (c && typeof c === "object" ? { ...c, input: sanitizeInput(c.input, Number.isInteger(c.year) ? c.year : thisYear()) } : c))
      : [],
    settings: cleanLayout(withRealRepo({ ...DEFAULT_SETTINGS, ...(r.settings && typeof r.settings === "object" && !Array.isArray(r.settings) ? r.settings : {}) })),
    acceptedParams: r.acceptedParams && typeof r.acceptedParams === "object" ? r.acceptedParams : {},
    acceptedParamsDate: typeof r.acceptedParamsDate === "string" ? r.acceptedParamsDate : undefined,
    netLog: Array.isArray(r.netLog) ? r.netLog.slice(-500) : [],
    lastInput: r.lastInput && typeof r.lastInput === "object" ? sanitizeInput(r.lastInput, thisYear()) : undefined,
    lastIco: typeof r.lastIco === "string" ? r.lastIco : undefined,
    lastNickname: typeof r.lastNickname === "string" ? r.lastNickname : undefined,
    bankRules: Array.isArray(r.bankRules) ? r.bankRules : [],
    feedbackDraft: normalizeDraft(r.feedbackDraft),
    advisorActualExpenses: typeof r.advisorActualExpenses === "number" && Number.isFinite(r.advisorActualExpenses) && r.advisorActualExpenses >= 0 ? r.advisorActualExpenses : undefined,
    quick:
      r.quick && typeof r.quick === "object" && Number.isFinite(r.quick.year) && Number.isFinite(r.quick.income)
        ? {
            year: r.quick.year,
            income: r.quick.income,
            expenses: numOrNull(r.quick.expenses),
            spH1: numOrNull(r.quick.spH1),
            spH2: numOrNull(r.quick.spH2),
            zp: numOrNull(r.quick.zp),
            profile: r.quick.profile === "zamestnanec" || r.quick.profile === "oboje" ? r.quick.profile : "szco",
            empGross: numOrNull(r.quick.empGross),
            empInsurance: numOrNull(r.quick.empInsurance),
            empWithheld: numOrNull(r.quick.empWithheld),
            rentMonthly: numOrNull(r.quick.rentMonthly),
            rentMonths: numOrNull(r.quick.rentMonths),
            rentExpenses: numOrNull(r.quick.rentExpenses),
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Načítanie a zápis. Zásady:
// - poškodené / nečitateľné dáta sa NIKDY neprepíšu prázdnymi (appka ukáže obrazovku obnovy),
// - pred prvým prepisom v session sa posledná dobrá verzia skopíruje do zálohy (.bak),
// - chyba zápisu sa vráti volajúcemu (UI ju ukáže), nič sa neprehltne.

const BAK = FILE + ".bak";
const LS_BAK = LS_KEY + "-bak";

export type LoadResult =
  | { status: "ok"; data: AppData }
  | {
      status: "corrupt";
      /** pôvodný obsah (na uloženie do súboru); prázdny, ak sa nedal ani prečítať */
      raw: string;
      error: string;
      /** automatická kópia poslednej dobrej verzie, ak existuje a je platná */
      bak: AppData | null;
    };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Rozparsuje uložené dáta; vyhodí chybu, ak to nie je objekt s dátami appky. */
export function parseStored(text: string): AppData {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("súbor neobsahuje dáta aplikácie");
  return normalize(raw);
}

const tryParse = (text: string | null): AppData | null => {
  if (!text) return null;
  try {
    return parseStored(text);
  } catch {
    return null;
  }
};

/** kým sa nevyrieši obrazovka obnovy, zápis je zablokovaný (ochrana pred prepisom) */
let writeBlocked = false;
/** pred prvým prepisom v tejto session sa pôvodný súbor skopíruje do .bak */
let bakDone = false;

export async function loadData(): Promise<LoadResult> {
  let text: string | null = null;
  let bakText: string | null = null;
  try {
    if (isTauri()) {
      const fs = await import("@tauri-apps/plugin-fs");
      const opts = { baseDir: fs.BaseDirectory.AppData };
      if (await fs.exists(FILE, opts)) text = await fs.readTextFile(FILE, opts);
      if (await fs.exists(BAK, opts).catch(() => false)) bakText = await fs.readTextFile(BAK, opts).catch(() => null);
    } else {
      text = window.localStorage.getItem(LS_KEY);
      bakText = window.localStorage.getItem(LS_BAK);
    }
  } catch (e) {
    console.error("Načítanie dát zlyhalo", e);
    writeBlocked = true;
    return { status: "corrupt", raw: text ?? "", error: `Dáta sa nepodarilo prečítať: ${errText(e)}`, bak: tryParse(bakText) };
  }
  if (text === null || text.trim() === "") {
    // prázdny súbor nie je bežný stav – ak existuje .bak, ponúkni obnovu
    const bak = tryParse(bakText);
    if (text !== null && bak) {
      writeBlocked = true;
      return { status: "corrupt", raw: text, error: "Súbor s dátami je prázdny.", bak };
    }
    return { status: "ok", data: emptyData() };
  }
  try {
    return { status: "ok", data: parseStored(text) };
  } catch (e) {
    console.error("Dáta sú poškodené", e);
    writeBlocked = true;
    return { status: "corrupt", raw: text, error: `Dáta sú poškodené (${errText(e)}).`, bak: tryParse(bakText) };
  }
}

/**
 * Používateľ na obrazovke obnovy rozhodol, čím pokračovať → zápis sa povolí.
 * Poškodený pôvodný obsah sa predtým odloží vedľa (data.poskodene-….json / localStorage), nič sa nestratí.
 */
export async function resolveCorrupt(raw: string): Promise<void> {
  if (raw.trim() !== "") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (isTauri()) {
      const fs = await import("@tauri-apps/plugin-fs");
      const opts = { baseDir: fs.BaseDirectory.AppData };
      await fs.mkdir("", { ...opts, recursive: true }).catch(() => undefined);
      await fs.writeTextFile(`data.poskodene-${stamp}.json`, raw, opts);
    } else {
      window.localStorage.setItem(`${LS_KEY}-poskodene`, raw);
    }
  }
  writeBlocked = false;
  // pokazený súbor sa do .bak nekopíruje (kópia sa robí len z platných dát)
  bakDone = false;
}

async function writeNow(json: string): Promise<void> {
  if (writeBlocked) throw new Error("zápis je zablokovaný, kým sa nevyrieši obnova poškodených dát");
  if (isTauri()) {
    const fs = await import("@tauri-apps/plugin-fs");
    const opts = { baseDir: fs.BaseDirectory.AppData };
    const both = { oldPathBaseDir: fs.BaseDirectory.AppData, newPathBaseDir: fs.BaseDirectory.AppData };
    await fs.mkdir("", { ...opts, recursive: true }).catch(() => undefined);
    if (!bakDone) {
      // posledná dobrá verzia → data.json.bak (len ak je platná)
      if (await fs.exists(FILE, opts)) {
        const old = await fs.readTextFile(FILE, opts);
        if (tryParse(old)) await fs.writeTextFile(BAK, old, opts);
      }
      bakDone = true;
    }
    // zapíše do dočasného súboru a premenuje, aby sa pri páde nepoškodili dáta
    await fs.writeTextFile(FILE + ".tmp", json, opts);
    await fs.rename(FILE + ".tmp", FILE, both);
  } else {
    const ls = window.localStorage;
    if (!bakDone) {
      const old = ls.getItem(LS_KEY);
      if (old && tryParse(old)) ls.setItem(LS_BAK, old);
      bakDone = true;
    }
    ls.setItem(LS_KEY, json);
  }
}

let saveChain: Promise<void> = Promise.resolve();

/** Uloží dáta. Promise sa zamietne, ak zápis zlyhá (UI ukáže chybu). Zápisy idú za sebou. */
export function saveData(data: AppData): Promise<void> {
  const json = JSON.stringify(data, null, 1);
  const p = saveChain.catch(() => undefined).then(() => writeNow(json));
  saveChain = p.catch((e) => console.error("Uloženie dát zlyhalo", e));
  return p;
}

/** Okamžitý (synchrónny) zápis v prehliadači – pri zatváraní stránky, keď sa už nedá čakať. */
export function saveDataSyncWeb(data: AppData): boolean {
  if (isTauri() || writeBlocked) return false;
  try {
    const ls = window.localStorage;
    if (!bakDone) {
      const old = ls.getItem(LS_KEY);
      if (old && tryParse(old)) ls.setItem(LS_BAK, old);
      bakDone = true;
    }
    ls.setItem(LS_KEY, JSON.stringify(data, null, 1));
    return true;
  } catch (e) {
    console.error("Uloženie dát zlyhalo", e);
    return false;
  }
}

/** len pre testy */
export function _resetStorageState() {
  writeBlocked = false;
  bakDone = false;
  saveChain = Promise.resolve();
}

// ---------------------------------------------------------------------------
// Záloha do súboru – verzovaný formát, prísna kontrola pred nahradením dát.

export const BACKUP_FORMAT = "danova-kalkulacka-zaloha";
export const BACKUP_SCHEMA = 1;

export function makeBackup(data: AppData): string {
  return JSON.stringify({ format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, exportedAt: new Date().toISOString(), data }, null, 1);
}

export class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Overí zálohu (nový formát aj staré zálohy = holé dáta s version: 1) a vráti dáta.
 * Pri čomkoľvek podozrivom vyhodí BackupError so zrozumiteľným popisom – súčasné dáta sa nemenia.
 */
export function parseBackup(raw: unknown): AppData {
  if (!isObj(raw)) throw new BackupError("Súbor nie je záloha Daňovej kalkulačky.");
  let d: unknown;
  if ("format" in raw || "schema" in raw) {
    if (raw.format !== BACKUP_FORMAT) throw new BackupError("Súbor nie je záloha Daňovej kalkulačky.");
    if (raw.schema !== BACKUP_SCHEMA)
      throw new BackupError(`Záloha má nepodporovanú verziu (${String(raw.schema)}). Aktualizujte aplikáciu.`);
    d = raw.data;
  } else {
    d = raw;
  }
  if (!isObj(d)) throw new BackupError("Záloha neobsahuje dáta.");
  if (d.version !== 1) throw new BackupError(d.version === undefined ? "Súbor nie je záloha Daňovej kalkulačky." : `Záloha má nepodporovanú verziu dát (${String(d.version)}).`);
  if (!Array.isArray(d.calcs) || !Array.isArray(d.companies)) throw new BackupError("Záloha je neúplná (chýbajú výpočty alebo firmy).");
  d.calcs.forEach((c, i) => {
    const n = `Výpočet č. ${i + 1}`;
    if (!isObj(c)) throw new BackupError(`${n} v zálohe je neplatný.`);
    if (typeof c.id !== "string" || c.id === "") throw new BackupError(`${n} v zálohe nemá identifikátor.`);
    if (typeof c.title !== "string") throw new BackupError(`${n} v zálohe nemá názov.`);
    if (typeof c.year !== "number" || !Number.isInteger(c.year)) throw new BackupError(`${n} („${c.title}“) v zálohe nemá platný rok.`);
    if (!isObj(c.input) || typeof c.input.year !== "number") throw new BackupError(`${n} („${c.title}“) v zálohe nemá platné údaje výpočtu.`);
    if (!isObj(c.summary)) throw new BackupError(`${n} („${c.title}“) v zálohe nemá súhrn.`);
  });
  d.companies.forEach((c, i) => {
    if (!isObj(c) || typeof c.ico !== "string" || typeof c.name !== "string")
      throw new BackupError(`Firma č. ${i + 1} v zálohe je neplatná (chýba IČO alebo názov).`);
  });
  if (d.settings !== undefined && !isObj(d.settings)) throw new BackupError("Nastavenia v zálohe sú neplatné.");
  if (d.lastInput !== undefined && d.lastInput !== null && !isObj(d.lastInput)) throw new BackupError("Rozpracovaný výpočet v zálohe je neplatný.");
  return normalize(d);
}

/**
 * Bezpečnostná kópia súčasných dát pred obnovou zo zálohy.
 * Desktop: data.pred-obnovou.json v priečinku aplikácie; prehliadač: stiahne súbor. Vráti popis, kde je.
 */
export async function saveSafetyCopy(data: AppData): Promise<string> {
  const json = makeBackup(data);
  if (isTauri()) {
    const fs = await import("@tauri-apps/plugin-fs");
    const opts = { baseDir: fs.BaseDirectory.AppData };
    await fs.mkdir("", { ...opts, recursive: true }).catch(() => undefined);
    await fs.writeTextFile("data.pred-obnovou.json", json, opts);
    return "v priečinku aplikácie (data.pred-obnovou.json)";
  }
  const name = `danova-kalkulacka-pred-obnovou-${new Date().toISOString().slice(0, 10)}.json`;
  await saveFileAs(name, json, "Záloha", "json");
  return `v stiahnutých súboroch (${name})`;
}

/** Uloží súbor, ktorý si používateľ vyberie (export, záloha). */
export async function saveFileAs(defaultName: string, content: Uint8Array | string, filterName: string, ext: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: defaultName, filters: [{ name: filterName, extensions: [ext] }] });
    if (!path) return false;
    const fs = await import("@tauri-apps/plugin-fs");
    if (typeof content === "string") await fs.writeTextFile(path, content);
    else await fs.writeFile(path, content);
    return true;
  }
  const blob = new Blob([typeof content === "string" ? content : (content.slice().buffer as ArrayBuffer)]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

/** Otvorí súbor, ktorý si používateľ vyberie (import, obnova zálohy). */
export async function openFile(filterName: string, exts: string[]): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: filterName, extensions: exts }] });
    if (!path || Array.isArray(path)) return null;
    const fs = await import("@tauri-apps/plugin-fs");
    return { name: String(path).split(/[\\/]/).pop() ?? "subor", bytes: await fs.readFile(path) };
  }
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = exts.map((e) => "." + e).join(",");
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    };
    inp.click();
  });
}
