import { describe, expect, it } from "vitest";
import { defaultInput } from "../engine/calc";
import { sameData, unsavedState } from "./unsaved";

describe("neuložené zmeny", () => {
  it("sameData ignoruje poradie kľúčov a undefined vs. chýbajúce pole", () => {
    expect(sameData({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(sameData({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
  it("stavy: empty, unsaved, clean, dirty", () => {
    const empty = defaultInput(2026);
    expect(unsavedState(empty, null)).toBe("empty");
    const filled = { ...defaultInput(2026), income: { ...empty.income, annual: 20000 } };
    expect(unsavedState(filled, null)).toBe("unsaved");
    expect(unsavedState(filled, structuredClone(filled))).toBe("clean");
    expect(unsavedState({ ...filled, dds: 50 }, filled)).toBe("dirty");
  });
});
