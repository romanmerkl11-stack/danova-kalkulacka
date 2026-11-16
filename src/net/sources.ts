// Konektory na verejné zdroje.

import type { ParamSet } from "../params/types";
import type { Company } from "../store/storage";
import { netFetch } from "./net";
import { validateParamSet } from "../params/validate";

/* eslint-disable @typescript-eslint/no-explicit-any */

const latest = <T extends { validFrom?: string; validTo?: string }>(xs: T[] | undefined): T | undefined => {
  if (!Array.isArray(xs) || xs.length === 0) return undefined;
  const active = xs.filter((x) => !x.validTo);
  const pool = active.length ? active : xs;
  return [...pool].sort((a, b) => String(b.validFrom ?? "").localeCompare(String(a.validFrom ?? "")))[0];
};

const rpoResults = (json: any): any[] => (Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : json ? [json] : []);

/** Prevedie odpoveď RPO API na údaje firmy. Exportované kvôli testom. */
export function parseRpo(ico: string, json: any): Company | null {
  const results = rpoResults(json);
  const e = results.find((r) => Array.isArray(r?.identifiers) && r.identifiers.some((i: any) => String(i?.value) === ico)) ?? results[0];
  if (!e) return null;
  return parseRpoEntry(ico, e);
}

/** Výsledky hľadania podľa obchodného mena: aktuálne názvy, ktoré obsahujú hľadaný text, idú prvé. Exportované kvôli testom. */
export function parseRpoSearch(query: string, json: any): Company[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(query.trim());
  const out: Company[] = [];
  for (const e of rpoResults(json)) {
    if (e?.termination) continue;
    const ico = String(latest<any>(e?.identifiers)?.value ?? "");
    const c = ico ? parseRpoEntry(ico, e) : null;
    if (c && !out.some((x) => x.ico === c.ico)) out.push(c);
  }
  const score = (c: Company) => (norm(c.name).startsWith(q) ? 0 : norm(c.name).includes(q) ? 1 : 2);
  return out.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "sk"));
}

function parseRpoEntry(ico: string, e: any): Company | null {
  const name = latest<any>(e.fullNames)?.value;
  if (!name) return null;
  const a = latest<any>(e.addresses);
  const address = a
    ? [
        [a.street ?? "", [a.regNumber, a.buildingNumber].filter((x: any) => x && x !== 0).join("/")].filter(Boolean).join(" "),
        [Array.isArray(a.postalCodes) ? a.postalCodes[0] : a.postalCode, a.municipality?.value].filter(Boolean).join(" "),
      ]
        .filter((x) => x.trim())
        .join(", ")
    : undefined;
  const lf = latest<any>(e.legalForms);
  const activities: string[] = Array.isArray(e.activities)
    ? e.activities.filter((a: any) => !a?.validTo && a?.economicActivityDescription).map((a: any) => String(a.economicActivityDescription))
    : [];
  const main = e.statisticalCodes?.mainActivity;
  return {
    ico,
    name,
    address,
    legalForm: lf?.value?.value ?? lf?.value,
    nace: main ? [main.code, main.value].filter(Boolean).join(" ") : undefined,
    established: e.establishment,
    rpoId: typeof e.id === "number" ? e.id : undefined,
    activities: activities.length ? activities : undefined,
    fetchedFrom: "Register právnických osôb (api.statistics.sk)",
    fetchedAt: new Date().toISOString(),
  };
}

export function validIco(ico: string): boolean {
  return /^\d{8}$/.test(ico);
}

export async function lookupCompany(ico: string): Promise<Company | null> {
  const url = `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`;
  const res = await netFetch({
    source: "rpo",
    purpose: `Zistiť obchodné meno, adresu, právnu formu, SK NACE a predmety podnikania pre IČO ${ico} (vyhľadanie a potom detail subjektu)`,
    url,
    sends: `IČO ${ico}`,
  });
  if (!res.ok) throw new Error(`Register odpovedal chybou ${res.status}.`);
  const basic = parseRpo(ico, await res.json());
  return basic ? withDetail(basic) : null;
}

