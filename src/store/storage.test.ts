import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BackupError,
  DEFAULT_SETTINGS,
  _resetStorageState,
  emptyData,
  loadData,
  makeBackup,
  normalize,
  parseBackup,
  resolveCorrupt,
  saveData,
  saveDataSyncWeb,
  type AppData,
} from "./storage";

const KEY = "danova-kalkulacka-data";

/** jednoduchý localStorage v pamäti; `failWrites` simuluje plné úložisko */
function fakeStorage() {
  const m = new Map<string, string>();
  const ls = {
    failWrites: false,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (ls.failWrites) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    map: m,
  };
  return ls;
}

let ls: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  ls = fakeStorage();
  vi.stubGlobal("window", { localStorage: ls });
  _resetStorageState();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const calc = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  ico: "",
  companyName: "Mama",
  title: "Výpočet 2026",
  year: 2026,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  input: { year: 2026 },
  summary: { income: 1, tax: 0, taxToPay: 0, sp: 0, zp: 0, net: 1 },
  ...over,
});
const sample = (): AppData => ({ ...emptyData(), calcs: [calc() as never], companies: [{ ico: "123", name: "Firma" }] });

describe("normalize", () => {
  it("neplatné nastavenia (null, zlé typy) nahradí predvolenými a nespadne", () => {
    const d = normalize({ settings: { paramsUrl: null, updateRepo: 5 } });
    expect(d.settings.paramsUrl).toBe(DEFAULT_SETTINGS.paramsUrl);
    expect(d.settings.updateRepo).toBe(DEFAULT_SETTINGS.updateRepo);
    expect(normalize({ settings: null }).settings.paramsUrl).toBe(DEFAULT_SETTINGS.paramsUrl);
    expect(normalize({ settings: [] }).settings.updateRepo).toBe(DEFAULT_SETTINGS.updateRepo);
  });
});

describe("normalize – vstupy výpočtov (F15)", () => {
  it("rozpracovaný aj uložený vstup sa prečistí", () => {
    const d = normalize({ lastInput: { year: 2025, income: { annual: "x" } }, calcs: [calc({ input: { year: 2026, dds: NaN } })] });
    expect(d.lastInput?.income.annual).toBe(0);
    expect(d.lastInput?.income.monthly).toHaveLength(12);
    expect(d.calcs[0].input.dds).toBe(0);
    expect(d.calcs[0].input.insurance.spPaid).toHaveLength(12);
  });
});

describe("loadData", () => {
  it("bez uložených dát vráti prázdne dáta", async () => {
    expect(await loadData()).toEqual({ status: "ok", data: emptyData() });
  });

  it("poškodené dáta ohlási a neprepíše ich prázdnymi", async () => {
    ls.map.set(KEY, "{nie je json");
    const r = await loadData();
    expect(r.status).toBe("corrupt");
    if (r.status !== "corrupt") return;
    expect(r.raw).toBe("{nie je json");
    expect(r.bak).toBeNull();
    // kým sa obnova nevyrieši, zápis je zablokovaný
    await expect(saveData(emptyData())).rejects.toThrow(/zablokovaný/);
    expect(saveDataSyncWeb(emptyData())).toBe(false);
    expect(ls.map.get(KEY)).toBe("{nie je json");
  });

  it("dáta, ktoré nie sú objekt (pole, číslo), sú poškodené", async () => {
    ls.map.set(KEY, "[1,2]");
    expect((await loadData()).status).toBe("corrupt");
  });

  it("pri poškodených dátach ponúkne platnú automatickú kópiu (.bak)", async () => {
    ls.map.set(KEY, "{");
    ls.map.set(KEY + "-bak", JSON.stringify(sample()));
    const r = await loadData();
    expect(r.status === "corrupt" && r.bak?.calcs.length).toBe(1);
  });

  it("po rozhodnutí sa poškodený obsah odloží a zápis sa povolí", async () => {
    ls.map.set(KEY, "{");
    await loadData();
    await resolveCorrupt("{");
    expect(ls.map.get(KEY + "-poskodene")).toBe("{");
    await saveData(sample());
    expect(JSON.parse(ls.map.get(KEY)!).calcs).toHaveLength(1);
    // pokazený obsah sa do .bak nedostane
    expect(ls.map.has(KEY + "-bak")).toBe(false);
  });
});

describe("saveData", () => {
  it("pred prvým prepisom uloží poslednú dobrú verziu do .bak", async () => {
    const old = JSON.stringify(sample());
    ls.map.set(KEY, old);
    await loadData();
    await saveData(emptyData());
    await saveData({ ...emptyData(), lastIco: "x" });
    expect(ls.map.get(KEY + "-bak")).toBe(old); // len raz za session
    expect(JSON.parse(ls.map.get(KEY)!).lastIco).toBe("x");
  });

  it("chybu zápisu vráti volajúcemu a ďalší zápis znova funguje", async () => {
    ls.failWrites = true;
    await expect(saveData(sample())).rejects.toThrow("QuotaExceededError");
    ls.failWrites = false;
    await expect(saveData(sample())).resolves.toBeUndefined();
    expect(ls.map.has(KEY)).toBe(true);
  });
});

describe("parseBackup", () => {
  it("prijme nový formát zálohy", () => {
    const d = parseBackup(JSON.parse(makeBackup(sample())));
    expect(d.calcs).toHaveLength(1);
    expect(d.companies[0].name).toBe("Firma");
  });

  it("prijme starú zálohu (holé dáta s version 1)", () => {
    expect(parseBackup(JSON.parse(JSON.stringify(sample()))).calcs).toHaveLength(1);
  });

  it("starú zálohu s paramsUrl: null prijme a opraví nastavenia", () => {
    const raw = { ...sample(), settings: { paramsUrl: null } };
    expect(parseBackup(raw).settings.paramsUrl).toBe(DEFAULT_SETTINGS.paramsUrl);
  });

  it.each([
    ["{}", {}],
    ["pole", []],
    ["null", null],
    ["iný súbor", { foo: 1 }],
    ["cudzí formát", { format: "iny", schema: 1, data: sample() }],
    ["nepodporovaná verzia zálohy", { format: "danova-kalkulacka-zaloha", schema: 2, data: sample() }],
    ["nepodporovaná verzia dát", { ...sample(), version: 2 }],
    ["chýbajúce výpočty", { version: 1, companies: [] }],
    ["výpočet bez id", { ...sample(), calcs: [calc({ id: undefined })] }],
    ["výpočet bez vstupu", { ...sample(), calcs: [calc({ input: null })] }],
    ["výpočet so zlým rokom", { ...sample(), calcs: [calc({ year: "2026" })] }],
    ["výpočet ako text", { ...sample(), calcs: ["x"] }],
    ["firma bez IČO", { ...sample(), companies: [{ name: "X" }] }],
    ["neplatné nastavenia", { ...sample(), settings: "x" }],
  ])("odmietne: %s", (_n, raw) => {
    expect(() => parseBackup(raw)).toThrow(BackupError);
  });

  it("chybová správa pomenuje problémový výpočet", () => {
    expect(() => parseBackup({ ...sample(), calcs: [calc(), calc({ id: "c2", input: 1 })] })).toThrow(/Výpočet č. 2/);
  });
});
