import { describe, expect, it } from "vitest";
import { isNewerVersion, windowsDownloadUrl } from "./version";

describe("isNewerVersion", () => {
  it("porovnáva po zložkách", () => {
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.1.10", "0.1.9")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
  });
  it("ignoruje v a chýbajúce zložky", () => {
    expect(isNewerVersion("v1.2", "1.1.9")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
  });
});

describe("odkaz na stiahnutie pre Windows", () => {
  it("zodpovedá názvu súboru v GitHub Releases", () => {
    expect(windowsDownloadUrl("0.1.0")).toBe(
      "https://github.com/romanmerkl11-stack/danova-kalkulacka/releases/download/v0.1.0/Danova.kalkulacka_0.1.0_x64-setup.exe",
    );
  });
});
