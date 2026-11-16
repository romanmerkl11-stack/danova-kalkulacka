import { PARAMS } from "../params/data";
import type { ParamSet, P, SpParams, TaxParams, YearParams } from "../params/types";
import { ceil2, eur, floor2, pct, round2, sum } from "./money";
import type { CalcInput, CalcResult, FilingInfo, LimitInfo, MonthRow, NextYear, Step, Warning } from "./types";

export const MONTHS = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

const empty12 = () => Array<number | null>(12).fill(null);

export function defaultInput(year: number): CalcInput {
  return {
    year,
    profile: "szco",
    income: { mode: "annual", annual: 0, monthly: empty12(), extrapolate: true },
    insurance: {
      shiftOneMonth: true,
      spRegimeH2: "standard",
      spJanJun: null,
      spJulDec: null,
      zpMonthlyAmount: null,
      spPaid: empty12(),
      zpPaid: empty12(),
    },
    expenses: { mode: "pausal", actual: 0 },
    employment: { gross: 0, insurance: 0, taxWithheld: 0, bonusPaid: 0 },
    rental: { income: 0, expenses: 0 },
    children: [],
    spouse: { claim: false, income: 0, months: 12 },
    dds: 0,
    lossCarry: 0,
    taxAdvancesPaid: 0,
    overrides: {},
  };
}

/** Nájde daňové parametre pre rok; ak chýbajú, použije posledné známe. */
export function taxParamsFor(year: number, params: ParamSet = PARAMS): { tax: TaxParams; year: number } {
  const years = Object.keys(params).map(Number).sort((a, b) => b - a);
  const exact = params[year]?.tax;
  if (exact) return { tax: exact, year };
  for (const y of years) if (y <= year && params[y].tax) return { tax: params[y].tax!, year: y };
  const any = years.find((y) => params[y].tax)!;
  return { tax: params[any].tax!, year: any };
}

function yearParams(year: number, params: ParamSet): YearParams | undefined {
  return params[year];
}

/** Poistné SP z vymeriavacieho základu – každý fond zaokrúhlený na centy nadol (ako Sociálna poisťovňa). */
export function spFromVZ(vz: number, sp: SpParams): number {
  return sum(sp.funds.map((f) => floor2(vz * f.rate)));
}

/** Progresívna daň podľa pásiem */
export function progressiveTax(base: number, tax: TaxParams): { tax: number; parts: { from: number; to: number; rate: number; amount: number }[] } {
  let prev = 0;
  let total = 0;
  const parts: { from: number; to: number; rate: number; amount: number }[] = [];
  for (const b of tax.brackets) {
    const top = b.upTo ? b.upTo.value : Infinity;
    if (base <= prev) break;
    const slice = Math.min(base, top) - prev;
    const amount = slice * b.rate;
    parts.push({ from: prev, to: Math.min(base, top), rate: b.rate, amount });
    total += amount;
    prev = top;
  }
  return { tax: total, parts };
}

export function nczdFor(zd: number, tax: TaxParams): number {
  if (zd <= tax.nczdFullUpTo.value) return tax.nczd.value;
  return Math.max(0, round2(tax.nczdReduceConst.value - zd / tax.nczdReduceDivisor));
}

/** vek dieťaťa k 1. dňu mesiaca */
function ageAt(birth: string, year: number, month: number): number {
  const [by, bm] = birth.split("-").map(Number);
  let age = year - by;
  if (month < bm) age -= 1;
  return age;
}

