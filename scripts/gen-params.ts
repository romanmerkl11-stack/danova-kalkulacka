// Vygeneruje params/params.json z src/params/data.ts (kurátorovaný súbor sadzieb, ktorý si appka vie stiahnuť).
// Spustenie: npm run params
import { mkdirSync, writeFileSync } from "node:fs";
import { PARAMS, PARAMS_DATE } from "../src/params/data.ts";

mkdirSync("params", { recursive: true });
const out = { publishedAt: PARAMS_DATE, years: PARAMS };
writeFileSync("params/params.json", JSON.stringify(out, null, 1) + "\n");
console.log(`params/params.json: roky ${Object.keys(PARAMS).join(", ")}`);
