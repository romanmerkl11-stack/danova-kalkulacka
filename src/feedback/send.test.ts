import { afterEach, describe, expect, it, vi } from "vitest";
import { setNetContext } from "../net/net";
import { DEFAULT_SETTINGS, type Settings } from "../store/storage";
import { newDraft, type FeedbackContext } from "./report";
import { sendFeedback } from "./send";

const ctx: FeedbackContext = { appVersion: "0.1.0", platform: "web", os: "Windows", tab: "Podrobný výpočet", year: 2026, profile: "SZČO" };
const draft = { ...newDraft("navrh"), id: "DK-0A1B2C3D", what: "Pridať tlačidlo" };
const URL = "https://script.google.com/macros/s/TEST/exec";

function setup(fetchImpl: (u: string, i?: RequestInit) => Promise<Response>) {
  const settings: Settings = { ...DEFAULT_SETTINGS, alwaysAllow: { feedback: true } };
  vi.stubGlobal("window", { fetch: fetchImpl });
  setNetContext({ getSettings: () => settings, ask: async () => "once", onAlwaysAllow: () => undefined, log: () => undefined });
}
afterEach(() => vi.unstubAllGlobals());

describe("H – priame odoslanie spätnej väzby", () => {
  it("pošle text z náhľadu ako text/plain a úspech až s číslom záznamu", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, number: 7 })));
    setup(f);
    expect(await sendFeedback(draft, ctx, URL)).toEqual({ ok: true, number: 7 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toMatch(/^text\/plain/);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ id: "DK-0A1B2C3D", kind: "navrh" });
    expect(body.title).toBe("[Návrh][DK-0A1B2C3D] Pridať tlačidlo");
    expect(body.body).toContain("Pridať tlačidlo");
  });
  it("chyba servera alebo odpoveď bez čísla = neúspech", async () => {
    setup(async () => new Response(JSON.stringify({ ok: false, error: "Príliš veľa hlásení." })));
    expect(await sendFeedback(draft, ctx, URL)).toEqual({ ok: false, error: "Príliš veľa hlásení." });
    setup(async () => new Response(JSON.stringify({ ok: true })));
    expect((await sendFeedback(draft, ctx, URL)).ok).toBe(false);
    setup(async () => new Response("<html>", { status: 500 }));
    expect((await sendFeedback(draft, ctx, URL)).ok).toBe(false);
  });
});