export function calculate(input: CalcInput, params: ParamSet = PARAMS): CalcResult {
  const Y = input.year;
  const ov = input.overrides ?? {};
  const steps: Step[] = [];
  const warnings: Warning[] = [];
  const limits: LimitInfo[] = [];

  const yp = yearParams(Y, params);
  const ypPrev = yearParams(Y - 1, params);
  const ypNext = yearParams(Y + 1, params);
  const { tax: T, year: taxYear } = taxParamsFor(Y, params);
  if (taxYear !== Y) {
    warnings.push({
      id: "tax-params-missing",
      severity: "warn",
      text: `Daň za rok ${Y} je orientačne vypočítaná podľa sadzieb roka ${taxYear} – sadzby na rok ${Y} ešte nie sú známe. Nové sadzby skontrolujete v záložke Sadzby.`,
    });
  }
  if (!yp) {
    warnings.push({ id: "odvody-params-missing", severity: "danger", text: `Odvodové parametre pre rok ${Y} chýbajú – výpočet odvodov je len orientačný.` });
  }
  const profile = input.profile ?? "szco";
  const isEmp = profile === "zamestnanec";
  // zamestnanie: pri zadaných riadkoch (viac zamestnávateľov) sa sčítajú, inak plochá časť
  const empItems = (input.employment.items ?? []).filter((it) => it.gross || it.insurance || it.taxWithheld || it.bonusPaid);
  const emp = empItems.length
    ? {
        gross: round2(sum(empItems.map((it) => it.gross || 0))),
        insurance: round2(sum(empItems.map((it) => it.insurance || 0))),
        taxWithheld: round2(sum(empItems.map((it) => it.taxWithheld || 0))),
        bonusPaid: round2(sum(empItems.map((it) => it.bonusPaid || 0))),
      }
    : { gross: input.employment.gross, insurance: input.employment.insurance, taxWithheld: input.employment.taxWithheld, bonusPaid: input.employment.bonusPaid };
  const SP = (yp ?? ypPrev ?? params[taxYear]).sp;
  const ZP = (yp ?? ypPrev ?? params[taxYear]).zp;

  /** zaregistruje krok; ak je prepísaný, vráti prepísanú hodnotu */
  const step = (s: Omit<Step, "value" | "overridden"> & { value: number }): number => {
    const o = ov[s.id];
    const overridden = s.editable !== false && typeof o === "number" && Number.isFinite(o);
    const value = overridden ? o : round2(s.value);
    steps.push({ ...s, value, overridden, editable: s.editable !== false });
    return value;
  };

  // ---------- 1. Príjmy po mesiacoch ----------
  const monthsIncome: { v: number; projected: boolean }[] = [];
  if (isEmp) {
    for (let i = 0; i < 12; i++) monthsIncome.push({ v: 0, projected: false });
  } else if (input.income.mode === "monthly") {
    const filled = input.income.monthly.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    const known = filled.filter((v): v is number => v !== null);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
    filled.forEach((v) => {
      if (v !== null) monthsIncome.push({ v, projected: false });
      else monthsIncome.push({ v: input.income.extrapolate ? round2(avg) : 0, projected: input.income.extrapolate && known.length > 0 });
    });
  } else {
    const per = input.income.annual / 12;
    for (let i = 0; i < 12; i++) monthsIncome.push({ v: round2(per), projected: false });
  }
  const knownMonths = monthsIncome.filter((m) => !m.projected).length;

  const incomeComputed = input.income.mode === "monthly" ? sum(monthsIncome.map((m) => m.v)) : input.income.annual;
  const income = isEmp ? 0 : step({
    id: "prijmy",
    group: "prijmy",
    label: "Príjmy zo živnosti (§ 6 ods. 1 a 2)",
    value: incomeComputed,
    formula:
      input.income.mode === "monthly"
        ? `súčet 12 mesiacov${monthsIncome.some((m) => m.projected) ? ` (z toho ${12 - knownMonths} mesiacov dopočítaných priemerom ${eur(monthsIncome.find((m) => m.projected)?.v ?? 0)})` : ""} = ${eur(incomeComputed)}`
        : `zadaná ročná suma = ${eur(incomeComputed)}`,
    explain: "Všetky prijaté platby za živnosť v kalendárnom roku (zaplatené faktúry, hotovosť). Pri paušálnych výdavkoch sa rozhoduje podľa toho, kedy peniaze prišli.",
    law: "§ 6 ods. 1 písm. b) zákona č. 595/2003 Z. z.",
    dpRow: "VI. oddiel, tab. 1, r. 2 / r. 39",
  });
  if (monthsIncome.some((m) => m.projected)) {
    warnings.push({
      id: "projected",
      severity: "info",
      text: `Príjmy za ${12 - knownMonths} mesiac(ov) sú odhadnuté priemerom zadaných mesiacov. Výsledok je predpoklad.`,
    });
  }

  // ---------- 2. Poistné po mesiacoch ----------
  const prevSP = ypPrev?.sp ?? SP;
  const prevZP = ypPrev?.zp ?? ZP;
  const spMinY = SP.minPoistne.value;
  const spH2Default =
    input.insurance.spRegimeH2 === "none"
      ? 0
      : input.insurance.spRegimeH2 === "mikro" && SP.mikro
        ? SP.mikro.poistne.value
        : spMinY;
  const spJanJun = input.insurance.spJanJun ?? spMinY;
  const spJulDec = input.insurance.spJulDec ?? spH2Default;
  const zpY = input.insurance.zpMonthlyAmount ?? ZP.minPreddavok.value;
  if (input.insurance.spRegimeH2 === "mikro" && !SP.mikro) {
    warnings.push({ id: "no-mikro", severity: "warn", text: `Mikroodvod v roku ${Y} neexistuje – použilo sa minimálne poistné.` });
  }

  const months: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    if (isEmp) {
      months.push({ month: m, income: 0, incomeProjected: false, sp: 0, zp: 0, spAuto: true, zpAuto: true, covers: "–" });
      continue;
    }
    // za ktorý mesiac sa v mesiaci m platí
    const shift = input.insurance.shiftOneMonth;
    const coversMonth = shift ? (m === 1 ? 12 : m - 1) : m;
    const coversYear = shift && m === 1 ? Y - 1 : Y;
    let spAuto: number;
    let zpAuto: number;
    if (coversYear < Y) {
      // december predošlého roka – predvolene minimum predošlého roka (dá sa prepísať v tabuľke)
      spAuto = input.insurance.spRegimeH2 === "none" ? 0 : prevSP.minPoistne.value;
      zpAuto = prevZP.minPreddavok.value;
    } else {
      spAuto = coversMonth <= 6 ? spJanJun : spJulDec;
      zpAuto = zpY;
    }
    const spManual = input.insurance.spPaid[m - 1];
    const zpManual = input.insurance.zpPaid[m - 1];
    months.push({
      month: m,
      income: monthsIncome[m - 1].v,
      incomeProjected: monthsIncome[m - 1].projected,
      sp: typeof spManual === "number" ? spManual : spAuto,
      zp: typeof zpManual === "number" ? zpManual : zpAuto,
      spAuto: typeof spManual !== "number",
      zpAuto: typeof zpManual !== "number",
      covers: `${coversMonth}/${coversYear}`,
    });
  }

  const spPaidComputed = sum(months.map((r) => r.sp));
  const zpPaidComputed = sum(months.map((r) => r.zp));
  const spPaid = isEmp ? 0 : step({
    id: "spZaplatene",
    group: "odvody",
    label: "Sociálne poistenie zaplatené v roku",
    value: spPaidComputed,
    formula: `súčet platieb v mesiacoch 1–12 = ${eur(spPaidComputed)}`,
    explain: input.insurance.shiftOneMonth
      ? `Poistné sa platí do 8. dňa nasledujúceho mesiaca, preto januárová platba je za december ${Y - 1} a decembrová za december ${Y} sa zaplatí až v januári ${Y + 1}. Do výdavkov ide poistné skutočne zaplatené v roku ${Y}.`
      : "Do výdavkov ide poistné skutočne zaplatené v roku.",
    law: "§ 6 ods. 11 zákona 595/2003 Z. z.",
    params: [{ label: `minimálne SP ${Y}`, param: SP.minPoistne }],
  });
  const zpPaid = isEmp ? 0 : step({
    id: "zpZaplatene",
    group: "odvody",
    label: "Zdravotné poistenie zaplatené v roku",
    value: zpPaidComputed,
    formula: `súčet platieb v mesiacoch 1–12 = ${eur(zpPaidComputed)}`,
    explain: "Zaplatené preddavky na zdravotné poistenie sú daňový výdavok aj popri paušálnych výdavkoch.",
    law: "§ 6 ods. 11 zákona 595/2003 Z. z.",
    params: [{ label: `minimálny preddavok ZP ${Y}`, param: ZP.minPreddavok }],
  });
  const insurancePaid = isEmp ? 0 : step({
    id: "poistne",
    group: "prijmy",
    label: "Preukázateľne zaplatené poistné (SP + ZP)",
    value: spPaid + zpPaid,
    formula: `${eur(spPaid)} + ${eur(zpPaid)}`,
    explain: "Pri paušálnych výdavkoch sa zaplatené odvody pripočítavajú navyše k 60 %.",
    dpRow: "VI. oddiel, tab. 1 – poistné",
  });

  // ---------- 3. Výdavky ----------
  let expenses = 0;
  if (isEmp) {
    // zamestnanec: žiadne príjmy ani výdavky z podnikania
  } else if (input.expenses.mode === "pausal") {
    const raw = income * T.pausalRate;
    const pausal60 = step({
      id: "pausal60",
      group: "prijmy",
      label: "60 % z príjmov",
      value: raw,
      editable: false,
      formula: `${eur(income)} × 60 % = ${eur(raw)}`,
    });
    const capped = Math.min(pausal60, T.pausalCap.value);
    const pausal = step({
      id: "pausal",
      group: "prijmy",
      label: "Paušálne výdavky (max. 20 000 €)",
      value: capped,
      formula: `min(${eur(pausal60)}; ${eur(T.pausalCap.value)}) = ${eur(capped)}`,
      explain: "Paušálne výdavky sú 60 % z príjmov, najviac 20 000 € ročne. Pri príjmoch nad 33 333,33 € už ďalšie príjmy výdavky nezvyšujú.",
      law: "§ 6 ods. 10 zákona 595/2003 Z. z.",
      params: [{ label: "strop paušálnych výdavkov", param: T.pausalCap }],
    });
    if (pausal60 > T.pausalCap.value) {
      warnings.push({
        id: "pausal-cap",
        severity: "warn",
        text: `Prekročený strop paušálnych výdavkov: 60 % z príjmov je ${eur(pausal60)}, uplatňuje sa len ${eur(T.pausalCap.value)}. Zvážte, či nemáte vyššie skutočné výdavky.`,
      });
    }
    expenses = step({
      id: "vydavky",
      group: "prijmy",
      label: "Výdavky spolu",
      value: pausal + insurancePaid,
      formula: `${eur(pausal)} + ${eur(insurancePaid)} (poistné)`,
      dpRow: "r. 40",
    });
  } else {
    expenses = step({
      id: "vydavky",
      group: "prijmy",
      label: "Výdavky spolu (skutočné + poistné)",
      value: input.expenses.actual + insurancePaid,
      formula: `${eur(input.expenses.actual)} + ${eur(insurancePaid)} (poistné)`,
      explain: "Pri skutočných výdavkoch musíte viesť jednoduché účtovníctvo alebo daňovú evidenciu.",
      dpRow: "r. 40",
    });
  }

  const czd6Raw = income - expenses;
  const czd6 = isEmp ? 0 : step({
    id: "czd6",
    group: "prijmy",
    label: "Čiastkový základ dane zo živnosti",
    value: Math.max(0, czd6Raw),
    formula: `${eur(income)} − ${eur(expenses)} = ${eur(czd6Raw)}${czd6Raw < 0 ? " → strata, základ 0" : ""}`,
    dpRow: "r. 41",
  });
  if (!isEmp && czd6Raw < 0) warnings.push({ id: "loss", severity: "info", text: `Daňová strata ${eur(-czd6Raw)} – pri paušálnych výdavkoch sa strata neodpočítava v ďalších rokoch.` });

  let czd6AfterLoss = czd6;
  if (!isEmp && input.lossCarry > 0) {
    const loss = step({
      id: "strata",
      group: "prijmy",
      label: "Odpočet daňovej straty z minulých rokov",
      value: Math.min(input.lossCarry, czd6),
      formula: `min(${eur(input.lossCarry)}; ${eur(czd6)})`,
      explain: "Strata sa odpočítava rovnomerne počas 4 rokov (alebo podľa § 30 pri vybraných daňovníkoch). Zadajte sumu pripadajúcu na tento rok.",
      law: "§ 30 zákona 595/2003 Z. z.",
      dpRow: "r. 53–54",
    });
    czd6AfterLoss = round2(czd6 - loss);
  }

  // ---------- 4. Zamestnanie (§ 5) ----------
  let czd5 = 0;
  if (emp.gross > 0) {
    czd5 = step({
      id: "czd5",
      group: "zamestnanie",
      label: "Čiastkový základ dane zo zamestnania (§ 5)",
      value: Math.max(0, emp.gross - emp.insurance),
      formula: empItems.length > 1
        ? `${empItems.map((it, i) => `${it.name || `zamestnávateľ ${i + 1}`}: ${eur(it.gross)} − ${eur(it.insurance)}`).join(" + ")} = ${eur(emp.gross)} − ${eur(emp.insurance)} (poistné zamestnanca)`
        : `${eur(emp.gross)} − ${eur(emp.insurance)} (poistné zamestnanca)`,
      explain: "Príjem zo závislej činnosti znížený o povinné poistné, ktoré platí zamestnanec (zdravotné, sociálne). Údaje sú na Potvrdení o zdaniteľnej mzde.",
      law: "§ 5 zákona 595/2003 Z. z.",
      dpRow: "V. oddiel, r. 36–38",
    });
  }

  // ---------- 5. Prenájom (§ 6 ods. 3) ----------
  const EXEMPT_LIMIT = 500;
  let czdNajom = 0;
  let rentalTaxableIncome = 0;
  let exemptLeft = EXEMPT_LIMIT;
  if (input.rental.income > 0) {
    const exempt = Math.min(EXEMPT_LIMIT, input.rental.income);
    exemptLeft = EXEMPT_LIMIT - exempt;
    const adjIncome = input.rental.income - exempt;
    rentalTaxableIncome = adjIncome;
    const adjExp = input.rental.income > 0 ? (adjIncome / input.rental.income) * input.rental.expenses : 0;
    czdNajom = step({
      id: "najom",
      group: "najom",
      label: "Čiastkový základ dane z prenájmu (§ 6 ods. 3)",
      value: Math.max(0, adjIncome - adjExp),
      formula: `(${eur(input.rental.income)} − ${eur(exempt)} oslobodené) − výdavky ${eur(input.rental.expenses)} × ${pct(input.rental.income ? adjIncome / input.rental.income : 0)} = ${eur(Math.max(0, adjIncome - adjExp))}`,
      explain: "Príjem z prenájmu do 500 € ročne je oslobodený (spolu s príležitostnými príjmami podľa § 8 ods. 1 písm. a)). Výdavky sa krátia v pomere zdaniteľného a celkového príjmu.",
      law: "§ 9 ods. 1 písm. g) a § 6 ods. 3 zákona 595/2003 Z. z.",
      dpRow: "VI. oddiel, tab. 1, r. 11 / r. 58–60",
    });
  }

  // ---------- 5b. Ostatné príjmy (§ 8) ----------
  const otherItems = (input.other?.items ?? []).filter((it) => (it.income || 0) > 0 || (it.expenses || 0) > 0);
  const occItems = otherItems.filter((it) => it.kind === "prilezitostna");
  const ineItems = otherItems.filter((it) => it.kind !== "prilezitostna");
  const occIncome = round2(sum(occItems.map((it) => Math.max(0, it.income || 0))));
  const occExpenses = round2(sum(occItems.map((it) => Math.max(0, it.expenses || 0))));
  const ineIncome = round2(sum(ineItems.map((it) => Math.max(0, it.income || 0))));
  const ineExpenses = round2(sum(ineItems.map((it) => Math.max(0, it.expenses || 0))));
  const otherIncomeTotal = round2(occIncome + ineIncome);
  let czd8 = 0;
  let other8TaxableIncome = 0;
  if (otherIncomeTotal > 0 || occExpenses + ineExpenses > 0) {
    const occExempt = Math.min(exemptLeft, occIncome);
    const occTaxable = occIncome - occExempt;
    const occAdjExp = occIncome > 0 ? (occTaxable / occIncome) * occExpenses : 0;
    other8TaxableIncome = round2(occTaxable + ineIncome);
    const exp8 = round2(occAdjExp + ineExpenses);
    step({
      id: "ostatnePrijmy",
      group: "ostatne",
      label: "Ostatné príjmy (§ 8) – príjmy",
      value: otherIncomeTotal,
      editable: false,
      formula: otherItems.map((it) => `${it.name || (it.kind === "prilezitostna" ? "príležitostná činnosť" : "iný príjem")}: ${eur(it.income || 0)}`).join(" + ") + ` = ${eur(otherIncomeTotal)}`,
      explain: "Príležitostné činnosti, prenájom hnuteľných vecí a iné ostatné príjmy. Oslobodenia pri predaji nehnuteľnosti/hnuteľnej veci si posúďte sami – zadajte len zdaniteľnú časť.",
      law: "§ 8 zákona 595/2003 Z. z.",
    });
    step({
      id: "ostatneOslobodenie",
      group: "ostatne",
      label: "Oslobodenie 500 € (spolu s prenájmom)",
      value: occExempt,
      editable: false,
      formula: `500 € − využité pri prenájme ${eur(EXEMPT_LIMIT - exemptLeft)} = ${eur(exemptLeft)} k dispozícii; príležitostné príjmy ${eur(occIncome)} → oslobodené ${eur(occExempt)}`,
      explain: "Príjem z prenájmu (§ 6 ods. 3) a z príležitostných činností a prenájmu hnuteľných vecí (§ 8 ods. 1 písm. a)) je oslobodený do 500 € ročne spolu. Najprv sa uplatní na prenájom, zvyšok na § 8.",
      law: "§ 9 ods. 1 písm. g) zákona 595/2003 Z. z.",
    });
    step({
      id: "ostatneVydavky",
      group: "ostatne",
      label: "Výdavky k ostatným príjmom (pomerne k zdaniteľnej časti)",
      value: exp8,
      editable: false,
      formula: `príležitostné ${eur(occExpenses)} × ${pct(occIncome ? occTaxable / occIncome : 0)} + ostatné ${eur(ineExpenses)} = ${eur(exp8)}`,
      explain: "Výdavky k príležitostným príjmom sa krátia v pomere zdaniteľného a celkového príjmu (rovnako ako pri prenájme).",
      law: "§ 8 ods. 1 a § 9 ods. 1 písm. g) zákona 595/2003 Z. z.",
    });
    const raw8 = other8TaxableIncome - exp8;
    czd8 = step({
      id: "czd8",
      group: "ostatne",
      label: "Čiastkový základ dane z ostatných príjmov (§ 8)",
      value: Math.max(0, raw8),
      formula: `${eur(other8TaxableIncome)} − ${eur(exp8)} = ${eur(raw8)}${raw8 < 0 ? " → strata, základ 0" : ""}`,
      explain: "Strata z ostatných príjmov sa neodpočítava od iných príjmov. Základ sa nekráti o nezdaniteľnú časť a zdaní sa progresívne spolu s ostatnými základmi.",
      law: "§ 8 zákona 595/2003 Z. z.",
    });
  }

  // ---------- 6. Nezdaniteľné časti ----------
  const zd56 = round2(czd5 + czd6AfterLoss);
  const zdForNczd = step({
    id: "zd56",
    group: "dan",
    label: "Základ dane (§ 5 + § 6 ods. 1 a 2)",
    value: zd56,
    editable: false,
    formula: `${eur(czd5)} + ${eur(czd6AfterLoss)}`,
    dpRow: "r. 72",
  });
  const nczdComputed = nczdFor(zdForNczd, T);
  const nczd = step({
    id: "nczd",
    group: "dan",
    label: "Nezdaniteľná časť na daňovníka",
    value: nczdComputed,
    formula:
      zdForNczd <= T.nczdFullUpTo.value
        ? `ZD ${eur(zdForNczd)} ≤ ${eur(T.nczdFullUpTo.value)} → plná suma ${eur(T.nczd.value)}`
        : `${eur(T.nczdReduceConst.value)} − ${eur(zdForNczd)} / ${T.nczdReduceDivisor} = ${eur(nczdComputed)}`,
    explain: `Každý daňovník si zníži základ dane o ${eur(T.nczd.value)}. Pri základe dane nad ${eur(T.nczdFullUpTo.value)} sa táto suma znižuje, až zanikne.`,
    law: "§ 11 ods. 2 zákona 595/2003 Z. z.",
    params: [
      { label: "NČZD", param: T.nczd },
      { label: "plná NČZD do základu dane", param: T.nczdFullUpTo },
      { label: "konštanta krátenia", param: T.nczdReduceConst },
    ],
    dpRow: "r. 73",
  });
  let spouse = 0;
  if (input.spouse.claim) {
    const full = zdForNczd <= T.spouseFullUpTo.value ? T.spouse.value : T.spouse.value + T.spouseFullUpTo.value / 4 - zdForNczd / 4;
    const s = Math.max(0, full - input.spouse.income) * (Math.min(12, Math.max(0, input.spouse.months)) / 12);
    spouse = step({
      id: "nczdManzel",
      group: "dan",
      label: "Nezdaniteľná časť na manžela/manželku",
      value: s,
      formula: `(${eur(Math.max(0, full))} − vlastný príjem ${eur(input.spouse.income)}) × ${input.spouse.months}/12`,
      explain: "Len ak manžel/ka v roku napr. poberal(a) materské, rodičovský príspevok, bol(a) na úrade práce a pod. Odhad – overte podmienky.",
      law: "§ 11 ods. 3 zákona 595/2003 Z. z.",
      params: [{ label: "NČZD na manžela", param: T.spouse }],
      dpRow: "r. 74",
    });
  }
  let dds = 0;
  if (input.dds > 0) {
    dds = step({
      id: "dds",
      group: "dan",
      label: "Príspevky na DDS (III. pilier)",
      value: Math.min(input.dds, T.ddsMax.value),
      formula: `min(${eur(input.dds)}; ${eur(T.ddsMax.value)})`,
      law: "§ 11 ods. 8 zákona 595/2003 Z. z.",
      dpRow: "r. 75",
    });
  }
  const nczdTotal = Math.min(zdForNczd, round2(nczd + spouse + dds));
  // NČZD sa uplatní najskôr na § 5, zvyšok na § 6
  const nczdOn5 = Math.min(czd5, nczdTotal);
  const nczdOn6 = Math.min(czd6AfterLoss, nczdTotal - nczdOn5);
  const base5 = round2(czd5 - nczdOn5);
  const base6 = step({
    id: "zd6",
    group: "dan",
    label: "Základ dane zo živnosti po odpočítaní NČZD",
    value: czd6AfterLoss - nczdOn6,
    formula: `${eur(czd6AfterLoss)} − ${eur(nczdOn6)}${nczdOn5 > 0 ? ` (časť NČZD ${eur(nczdOn5)} sa uplatnila na príjmy zo zamestnania)` : ""}`,
    dpRow: "r. 92 / 94",
  });

  // ---------- 7. Daň ----------
  const reducedOk = !isEmp && income <= T.reducedRateLimit.value;
  const rateLabel = reducedOk ? "15 %" : "progresívna (19 % / 25 % …)";
  const rate15 = isEmp ? 0 : step({
    id: "sadzba15",
    group: "dan",
    label: "Uplatniť 15 % sadzbu na živnosť (1 = áno, 0 = nie)",
    value: reducedOk ? 1 : 0,
    formula: `príjmy ${eur(income)} ${reducedOk ? "≤" : ">"} ${eur(T.reducedRateLimit.value)} → ${rateLabel}`,
    explain: `Ak zdaniteľné príjmy zo živnosti nepresiahnu ${eur(T.reducedRateLimit.value)}, celý základ dane zo živnosti sa zdaní 15 %. Inak sa zdaní spolu s ostatnými príjmami progresívne.`,
    law: "§ 15 písm. a) bod 1 zákona 595/2003 Z. z.",
    params: [{ label: "limit príjmov pre 15 %", param: T.reducedRateLimit }],
    dpRow: "r. 95–96",
  });
  const use15 = rate15 >= 0.5;

  const progressiveBase = round2(base5 + czdNajom + czd8 + (use15 ? 0 : base6));
  const prog = progressiveTax(progressiveBase, T);
  let taxProg = 0;
  if (progressiveBase > 0) {
    taxProg = step({
      id: "danProg",
      group: "dan",
      label: "Daň progresívnou sadzbou",
      value: floor2(prog.tax),
      formula: prog.parts.map((p) => `${eur(p.to - p.from)} × ${pct(p.rate)}`).join(" + ") + ` = ${eur(floor2(prog.tax))}`,
      explain: `Základ ${eur(progressiveBase)} (${[base5 > 0 && "zamestnanie", czdNajom > 0 && "prenájom", czd8 > 0 && "ostatné príjmy § 8", !use15 && base6 > 0 && "živnosť"].filter(Boolean).join(", ")}) sa zdaní po pásmach.`,
      law: "§ 15 písm. a) zákona 595/2003 Z. z.",
      params: T.brackets.filter((b) => b.upTo).map((b) => ({ label: `hranica pásma ${pct(b.rate)}`, param: b.upTo! })),
      dpRow: "r. 80–81",
    });
  }
  let tax15 = 0;
  if (use15 && !isEmp) {
    tax15 = step({
      id: "dan15",
      group: "dan",
      label: "Daň 15 % zo živnosti",
      value: floor2(base6 * T.reducedRate),
      formula: `${eur(base6)} × 15 % = ${eur(floor2(base6 * T.reducedRate))}`,
      law: "§ 15 písm. a) bod 1 zákona 595/2003 Z. z.",
      dpRow: "r. 96",
    });
  }
  const taxRaw = round2(taxProg + tax15);
  const taxTotal = step({
    id: "dan",
    group: "dan",
    label: "Daň spolu",
    value: taxRaw <= T.minTaxLevied.value ? 0 : taxRaw,
    formula: taxRaw <= T.minTaxLevied.value ? `${eur(taxRaw)} ≤ ${eur(T.minTaxLevied.value)} → daň sa nevyrubí` : `${eur(taxProg)} + ${eur(tax15)}`,
    explain: `Daň do ${eur(T.minTaxLevied.value)} sa nevyrubuje ani neplatí.`,
    dpRow: "r. 116",
  });

  // ---------- 8. Daňový bonus ----------
  let bonus = 0;
  if (input.children.length > 0) {
    const zdMonthly = (czd5 + czd6) / 12;
    const reduction = T.bonusReductionThreshold ? Math.max(0, (zdMonthly - T.bonusReductionThreshold.value) / 10) : 0;
    let total = 0;
    const parts: string[] = [];
    for (const ch of input.children) {
      let chTotal = 0;
      for (let m = 1; m <= 12; m++) {
        const age = ageAt(ch.birth, Y, m);
        const [by, bm] = ch.birth.split("-").map(Number);
        if (Y * 12 + m < by * 12 + bm) continue; // ešte nenarodené
        const tier = T.bonusTiers.find((t) => age < t.maxAge);
        if (!tier) continue;
        chTotal += Math.max(0, tier.monthly.value - reduction);
      }
      total += chTotal;
      parts.push(`${ch.name || "dieťa"}: ${eur(chTotal)}`);
    }
    const minIncome = 6 * T.minimalnaMzda.value;
    const eligible = income + emp.gross >= minIncome;
    if (!eligible) warnings.push({ id: "bonus-income", severity: "warn", text: `Na daňový bonus treba zdaniteľné príjmy aspoň 6 × minimálna mzda (${eur(minIncome)}).` });
    bonus = step({
      id: "bonus",
      group: "dan",
      label: "Daňový bonus na deti (odhad)",
      value: eligible ? total : 0,
      formula: parts.join("; ") + (reduction > 0 ? ` (krátenie ${eur(reduction)} mesačne na dieťa)` : ""),
      explain:
        "Suma podľa veku dieťaťa v jednotlivých mesiacoch. " +
        (T.bonusReductionThreshold ? `Pri mesačnom základe dane nad ${eur(T.bonusReductionThreshold.value)} sa bonus kráti o 1/10 z rozdielu. ` : "") +
        "Ide o odhad – presnú sumu si overte, ak je hraničná.",
      law: "§ 33 zákona 595/2003 Z. z.",
      params: T.bonusTiers.map((t) => ({ label: `bonus do ${t.maxAge} r.`, param: t.monthly })),
      dpRow: "r. 117",
    });
  }

  const afterBonus = round2(taxTotal - bonus);
  const toPay = step({
    id: "danNaUhradu",
    group: "dan",
    label: afterBonus - emp.taxWithheld - input.taxAdvancesPaid + emp.bonusPaid >= 0 ? "Daň na úhradu" : "Daňový preplatok / bonus na vyplatenie",
    value: afterBonus + emp.bonusPaid - emp.taxWithheld - input.taxAdvancesPaid,
    formula: `${eur(taxTotal)} − bonus ${eur(bonus)} + bonus vyplatený zamestnávateľom ${eur(emp.bonusPaid)} − zrazené preddavky ${eur(emp.taxWithheld)} − zaplatené preddavky ${eur(input.taxAdvancesPaid)}`,
    explain: "Kladná suma = doplatok dane do 31. 3. (alebo do konca odkladu). Záporná = preplatok / bonus, ktorý vám vráti daňový úrad.",
    dpRow: "r. 135 / 136",
  });

  // ---------- 9. Nasledujúci rok: odvody, preddavky ----------
  const next: NextYear = isEmp
    ? {
        year: Y + 1,
        spFromJuly: 0,
        spVZ: 0,
        spRegime: "none",
        zpMonthly: 0,
        zpVZ: 0,
        zpSettlement: 0,
        taxAdvance: { period: "none", amount: 0 },
        paramsStatus: ypNext ? ypNext.status : "chýbajú",
      }
    : computeNext(Y, income, czd6, zpPaid, step, warnings, ypNext, yp, taxTotal, T);
  if (isEmp) {
    warnings.push({ id: "emp-insurance", severity: "info", text: "Zdravotné a sociálne poistenie zamestnanca odvádza za vás zamestnávateľ (je už zahrnuté v poistnom zamestnanca na potvrdení)." });
  }

  // ---------- 10. Limity ----------
  const projectMonth = (limit: number): number | null => {
    if (input.income.mode !== "monthly") return null;
    let acc = 0;
    for (let i = 0; i < 12; i++) {
      acc += monthsIncome[i].v;
      if (acc > limit) return i + 1;
    }
    return null;
  };
  const addLimit = (l: Omit<LimitInfo, "exceeded" | "projectedMonth"> & { useProjection?: boolean }) => {
    limits.push({ ...l, exceeded: l.current > l.limit, projectedMonth: l.useProjection ? projectMonth(l.limit) : undefined });
  };

  if (!isEmp && input.expenses.mode === "pausal") {
    addLimit({
      id: "pausalCap",
      label: "Strop paušálnych výdavkov",
      measure: "príjmy",
      current: income,
      limit: round2(T.pausalCap.value / T.pausalRate),
      consequence: "Ďalšie príjmy už nezvyšujú paušálne výdavky – každé euro navyše sa celé zdaní a zvýši odvody.",
      param: T.pausalCap,
      useProjection: true,
    });
  }
  if (!isEmp) addLimit({
    id: "rate15",
    label: "Limit pre 15 % sadzbu dane",
    measure: "príjmy",
    current: income,
    limit: T.reducedRateLimit.value,
    consequence: "Celý základ dane zo živnosti sa zdaní progresívne (19 % a viac) namiesto 15 %.",
    param: T.reducedRateLimit,
    useProjection: true,
  });
  addLimit({
    id: "nczdReduce",
    label: "Začiatok krátenia nezdaniteľnej časti",
    measure: "základ dane",
    current: zdForNczd,
    limit: T.nczdFullUpTo.value,
    consequence: `Nezdaniteľná časť ${eur(T.nczd.value)} sa začne znižovať (o 1/${T.nczdReduceDivisor} z každého eura navyše).`,
    param: T.nczdFullUpTo,
  });
  const totalBase = round2(progressiveBase + (use15 ? base6 : 0));
  const nextBracket = T.brackets.find((b) => b.upTo && b.upTo.value >= (use15 ? progressiveBase : totalBase));
  if (nextBracket?.upTo) {
    const idx = T.brackets.indexOf(nextBracket);
    addLimit({
      id: "bracket",
      label: `Hranica pásma dane ${pct(T.brackets[idx + 1].rate)}`,
      measure: use15 ? "základ dane zdaňovaný progresívne" : "základ dane",
      current: use15 ? progressiveBase : totalBase,
      limit: nextBracket.upTo.value,
      consequence: `Časť základu nad hranicu sa zdaní ${pct(T.brackets[idx + 1].rate)}.`,
      param: nextBracket.upTo,
    });
  }
  if (!isEmp && ypNext) {
    const mikro = ypNext.sp.mikro;
    if (mikro?.lowerIncome) {
      // od 7/2026: do 10,5 × ŽM bez povinnosti, potom mikroodvod, nad limitVzniku riadne odvody
      addLimit({
        id: "spVznik",
        label: `Povinné sociálne poistenie od 1. 7. ${Y + 1}`,
        measure: "príjmy",
        current: income,
        limit: mikro.lowerIncome.value,
        consequence: `Vznikne povinné sociálne poistenie – pri príjmoch do ${eur(ypNext.sp.limitVzniku.value)} ako mikroodvod ${eur(mikro.poistne.value)} mesačne.`,
        param: mikro.lowerIncome,
        useProjection: true,
      });
      addLimit({
        id: "spMikro",
        label: `Koniec mikroodvodu od 1. 7. ${Y + 1}`,
        measure: "príjmy",
        current: income,
        limit: ypNext.sp.limitVzniku.value,
        consequence: `Namiesto mikroodvodu ${eur(mikro.poistne.value)} budete platiť riadne sociálne poistenie, aspoň ${eur(ypNext.sp.minPoistne.value)} mesačne.`,
        param: ypNext.sp.limitVzniku,
        useProjection: true,
      });
    } else {
      addLimit({
        id: "spVznik",
        label: `Povinné sociálne poistenie od 1. 7. ${Y + 1}`,
        measure: "príjmy",
        current: income,
        limit: ypNext.sp.limitVzniku.value,
        consequence: `Vznikne povinné sociálne poistenie s odvodom aspoň ${eur(ypNext.sp.minPoistne.value)} mesačne${mikro ? ` (pod limitom mikroodvod ${eur(mikro.poistne.value)})` : ""}.`,
        param: ypNext.sp.limitVzniku,
        useProjection: true,
      });
    }
    const spMaxZd = round2(ypNext.sp.maxVZ.value * 12 * ypNext.sp.koeficient);
    addLimit({
      id: "spMax",
      label: "Maximálny vymeriavací základ SP",
      measure: "základ dane zo živnosti",
      current: czd6,
      limit: spMaxZd,
      consequence: "Nad touto hranicou sa sociálne odvody už nezvyšujú.",
      param: ypNext.sp.maxVZ,
    });
    const spMinZd = round2(ypNext.sp.minVZ.value * 12 * ypNext.sp.koeficient);
    addLimit({
      id: "spMin",
      label: "Odvody nad minimum",
      measure: "základ dane zo živnosti",
      current: czd6,
      limit: spMinZd,
      consequence: `Nad touto hranicou budú odvody od 7/${Y + 1} vyššie ako minimum.`,
      param: ypNext.sp.minVZ,
    });
  }
  const dph = yp?.dph ?? ypPrev?.dph;
  if (!isEmp && dph) {
    addLimit({
      id: "dph",
      label: "Registrácia pre DPH",
      measure: "obrat (≈ príjmy) za kalendárny rok",
      current: income,
      limit: dph.registration.value,
      consequence: `Stanete sa platiteľom DPH od 1. 1. ${Y + 1}${dph.immediate ? `; pri prekročení ${eur(dph.immediate.value)} okamžite` : ""}. Žiadosť treba podať včas.`,
      param: dph.registration,
      useProjection: true,
    });
    if (dph.immediate) {
      addLimit({
        id: "dphImmediate",
        label: "Okamžitá registrácia DPH",
        measure: "obrat v bežnom roku",
        current: income,
        limit: dph.immediate.value,
        consequence: "Platiteľom DPH ste dňom dodania, ktorým ste limit prekročili.",
        param: dph.immediate,
        useProjection: true,
      });
    }
  }
  // ---------- Daňové priznanie ----------
  const filingIncome = round2(income + emp.gross + rentalTaxableIncome + other8TaxableIncome);
  const filingLimit = round2(T.nczd.value / 2);
  const hasBusiness = income > 0;
  const hasRentalTaxable = rentalTaxableIncome > 0;
  const has8Taxable = other8TaxableIncome > 0;
  const dpType: FilingInfo["type"] = filingIncome <= 0 ? null : hasBusiness || hasRentalTaxable || has8Taxable ? "B" : "A";
  const reasons: string[] = [];
  let mustFile: boolean;
  let canUseRZ = false;
  if (dpType === null) {
    mustFile = false;
    reasons.push("Nemáte žiadne zdaniteľné príjmy, daňové priznanie podávať nemusíte.");
  } else if (dpType === "A") {
    mustFile = false;
    canUseRZ = true;
    reasons.push("Máte len príjmy zo závislej činnosti (§ 5), ktoré za vás zdaňuje zamestnávateľ.");
    reasons.push(`Môžete požiadať zamestnávateľa o ročné zúčtovanie do 15. 2. ${Y + 1}, alebo podať daňové priznanie typ A do 31. 3. ${Y + 1} (napr. ak si chcete uplatniť viac, ako zohľadnil zamestnávateľ).`);
  } else {
    mustFile = filingIncome > filingLimit;
    const parts: string[] = [];
    if (hasBusiness) parts.push("príjmy z podnikania (§ 6 ods. 1 a 2)");
    if (hasRentalTaxable) parts.push("zdaniteľný prenájom (§ 6 ods. 3)");
    if (has8Taxable) parts.push("ostatné príjmy (§ 8)");
    reasons.push(`Máte ${parts.join(", ")}${emp.gross > 0 ? " popri zamestnaní" : ""}, preto sa podáva typ B.`);
    reasons.push(
      mustFile
        ? `Zdaniteľné príjmy ${eur(filingIncome)} presahujú 50 % nezdaniteľnej časti (${eur(filingLimit)}), daňové priznanie podať musíte.`
        : `Zdaniteľné príjmy ${eur(filingIncome)} nepresahujú 50 % nezdaniteľnej časti (${eur(filingLimit)}), daňové priznanie podať nemusíte (môžete dobrovoľne, napr. pre bonus alebo preplatok).`,
    );
    if (emp.gross > 0) reasons.push("Pri iných príjmoch popri zamestnaní ročné zúčtovanie u zamestnávateľa nie je možné.");
  }
  const filing: FilingInfo = { mustFile, type: dpType, canUseRZ, deadline: `31. 3. ${Y + 1}`, reasons };
  addLimit({
    id: "filing",
    label: "Povinnosť podať daňové priznanie",
    measure: "zdaniteľné príjmy",
    current: filingIncome,
    limit: filingLimit,
    consequence: dpType === "A" ? `Pri príjmoch len zo zamestnania stačí ročné zúčtovanie u zamestnávateľa.` : `Musíte podať daňové priznanie (typ B) do 31. 3. ${Y + 1}.`,
    param: T.nczd,
  });
  if (T.bonusTiers.length && input.children.length) {
    addLimit({
      id: "bonusMin",
      label: "Minimálny príjem pre daňový bonus",
      measure: "zdaniteľné príjmy",
      current: income + emp.gross,
      limit: 6 * T.minimalnaMzda.value,
      consequence: "Nad touto hranicou máte nárok na daňový bonus (je to dolná hranica, ktorú treba dosiahnuť).",
      param: T.minimalnaMzda,
    });
  }

  for (const l of limits) {
    if (!l.exceeded && l.projectedMonth && ["pausalCap", "rate15", "dph", "dphImmediate", "spVznik"].includes(l.id)) {
      warnings.push({
        id: `proj-${l.id}`,
        severity: "warn",
        text: `Pri súčasnom tempe prekročíte limit „${l.label}“ (${eur(l.limit)}) v mesiaci ${MONTHS[l.projectedMonth - 1]}.`,
      });
    }
    if (l.exceeded && ["dph", "dphImmediate", "rate15"].includes(l.id)) {
      warnings.push({ id: `exc-${l.id}`, severity: "danger", text: `Prekročený limit „${l.label}“: ${l.consequence}` });
    }
  }

  // ---------- 11. Súhrn ----------
  // Jednotný súhrn pre všetky profily (SZČO, zamestnanec, súbeh):
  //   príjmy = živnosť + hrubá mzda + prenájom + § 8
  //   príjem po dani a odvodoch = príjmy − daň po bonuse − odvody SZČO − poistné zamestnanca
  // Obe sumy sú PRED skutočnými nákladmi (paušál ani výdavky na prenájom/§ 8 sa neodpočítavajú).
  const summaryIncome = round2(income + emp.gross + input.rental.income + otherIncomeTotal);
  const net = round2(summaryIncome - Math.max(0, taxTotal - bonus) - spPaid - zpPaid - emp.insurance);
  const stepById = Object.fromEntries(steps.map((s) => [s.id, s]));
  return {
    year: Y,
    taxParamsYear: taxYear,
    steps,
    stepById,
    warnings,
    limits,
    months,
    next,
    profile,
    filing,
    summary: {
      income: summaryIncome,
      tax: taxTotal,
      taxToPay: toPay,
      sp: spPaid,
      zp: zpPaid,
      net,
      netMonthly: round2(net / 12),
      effectiveRate: summaryIncome > 0 ? (summaryIncome - net) / summaryIncome : 0,
      employeeInsurance: emp.insurance,
    },
  };
}

