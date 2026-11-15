// Konektory na verejné zdroje.

import type { ParamSet, YearParams } from "../params/types";
import type { Company } from "../store/storage";
import { netFetch } from "./net";

/* eslint-disable @typescript-eslint/no-explicit-any */

const latest = <T extends { validFrom?: string; validTo?: string }>(xs: T[] | undefined): T | undefined => {
  if (!Array.isArray(xs) || xs.length === 0) return undefined;
  const active = xs.filter((x) => !x.validTo);
  const pool = active.length ? active : xs;
  return [...pool].sort((a, b) => String(b.validFrom ?? "").localeCompare(String(a.validFrom ?? "")))[0];
};

/** Prevedie odpoveď RPO API na údaje firmy. Exportované kvôli testom. */
export function parseRpo(ico: string, json: any): Company | null {
  const results: any[] = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : json ? [json] : [];
  const e = results.find((r) => Array.isArray(r?.identifiers) && r.identifiers.some((i: any) => String(i?.value) === ico)) ?? results[0];
  if (!e) return null;
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
  const main = e.statisticalCodes?.mainActivity;
  return {
    ico,
    name,
    address,
    legalForm: lf?.value?.value ?? lf?.value,
    nace: main ? [main.code, main.value].filter(Boolean).join(" ") : undefined,
    established: e.establishment,
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
    purpose: `Zistiť obchodné meno, adresu, právnu formu a SK NACE pre IČO ${ico}`,
    url,
    sends: `IČO ${ico}`,
  });
  if (!res.ok) throw new Error(`Register odpovedal chybou ${res.status}.`);
  return parseRpo(ico, await res.json());
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
  const years: ParamSet = json?.years ?? json;
  for (const [k, v] of Object.entries(years)) {
    const y = v as YearParams;
    if (Number(k) !== y?.year || !y.sp || !y.zp) throw new Error(`Neplatný formát sadzieb pre rok ${k}.`);
  }
  return { publishedAt: json?.publishedAt, years };
}

export interface ReleaseInfo {
  version: string;
  url: string;
  notes: string;
}

export async function checkAppUpdate(repo: string): Promise<ReleaseInfo | null> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await netFetch({ source: "appUpdate", purpose: "Zistiť, či je k dispozícii nová verzia aplikácie", url, sends: "nič" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub odpovedal ${res.status}.`);
  const j = await res.json();
  return { version: String(j.tag_name ?? "").replace(/^v/, ""), url: j.html_url, notes: j.body ?? "" };
}
