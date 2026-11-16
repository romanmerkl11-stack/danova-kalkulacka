import { afterEach, describe, expect, it, vi } from "vitest";
import { NET_TIMEOUT_MS, NetDenied, netFetch, setNetContext, type Decision } from "./net";
import { DEFAULT_SETTINGS, type NetLogEntry, type Settings } from "../store/storage";

const req = { source: "params" as const, purpose: "", url: "https://example.test/p.json", sends: "nič" };

function setup(ask: () => Promise<Decision>, fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const settings: Settings = { ...DEFAULT_SETTINGS, alwaysAllow: {} };
  const log: NetLogEntry[] = [];
  vi.stubGlobal("window", { fetch: fetchImpl });
  setNetContext({ getSettings: () => settings, ask, onAlwaysAllow: () => undefined, log: (e) => log.push(e) });
  return { settings, log };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("F13 – sieťová vrstva", () => {
  it("offline zapnutý počas čakania na súhlas → nič sa neodošle", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    let ctx!: ReturnType<typeof setup>;
    ctx = setup(async () => {
      ctx.settings.offline = true;
      return "once";
    }, fetchSpy);
    await expect(netFetch(req)).rejects.toBeInstanceOf(NetDenied);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ctx.log.at(-1)?.result).toBe("zamietnuté");
  });

  it("server neodpovedá → po časovom limite zrozumiteľná chyba", async () => {
    vi.useFakeTimers();
    const hang = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const { log } = setup(async () => "once", hang);
    const p = netFetch(req);
    const check = expect(p).rejects.toThrow(/neodpovedal/);
    await vi.advanceTimersByTimeAsync(NET_TIMEOUT_MS + 10);
    await check;
    expect(log.at(-1)).toMatchObject({ result: "chyba", detail: "časový limit" });
  });

  it("bežná odpoveď prejde a zapíše sa do logu", async () => {
    const { log } = setup(async () => "once", async () => new Response("{}", { status: 200 }));
    expect((await netFetch(req)).ok).toBe(true);
    expect(log.at(-1)).toMatchObject({ result: "ok", detail: "HTTP 200" });
  });
});