/** Doplní právnu formu, SK NACE a predmety podnikania z detailu subjektu (vyhľadávanie ich nevracia). Pri chybe vráti pôvodné údaje. */
export async function withDetail(c: Company): Promise<Company> {
  if (!c.rpoId) return c;
  try {
    const res = await netFetch({
      source: "rpo",
      purpose: `Načítať detail subjektu ${c.name}`,
      url: `https://api.statistics.sk/rpo/v1/entity/${c.rpoId}?showHistoricalData=false&showOrganizationUnits=false`,
      sends: `interné číslo subjektu v registri (${c.rpoId})`,
      followUp: true,
    });
    if (!res.ok) return c;
    const d = parseRpo(c.ico, await res.json());
    return d ? { ...c, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } : c;
  } catch {
    return c;
  }
}

/** Hľadanie v RPO podľa obchodného mena (len nezaniknuté subjekty). */
export async function searchCompanies(name: string): Promise<Company[]> {
  const q = name.trim();
  const url = `https://api.statistics.sk/rpo/v1/search?fullName=${encodeURIComponent(q)}&onlyActive=true`;
  const res = await netFetch({
    source: "rpo",
    purpose: `Nájsť podnikateľov a firmy, ktorých obchodné meno obsahuje „${q}“ (po výbere sa načíta aj detail subjektu)`,
    url,
    sends: `hľadaný text „${q}“`,
  });
  if (!res.ok) throw new Error(`Register odpovedal chybou ${res.status}.`);
  return parseRpoSearch(q, await res.json()).slice(0, 30);
}

/** Odkazy na registre, ktoré nemajú API – otvoria sa v prehliadači. */
export const registryLinks = (ico: string) => [
  { label: "Živnostenský register (ZRSR)", url: `https://www.zrsr.sk/zr_ico.aspx?ico=${ico}` },
  { label: "Obchodný register (ORSR)", url: `https://www.orsr.sk/hladaj_ico.asp?ICO=${ico}&SID=0` },
  { label: "Finančná správa – zoznamy", url: `https://www.financnasprava.sk/sk/elektronicke-sluzby/verejne-sluzby/zoznamy` },
  { label: "Register právnických osôb", url: `https://rpo.statistics.sk/rpo/#search?ico=${ico}` },
];

export interface ParamsUpdate {
  publishedAt?: string;
  years: ParamSet;
}

export async function fetchParamsUpdate(url: string): Promise<ParamsUpdate> {
  const res = await netFetch({
    source: "params",
    purpose: "Stiahnuť aktuálne sadzby daní a odvodov (jeden súbor s hodnotami, dátumami účinnosti a zdrojmi)",
    url,
    sends: "nič (len požiadavka na súbor)",
  });
  if (!res.ok) throw new Error(`Súbor so sadzbami sa nepodarilo stiahnuť (${res.status}).`);
  const json = await res.json();
  const years: unknown = json?.years ?? json;
  // podrobná kontrola (sumy, sadzby, pásma, dátumy) ešte pred ponúknutím na prijatie
  const problems = validateParamSet(years);
  if (problems.length > 0) throw new Error(`Stiahnuté sadzby sú neplatné, appka ich neprijme:\n${problems.join("\n")}`);
  const publishedAt = typeof json?.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(json.publishedAt) ? json.publishedAt : undefined;
  return { publishedAt, years: years as ParamSet };
}

export interface ReleaseInfo {
  version: string;
  /** stránka vydania na GitHube */
  url: string;
  /** priamy odkaz na inštalátor .exe (ak je vo vydaní) */
  downloadUrl?: string;
  notes: string;
}

export async function checkAppUpdate(repo: string): Promise<ReleaseInfo | null> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await netFetch({ source: "appUpdate", purpose: "Zistiť, či je k dispozícii nová verzia aplikácie", url, sends: "nič" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub odpovedal ${res.status}.`);
  const j = await res.json();
  const exe = Array.isArray(j.assets) ? j.assets.find((a: any) => typeof a?.name === "string" && /\.exe$/i.test(a.name)) : undefined;
  return { version: String(j.tag_name ?? "").replace(/^v/, ""), url: j.html_url, downloadUrl: exe?.browser_download_url, notes: j.body ?? "" };
}
