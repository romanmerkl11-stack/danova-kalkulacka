import { describe, expect, it } from "vitest";
import { CALC_CARDS, resolveLayout } from "./calcLayout";

describe("resolveLayout", () => {
  it("predvolené = všetky viditeľné v pôvodnom poradí", () => {
    expect(resolveLayout(undefined).map((x) => x.id)).toEqual(CALC_CARDS.map((c) => c.id));
  });
  it("zachová uložené poradie, zahodí neznáme, doplní chýbajúce", () => {
    const r = resolveLayout([{ id: "card-export", visible: false }, { id: "xx", visible: true }, { id: "card-steps", visible: true }]);
    expect(r[0]).toEqual({ id: "card-export", visible: false });
    expect(r.length).toBe(CALC_CARDS.length);
    expect(r.some((x) => x.id === "xx")).toBe(false);
  });
});
