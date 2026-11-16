import { describe, expect, it } from "vitest";
import { createAskQueue } from "./askQueue";
import type { NetRequest } from "./net";

const req = (source: NetRequest["source"], url: string = source): NetRequest => ({ source, url, purpose: "", sends: "" });

describe("F13 – front súhlasov", () => {
  it("druhá otázka čaká a neprepíše prvú; obe dostanú odpoveď", async () => {
    const shown: (string | null)[] = [];
    const q = createAskQueue((r) => shown.push(r?.url ?? null));
    const a = q.ask(req("params"));
    const b = q.ask(req("appUpdate"));
    expect(shown).toEqual(["params"]);
    q.decide("deny");
    expect(shown).toEqual(["params", "appUpdate"]);
    q.decide("once");
    expect(await a).toBe("deny");
    expect(await b).toBe("once");
    expect(shown.at(-1)).toBeNull();
    expect(q.size()).toBe(0);
  });

  it("„Vždy povoliť“ vybaví aj čakajúce otázky na ten istý zdroj", async () => {
    const shown: (string | null)[] = [];
    const q = createAskQueue((r) => shown.push(r?.url ?? null));
    const a = q.ask(req("rpo", "rpo1"));
    const b = q.ask(req("params"));
    const c = q.ask(req("rpo", "rpo2"));
    q.decide("always");
    expect(await a).toBe("always");
    expect(await c).toBe("once");
    expect(shown.at(-1)).toBe("params");
    q.decide("deny");
    expect(await b).toBe("deny");
  });

  it("odpoveď bez otázky nič nerozbije", () => {
    const q = createAskQueue(() => undefined);
    expect(() => q.decide("once")).not.toThrow();
  });
});
