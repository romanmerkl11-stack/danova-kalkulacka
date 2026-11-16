// Kontrola stiahnutých sadzieb pred prijatím (F14): typy, konečné čísla, rozsahy, pásma, dátumy.
// Vráti zoznam problémov po slovensky; prázdny zoznam = sadzby sú v poriadku.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ISO = /^\d{4}-\d{2}-\d{2}/;

export function validateYearParams(raw: unknown, key: string): string[] {
  const errs: string[] = [];
  const at = (path: string, msg: string) => errs.push(`${key}: ${path} – ${msg}`);

  /** hodnota P: nezáporné číslo, dátum účinnosti, príznak overenia */
  const p = (v: unknown, path: string, opts: { positive?: boolean } = {}) => {
    if (!isObj(v)) return at(path, "chýba");
    if (!isNum(v.value) || v.value < 0 || (opts.positive && v.value === 0)) at(path, `neplatná suma (${String(v.value)})`);
    if (typeof v.validFrom !== "string" || !ISO.test(v.validFrom)) at(path, "chýba platný dátum účinnosti");
    if (v.validTo !== undefined && (typeof v.validTo !== "string" || !ISO.test(v.validTo))) at(path, "neplatný dátum konca platnosti");
    if (typeof v.verified !== "boolean") at(path, "chýba príznak overenia");
  };
  const rate = (v: unknown, path: string) => {
    if (!isNum(v) || v < 0 || v > 1) at(path, `sadzba mimo 0–100 % (${String(v)})`);
  };
  const positive = (v: unknown, path: string) => {
    if (!isNum(v) || v <= 0) at(path, `musí byť kladné číslo (${String(v)})`);
  };

  if (!isObj(raw)) return [`${key}: rok neobsahuje sadzby`];
  if (String(raw.year) !== key || !Number.isInteger(raw.year)) at("rok", `nesedí s kľúčom (${String(raw.year)})`);
  if (raw.status !== "platné" && raw.status !== "predbežné") at("stav", `neznámy (${String(raw.status)})`);

  // daň (null = ešte neznáma)
  if (raw.tax !== null) {
    const t = raw.tax;
    if (!isObj(t)) at("daň", "chýba");
    else {
      for (const k of ["zivotneMinimum", "nczd", "nczdFullUpTo", "nczdReduceConst", "spouse", "spouseFullUpTo", "ddsMax", "reducedRateLimit", "minTaxLevied", "pausalCap", "minimalnaMzda", "advanceQuarterly", "advanceMonthly"])
        p(t[k], `daň.${k}`);
      if (t.bonusReductionThreshold !== null) p(t.bonusReductionThreshold, "daň.bonusReductionThreshold");
      positive(t.nczdReduceDivisor, "daň.nczdReduceDivisor");
      rate(t.reducedRate, "daň.reducedRate");
      rate(t.pausalRate, "daň.pausalRate");
      // pásma: aspoň jedno, rastúce hranice, posledné bez hranice, rastúce sadzby
      if (!Array.isArray(t.brackets) || t.brackets.length === 0) at("daň.pásma", "chýbajú");
      else {
        let prevUp = -1;
        let prevRate = -1;
        t.brackets.forEach((b: unknown, i) => {
          const path = `daň.pásmo ${i + 1}`;
          if (!isObj(b)) return at(path, "neplatné");
          rate(b.rate, path);
          if (isNum(b.rate) && b.rate < prevRate) at(path, "sadzba je nižšia ako v predchádzajúcom pásme");
          if (isNum(b.rate)) prevRate = b.rate;
          const last = i === (t.brackets as unknown[]).length - 1;
          if (b.upTo === null) {
            if (!last) at(path, "pásmo bez hranice musí byť posledné");
          } else {
            p(b.upTo, `${path}.hranica`, { positive: true });
            const up = isObj(b.upTo) ? b.upTo.value : NaN;
            if (isNum(up) && up <= prevUp) at(path, "hranice pásiem nie sú zoradené");
            if (isNum(up)) prevUp = up;
            if (last) at(path, "posledné pásmo musí byť bez hranice");
          }
        });
      }
      if (!Array.isArray(t.bonusTiers)) at("daň.bonus", "chýba");
      else {
        let prevAge = 0;
        t.bonusTiers.forEach((b: unknown, i) => {
          const path = `daň.bonus ${i + 1}`;
          if (!isObj(b)) return at(path, "neplatný");
          if (!isNum(b.maxAge) || !Number.isInteger(b.maxAge) || b.maxAge <= prevAge) at(path, "vekové hranice nie sú zoradené");
          if (isNum(b.maxAge)) prevAge = b.maxAge;
          p(b.monthly, `${path}.suma`);
        });
      }
    }
  }

  const sp = raw.sp;
  if (!isObj(sp)) at("SP", "chýba");
  else {
    for (const k of ["priemernaMzda", "minVZ", "minPoistne", "maxVZ", "limitVzniku"]) p(sp[k], `SP.${k}`, { positive: true });
    positive(sp.koeficient, "SP.koeficient");
    if (isObj(sp.minVZ) && isObj(sp.maxVZ) && isNum(sp.minVZ.value) && isNum(sp.maxVZ.value) && sp.minVZ.value > sp.maxVZ.value)
      at("SP", "minimálny vymeriavací základ je vyšší ako maximálny");
    if (!Array.isArray(sp.funds) || sp.funds.length === 0) at("SP.fondy", "chýbajú");
    else
      sp.funds.forEach((f: unknown, i) => {
        if (!isObj(f) || typeof f.name !== "string") return at(`SP.fond ${i + 1}`, "neplatný");
        rate(f.rate, `SP.fond ${f.name}`);
      });
    if (sp.mikro !== undefined) {
      if (!isObj(sp.mikro)) at("SP.mikro", "neplatný");
      else {
        p(sp.mikro.vz, "SP.mikro.vz", { positive: true });
        p(sp.mikro.poistne, "SP.mikro.poistne", { positive: true });
        if (sp.mikro.lowerIncome !== undefined) p(sp.mikro.lowerIncome, "SP.mikro.lowerIncome");
      }
    }
  }

  const zp = raw.zp;
  if (!isObj(zp)) at("ZP", "chýba");
  else {
    rate(zp.rate, "ZP.sadzba");
    p(zp.minVZ, "ZP.minVZ", { positive: true });
    p(zp.minPreddavok, "ZP.minPreddavok", { positive: true });
    positive(zp.koeficient, "ZP.koeficient");
  }

  const dph = raw.dph;
  if (!isObj(dph)) at("DPH", "chýba");
  else {
    p(dph.registration, "DPH.registrácia", { positive: true });
    if (dph.immediate !== null) p(dph.immediate, "DPH.okamžite", { positive: true });
  }
  return errs;
}

/** Skontroluje všetky roky; vráti problémy (najviac `max`, aby hlásenie ostalo čitateľné). */
export function validateParamSet(raw: unknown, max = 8): string[] {
  if (!isObj(raw) || Object.keys(raw).length === 0) return ["Súbor neobsahuje žiadne roky so sadzbami."];
  const errs: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}$/.test(k)) errs.push(`${k}: neplatný rok`);
    else errs.push(...validateYearParams(v, k));
  }
  return errs.length > max ? [...errs.slice(0, max), `… a ďalších ${errs.length - max} problémov`] : errs;
}
