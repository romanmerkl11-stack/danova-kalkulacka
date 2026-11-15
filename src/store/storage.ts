// Lokálne úložisko. V desktopovej appke (Tauri) je to jeden súbor data.json v priečinku aplikácie
// (napr. C:\Users\<meno>\AppData\Roaming\sk.danovakalkulacka\data.json). V prehliadači localStorage.
// Nič sa neodosiela na internet.

import type { CalcInput } from "../engine/types";
import type { ParamSet } from "../params/types";
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
  title: string;
  year: number;
  createdAt: string;
  updatedAt: string;
  input: CalcInput;
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
  netLog: NetLogEntry[];
  lastInput?: CalcInput;
  /** naposledy použité IČO */
  lastIco?: string;
  /** naučené pravidlá pre triedenie pohybov z výpisu z účtu */
  bankRules?: BankRule[];
  /** stav záložky Rýchly výpočet */
  quick?: { year: number; income: number; expenses: number | null; spH1?: number | null; spH2?: number | null; zp?: number | null };
}

export const DEFAULT_SETTINGS: Settings = {
  neverAsk: false,
  offline: false,
  alwaysAllow: {},
  checkParamsOnStart: false,
  checkUpdatesOnStart: false,
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
const withRealRepo = (st: Settings): Settings => ({
  ...st,
  paramsUrl: st.paramsUrl.includes("OWNER") ? DEFAULT_SETTINGS.paramsUrl : st.paramsUrl,
  updateRepo: st.updateRepo.includes("OWNER") ? DEFAULT_SETTINGS.updateRepo : st.updateRepo,
});

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function normalize(raw: unknown): AppData {
  const d = emptyData();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<AppData>;
  return {
    version: 1,
    companies: Array.isArray(r.companies) ? r.companies : [],
    calcs: Array.isArray(r.calcs) ? r.calcs : [],
    settings: withRealRepo({ ...DEFAULT_SETTINGS, ...(r.settings ?? {}) }),
    acceptedParams: r.acceptedParams && typeof r.acceptedParams === "object" ? r.acceptedParams : {},
    netLog: Array.isArray(r.netLog) ? r.netLog.slice(-500) : [],
    lastInput: r.lastInput,
    lastIco: typeof r.lastIco === "string" ? r.lastIco : undefined,
    bankRules: Array.isArray(r.bankRules) ? r.bankRules : [],
    quick:
      r.quick && typeof r.quick === "object" && Number.isFinite(r.quick.year) && Number.isFinite(r.quick.income)
        ? {
            year: r.quick.year,
            income: r.quick.income,
            expenses: numOrNull(r.quick.expenses),
            spH1: numOrNull(r.quick.spH1),
            spH2: numOrNull(r.quick.spH2),
            zp: numOrNull(r.quick.zp),
          }
        : undefined,
  };
}

export async function loadData(): Promise<AppData> {
  try {
    if (isTauri()) {
      const fs = await import("@tauri-apps/plugin-fs");
      const opts = { baseDir: fs.BaseDirectory.AppData };
      if (!(await fs.exists(FILE, opts))) return emptyData();
      return normalize(JSON.parse(await fs.readTextFile(FILE, opts)));
    }
    const s = window.localStorage.getItem(LS_KEY);
    return s ? normalize(JSON.parse(s)) : emptyData();
  } catch (e) {
    console.error("Načítanie dát zlyhalo", e);
    return emptyData();
  }
}

let saveChain: Promise<void> = Promise.resolve();

export function saveData(data: AppData): Promise<void> {
  const json = JSON.stringify(data, null, 1);
  saveChain = saveChain.then(async () => {
    try {
      if (isTauri()) {
        const fs = await import("@tauri-apps/plugin-fs");
        const opts = { baseDir: fs.BaseDirectory.AppData };
        await fs.mkdir("", { ...opts, recursive: true }).catch(() => undefined);
        // zapíše do dočasného súboru a premenuje, aby sa pri páde nepoškodili dáta
        await fs.writeTextFile(FILE + ".tmp", json, opts);
        await fs.rename(FILE + ".tmp", FILE, { oldPathBaseDir: fs.BaseDirectory.AppData, newPathBaseDir: fs.BaseDirectory.AppData });
      } else {
        window.localStorage.setItem(LS_KEY, json);
      }
    } catch (e) {
      console.error("Uloženie dát zlyhalo", e);
    }
  });
  return saveChain;
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
