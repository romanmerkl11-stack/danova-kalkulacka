// Jediné miesto, odkiaľ appka ide na internet.
// Pred každou požiadavkou sa (podľa nastavení) spýta používateľa a zapíše ju do logu.

import { isTauri, type NetLogEntry, type Settings, type SourceId } from "../store/storage";

export interface NetRequest {
  source: SourceId;
  /** čo ideme robiť, ľudsky */
  purpose: string;
  url: string;
  /** čo sa odošle (napr. „IČO 12345678“) */
  sends: string;
}

export type Decision = "once" | "always" | "deny";

export const SOURCE_LABELS: Record<SourceId, string> = {
  rpo: "Register právnických osôb (Štatistický úrad SR)",
  params: "Aktualizácia sadzieb a limitov",
  appUpdate: "Kontrola novej verzie aplikácie",
};

export interface NetContext {
  getSettings: () => Settings;
  /** zobrazí dialóg a vráti rozhodnutie */
  ask: (req: NetRequest) => Promise<Decision>;
  onAlwaysAllow: (source: SourceId) => void;
  log: (e: NetLogEntry) => void;
}

let ctx: NetContext | null = null;
export const setNetContext = (c: NetContext) => {
  ctx = c;
};

export class NetDenied extends Error {
  constructor(msg = "Prístup na internet nebol povolený.") {
    super(msg);
  }
}

async function doFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    // natívny HTTP klient – obchádza obmedzenia prehliadača (CORS)
    const { fetch } = await import("@tauri-apps/plugin-http");
    return fetch(url, init);
  }
  return window.fetch(url, init);
}

export async function netFetch(req: NetRequest, init?: RequestInit): Promise<Response> {
  if (!ctx) throw new Error("Sieťová vrstva nie je inicializovaná.");
  const s = ctx.getSettings();
  const base = { at: new Date().toISOString(), source: req.source, url: req.url, sent: req.sends };
  if (s.offline) {
    ctx.log({ ...base, result: "zamietnuté", detail: "offline režim" });
    throw new NetDenied("Appka je v offline režime (Nastavenia).");
  }
  if (!s.neverAsk && !s.alwaysAllow[req.source]) {
    const d = await ctx.ask(req);
    if (d === "deny") {
      ctx.log({ ...base, result: "zamietnuté" });
      throw new NetDenied();
    }
    if (d === "always") ctx.onAlwaysAllow(req.source);
  }
  try {
    const res = await doFetch(req.url, init);
    ctx.log({ ...base, result: res.ok ? "ok" : "chyba", detail: `HTTP ${res.status}` });
    return res;
  } catch (e) {
    ctx.log({ ...base, result: "chyba", detail: String(e) });
    throw e;
  }
}
