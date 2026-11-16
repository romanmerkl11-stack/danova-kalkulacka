import { describe, expect, it } from "vitest";

// Neuzavretá zložená zátvorka v jednom CSS súbore rozbije štýly celej appky (stalo sa 16. 11.).
const files = import.meta.glob("../**/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("CSS súbory", () => {
  it("nájde CSS súbory", () => {
    expect(Object.keys(files).length).toBeGreaterThan(2);
  });
  it.each(Object.entries(files))("%s má vyvážené zátvorky", (_file, raw) => {
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    let min = 0;
    for (const ch of css) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      min = Math.min(min, depth);
    }
    expect(min).toBe(0);
    expect(depth).toBe(0);
  });
});