function computeNext(
  Y: number,
  income: number,
  czd6: number,
  zpPaid: number,
  step: (s: Omit<Step, "value" | "overridden"> & { value: number }) => number,
  warnings: Warning[],
  ypNext: YearParams | undefined,
  yp: YearParams | undefined,
  taxTotal: number,
  T: TaxParams,
): NextYear {
  const N = Y + 1;
  const res: NextYear = {
    year: N,
    spFromJuly: 0,
    spVZ: 0,
    spRegime: "unknown",
    zpMonthly: 0,
    zpVZ: 0,
    zpSettlement: 0,
    taxAdvance: { period: "none", amount: 0 },
    paramsStatus: ypNext ? ypNext.status : "chýbajú",
  };
  if (!ypNext) {
    warnings.push({ id: "next-missing", severity: "warn", text: `Sadzby odvodov na rok ${N} ešte nie sú známe – odvody na rok ${N} zatiaľ nevieme odhadnúť.` });
  } else {
    if (ypNext.status === "predbežné") {
      warnings.push({ id: "next-prelim", severity: "info", text: `Odvody na rok ${N} sú odhad – časť sadzieb na rok ${N} je predbežná (odvodená z dostupných údajov).` });
    }
    const sp = ypNext.sp;
    const vzRaw = czd6 / sp.koeficient / 12;
    let regime: NextYear["spRegime"];
    let explain: string;
    if (income > sp.limitVzniku.value) {
      regime = "standard";
      explain = `Príjmy ${eur(income)} > ${eur(sp.limitVzniku.value)} → od 1. 7. ${N} ste povinne sociálne poistený. Vymeriavací základ = základ dane / ${sp.koeficient} / 12, najmenej ${eur(sp.minVZ.value)}, najviac ${eur(sp.maxVZ.value)}.`;
    } else if (sp.mikro && (!sp.mikro.lowerIncome || income > sp.mikro.lowerIncome.value)) {
      regime = "mikro";
      explain = `Príjmy ${eur(income)} ≤ ${eur(sp.limitVzniku.value)} → platí sa mikroodvod z osobitného vymeriavacieho základu ${eur(sp.mikro.vz.value)}.`;
    } else {
      regime = "none";
      explain = `Príjmy ${eur(income)} ≤ ${eur(sp.limitVzniku.value)} → povinné sociálne poistenie od 1. 7. ${N} nevznikne (môžete sa poistiť dobrovoľne).`;
    }
    const vz = regime === "standard" ? Math.min(sp.maxVZ.value, Math.max(sp.minVZ.value, ceil2(vzRaw))) : regime === "mikro" ? sp.mikro!.vz.value : 0;
    res.spVZ = round2(vz);
    res.spRegime = regime;
    res.spFromJuly = step({
      id: "spBuduci",
      group: "buduci",
      label: `Sociálne poistenie mesačne od 7/${N}`,
      value: regime === "mikro" ? sp.mikro!.poistne.value : regime === "none" ? 0 : spFromVZ(vz, sp),
      formula:
        regime === "standard"
          ? `VZ = ${eur(czd6)} / ${sp.koeficient} / 12 = ${eur(vzRaw)} → ${eur(vz)}; poistné = ${eur(vz)} × 33,15 % (po fondoch, zaokrúhlené nadol)`
          : regime === "mikro"
            ? `mikroodvod ${eur(sp.mikro!.poistne.value)}`
            : "0 €",
      explain,
      law: "§ 21 a § 138 zákona č. 461/2003 Z. z.",
      params: [
        { label: "limit vzniku", param: sp.limitVzniku },
        { label: "min. VZ", param: sp.minVZ },
        { label: "max. VZ", param: sp.maxVZ },
      ],
    });

    const zp = ypNext.zp;
    const zpVzRaw = czd6 / zp.koeficient / 12;
    const zpVz = Math.max(zp.minVZ.value, ceil2(zpVzRaw));
    res.zpVZ = round2(zpVz);
    res.zpMonthly = step({
      id: "zpBuduci",
      group: "buduci",
      label: `Preddavok na zdravotné poistenie ${N} (odhad)`,
      value: ceil2(zpVz * zp.rate),
      formula: `VZ = max(${eur(zp.minVZ.value)}; ${eur(czd6)} / ${zp.koeficient} / 12 = ${eur(zpVzRaw)}) = ${eur(zpVz)}; × ${pct(zp.rate)}`,
      explain: "Výška preddavku sa mení po podaní daňového priznania (zvyčajne od mesiaca po termíne podania). Minimálny preddavok platí od januára.",
      law: "§ 16 a § 13 zákona č. 580/2004 Z. z.",
      params: [{ label: "min. VZ ZP", param: zp.minVZ }],
    });
  }

  if (yp) {
    const zp = yp.zp;
    const annualVz = Math.max(zp.minVZ.value * 12, czd6 / zp.koeficient);
    const due = ceil2(annualVz * zp.rate);
    res.zpSettlement = step({
      id: "zpZuctovanie",
      group: "buduci",
      label: `Ročné zúčtovanie ZP za ${Y} (+ nedoplatok / − preplatok, odhad)`,
      value: due - zpPaid,
      formula: `poistné = max(12 × ${eur(zp.minVZ.value)}; ${eur(czd6)} / ${zp.koeficient}) × ${pct(zp.rate)} = ${eur(due)}; − zaplatené ${eur(zpPaid)}`,
      explain: "Zdravotná poisťovňa zúčtuje rok podľa daňového priznania, výsledok zašle do 30. 9. nasledujúceho roka. Zaplatené preddavky tu zahŕňajú platby v kalendárnom roku – ak ste platili mesiac pozadu, rozdiel bude mierne iný.",
      law: "§ 19 zákona č. 580/2004 Z. z.",
    });
  }

  const period = taxTotal > T.advanceMonthly.value ? "monthly" : taxTotal > T.advanceQuarterly.value ? "quarterly" : "none";
  res.taxAdvance = { period, amount: period === "monthly" ? floor2(taxTotal / 12) : period === "quarterly" ? floor2(taxTotal / 4) : 0 };
  step({
    id: "preddavkyDan",
    group: "buduci",
    label: period === "none" ? `Preddavky na daň ${N}` : period === "monthly" ? `Preddavky na daň ${N} – mesačne` : `Preddavky na daň ${N} – štvrťročne`,
    value: res.taxAdvance.amount,
    editable: false,
    formula:
      period === "none"
        ? `daň ${eur(taxTotal)} ≤ ${eur(T.advanceQuarterly.value)} → preddavky sa neplatia`
        : `daň ${eur(taxTotal)} / ${period === "monthly" ? 12 : 4}`,
    explain: `Preddavky sa platia, ak posledná známa daňová povinnosť presiahla ${eur(T.advanceQuarterly.value)} (štvrťročne) alebo ${eur(T.advanceMonthly.value)} (mesačne).`,
    law: "§ 34 zákona 595/2003 Z. z.",
  });
  return res;
}

export type { P };
