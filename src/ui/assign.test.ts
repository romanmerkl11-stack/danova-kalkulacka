import { describe, expect, it } from "vitest";
import { assignShare } from "./assign";

describe("2 % / 3 % z dane", () => {
  it("pod minimom 3 € sa neponúka", () => {
    expect(assignShare(0)).toBeNull();
    expect(assignShare(149.99)).toBeNull();
  });
  it("počíta 2 % a 3 % zaokrúhlené nadol na centy", () => {
    expect(assignShare(150)).toEqual({ two: 3, three: 4.5 });
    expect(assignShare(1082.05)).toEqual({ two: 21.64, three: 32.46 });
  });
});
