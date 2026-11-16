// Front otázok na povolenie prístupu na internet: zobrazuje sa vždy jedna, ďalšie čakajú.
import type { Decision, NetRequest } from "./net";

interface Item {
  req: NetRequest;
  resolve: (d: Decision) => void;
}

export interface AskQueue {
  ask: (req: NetRequest) => Promise<Decision>;
  /** odpoveď na práve zobrazenú otázku */
  decide: (d: Decision) => void;
  /** počet čakajúcich (vrátane zobrazenej) */
  size: () => number;
}

/** `show` dostane práve zobrazenú požiadavku (alebo null, keď je front prázdny). */
export function createAskQueue(show: (req: NetRequest | null) => void): AskQueue {
  const items: Item[] = [];
  const next = () => show(items[0]?.req ?? null);
  return {
    ask: (req) =>
      new Promise<Decision>((resolve) => {
        items.push({ req, resolve });
        if (items.length === 1) next();
      }),
    decide: (d) => {
      const head = items.shift();
      if (!head) return;
      head.resolve(d);
      // „Vždy povoliť“ pokryje aj ďalšie čakajúce otázky na ten istý zdroj
      if (d === "always") {
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i].req.source === head.req.source) items.splice(i, 1)[0].resolve("once");
        }
      }
      next();
    },
    size: () => items.length,
  };
}
