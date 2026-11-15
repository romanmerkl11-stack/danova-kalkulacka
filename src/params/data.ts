import type { ParamSet, P, SpFund } from "./types";

// Zabalené sadzby. Aktualizujú sa cez „Skontrolovať nové sadzby“ (vždy s potvrdením používateľa).
// verified: false = hodnota z neoficiálneho zdroja alebo odvodená, appka ju zobrazí s ⚠.

const FS_NCZD_2026 =
  "https://podpora.financnasprava.sk/260857-Nezdaniteľná-časť-základu-dane-na-daňovníka-za-rok-2026";
const FS_BONUS_2026 = "https://podpora.financnasprava.sk/549090-Daňový-bonus-na-vyživované-dieťa-v-roku-2026";
const FS_PAUSAL = "https://podpora.financnasprava.sk/270033-Výdavky-percentom-z-príjmov-";
const SP_2026 =
  "https://www.socpoist.sk/news/nove-vymeriavacie-zaklady-pre-platenie-poistneho-od-1-januara-2026";
const SP_MIKRO = "https://www.socpoist.sk/socialne-poistenie/platenie-poistneho/poistne-szco-od-1-jula-2026-mikroodvod";
const PODNIKAJTE_PROGRESIA =
  "https://www.podnikajte.sk/dan-z-prijmov/progresivne-zdanenie-prijmov-fyzickych-osob-od-2026";
const PODNIKAJTE_ODVODY_2025 = "https://www.podnikajte.sk/socialne-a-zdravotne-odvody/odvody-szco-od-1-1-2025";
const PODNIKAJTE_NCZD_2025 = "https://www.podnikajte.sk/dan-z-prijmov/nezdanitelne-casti-zakladu-dane-2025";
const PODNIKAJTE_ODVODY_2022 =
  "https://www.podnikajte.sk/socialne-a-zdravotne-odvody/hranica-prijmov-platenie-odvodov-2022";
const MPSVR_2026 = "https://employment.gov.sk/sk/socialne-poistenie-dochodkovy-system/socialne-poistenie/najvyznamnejsie-zmeny-socialnom-poisteni/zmeny-od-1-jula-2026.html";
const PODNIKAJTE_2027 = "https://www.podnikajte.sk/socialne-a-zdravotne-odvody/hranica-prijmov-pre-ne-platenie-odvodov-do-socialnej-poistovne-v-roku-2027";
const PODNIKAJTE_DPH = "https://www.podnikajte.sk/dan-z-pridanej-hodnoty/registracia-pre-dph-od-2025";
const NETFINANCIE_ZP_2026 =
  "https://www.netfinancie.sk/zdravotne-poistenie/szco_vymeriavacie_zaklady_a_preddavky_poistneho_2026.pdf";

const p = (value: number, validFrom: string, verified: boolean, source?: string, note?: string, validTo?: string): P => ({
  value,
  validFrom,
  verified,
  ...(source ? { source } : {}),
  ...(note ? { note } : {}),
  ...(validTo ? { validTo } : {}),
});

/** Fondy sociálneho poistenia SZČO: nemocenské, starobné, invalidné, rezervný = 33,15 % */
const SP_FUNDS: SpFund[] = [
  { name: "nemocenské", rate: 0.044 },
  { name: "starobné", rate: 0.18 },
  { name: "invalidné", rate: 0.06 },
  { name: "rezervný fond", rate: 0.0475 },
];

/** dátum poslednej úpravy zabalených sadzieb – staršie „prijaté“ sadzby sa ignorujú */
export const PARAMS_DATE = "2026-11-15";

export const PARAMS: ParamSet = {
  2024: {
    year: 2024,
    status: "platné",
    tax: {
      zivotneMinimum: p(268.88, "2023-07-01", true, undefined, "ŽM platné k 1. 1. 2024"),
      nczd: p(5646.48, "2024-01-01", true, undefined, "21 × ŽM"),
      nczdFullUpTo: p(24952.06, "2024-01-01", true, undefined, "92,8 × ŽM"),
      nczdReduceConst: p(11884.5, "2024-01-01", true, undefined, "44,2 × ŽM"),
      nczdReduceDivisor: 4,
      spouse: p(5162.49, "2024-01-01", true, undefined, "19,2 × ŽM"),
      spouseFullUpTo: p(47537.98, "2024-01-01", true, undefined, "176,8 × ŽM"),
      ddsMax: p(180, "2024-01-01", true),
      brackets: [{ upTo: p(47537.98, "2024-01-01", true, undefined, "176,8 × ŽM"), rate: 0.19 }, { upTo: null, rate: 0.25 }],
      reducedRate: 0.15,
      reducedRateLimit: p(49790, "2024-01-01", true, undefined, "príjmy § 6 ods. 1 a 2 do 49 790 €"),
      minTaxLevied: p(17, "2024-01-01", true),
      pausalRate: 0.6,
      pausalCap: p(20000, "2023-01-01", true, FS_PAUSAL),
      bonusTiers: [
        { maxAge: 18, monthly: p(140, "2024-01-01", true) },
        { maxAge: 25, monthly: p(50, "2024-01-01", true) },
      ],
      bonusReductionThreshold: null,
      minimalnaMzda: p(750, "2024-01-01", true),
      advanceQuarterly: p(5000, "2024-01-01", true),
      advanceMonthly: p(16600, "2024-01-01", true),
    },
    sp: {
      priemernaMzda: p(1304, "2024-01-01", true, undefined, "priemerná mesačná mzda v SR za rok 2022"),
      minVZ: p(652, "2024-01-01", true, PODNIKAJTE_ODVODY_2022, "50 % priemernej mzdy 2022"),
      minPoistne: p(216.13, "2024-01-01", true),
      maxVZ: p(9128, "2024-01-01", true, "https://www.podnikajte.sk/socialne-a-zdravotne-odvody/socialne-odvody-szco-od-1-7-2024", "7 × priemerná mzda 2022 (11 × platí až od 2025)"),
      funds: SP_FUNDS,
      limitVzniku: p(7824, "2024-07-01", true, undefined, "príjmy za rok 2023 (12 × 652 €)"),
      koeficient: 1.486,
    },
    zp: {
      rate: 0.15,
      minVZ: p(652, "2024-01-01", true),
      minPreddavok: p(97.8, "2024-01-01", true),
      koeficient: 1.486,
    },
    dph: {
      registration: p(49790, "2024-01-01", true, undefined, "obrat za 12 po sebe idúcich mesiacov"),
      immediate: null,
      note: "Do 31. 12. 2024 sa obrat sledoval za 12 po sebe idúcich mesiacov.",
    },
  },

  2025: {
    year: 2025,
    status: "platné",
    tax: {
      zivotneMinimum: p(273.99, "2024-07-01", true, PODNIKAJTE_NCZD_2025),
      nczd: p(5753.79, "2025-01-01", true, PODNIKAJTE_NCZD_2025, "21 × ŽM"),
      nczdFullUpTo: p(25426.27, "2025-01-01", true, PODNIKAJTE_NCZD_2025, "92,8 × ŽM"),
      nczdReduceConst: p(12110.36, "2025-01-01", true, PODNIKAJTE_NCZD_2025, "44,2 × ŽM"),
      nczdReduceDivisor: 4,
      spouse: p(5260.6, "2025-01-01", true, PODNIKAJTE_NCZD_2025, "19,2 × ŽM"),
      spouseFullUpTo: p(48441.43, "2025-01-01", true, undefined, "176,8 × ŽM"),
      ddsMax: p(180, "2025-01-01", true),
      brackets: [{ upTo: p(48441.43, "2025-01-01", true, undefined, "176,8 × ŽM"), rate: 0.19 }, { upTo: null, rate: 0.25 }],
      reducedRate: 0.15,
      reducedRateLimit: p(100000, "2025-01-01", true, undefined, "zvýšené zo 60 000 € od 1. 1. 2025"),
      minTaxLevied: p(17, "2025-01-01", true),
      pausalRate: 0.6,
      pausalCap: p(20000, "2023-01-01", true, FS_PAUSAL),
      bonusTiers: [
        { maxAge: 15, monthly: p(100, "2025-01-01", true) },
        { maxAge: 18, monthly: p(50, "2025-01-01", true) },
      ],
      bonusReductionThreshold: p(2145, "2025-01-01", true, "https://podpora.financnasprava.sk/272586-Da%C5%88ov%C3%BD-bonus-na-die%C5%A5a-v-roku-2025", "krátenie 1/10 z rozdielu"),
      minimalnaMzda: p(816, "2025-01-01", true),
      advanceQuarterly: p(5000, "2025-01-01", true),
      advanceMonthly: p(16600, "2025-01-01", true),
    },
    sp: {
      priemernaMzda: p(1430, "2025-01-01", true, PODNIKAJTE_ODVODY_2025, "priemerná mesačná mzda v SR za rok 2023"),
      minVZ: p(715, "2025-01-01", true, PODNIKAJTE_ODVODY_2025, "50 % priemernej mzdy 2023"),
      minPoistne: p(237.02, "2025-01-01", true, PODNIKAJTE_ODVODY_2025),
      maxVZ: p(15730, "2025-01-01", true, PODNIKAJTE_ODVODY_2025, "11 × priemerná mzda 2023"),
      funds: SP_FUNDS,
      limitVzniku: p(8580, "2025-07-01", true, undefined, "príjmy za rok 2024 (12 × 715 €)"),
      koeficient: 1.486,
    },
    zp: {
      rate: 0.15,
      minVZ: p(715, "2025-01-01", true, PODNIKAJTE_ODVODY_2025),
      minPreddavok: p(107.25, "2025-01-01", true, PODNIKAJTE_ODVODY_2025),
      koeficient: 1.486,
    },
    dph: {
      registration: p(50000, "2025-01-01", true, PODNIKAJTE_DPH, "obrat za kalendárny rok → platiteľ od 1. 1. nasledujúceho roka"),
      immediate: p(62500, "2025-01-01", true, PODNIKAJTE_DPH, "prekročenie v bežnom roku → platiteľ dňom dodania, ktorým sa limit prekročil"),
    },
  },

  2026: {
    year: 2026,
    status: "platné",
    tax: {
      zivotneMinimum: p(284.13, "2025-07-01", true, FS_NCZD_2026),
      nczd: p(5966.73, "2026-01-01", true, FS_NCZD_2026, "21 × ŽM"),
      nczdFullUpTo: p(26083.13, "2026-01-01", true, FS_NCZD_2026, "91,8 × ŽM"),
      nczdReduceConst: p(14661.11, "2026-01-01", true, FS_NCZD_2026, "51,6 × ŽM; krátenie ZD/3 (konsolidácia 2026)"),
      nczdReduceDivisor: 3,
      spouse: p(5455.3, "2026-01-01", true, PODNIKAJTE_PROGRESIA, "19,2 × ŽM"),
      spouseFullUpTo: p(43983.32, "2026-01-01", true, PODNIKAJTE_PROGRESIA),
      ddsMax: p(180, "2026-01-01", true),
      brackets: [
        { upTo: p(43983.32, "2026-01-01", true, PODNIKAJTE_PROGRESIA, "154,8 × ŽM"), rate: 0.19 },
        { upTo: p(60349.21, "2026-01-01", true, PODNIKAJTE_PROGRESIA, "212,4 × ŽM"), rate: 0.25 },
        { upTo: p(75010.32, "2026-01-01", true, PODNIKAJTE_PROGRESIA, "264 × ŽM"), rate: 0.3 },
        { upTo: null, rate: 0.35 },
      ],
      reducedRate: 0.15,
      reducedRateLimit: p(100000, "2025-01-01", true, PODNIKAJTE_PROGRESIA),
      minTaxLevied: p(17, "2026-01-01", true),
      pausalRate: 0.6,
      pausalCap: p(20000, "2023-01-01", true, FS_PAUSAL),
      bonusTiers: [
        { maxAge: 15, monthly: p(100, "2026-01-01", true, FS_BONUS_2026) },
        { maxAge: 18, monthly: p(50, "2026-01-01", true, FS_BONUS_2026) },
      ],
      bonusReductionThreshold: p(2286, "2026-01-01", true, FS_BONUS_2026, "bonus sa kráti o 1/10 × (mesačný ZD − 2 286 €)"),
      minimalnaMzda: p(915, "2026-01-01", true, "https://www.podnikajte.sk/socialne-a-zdravotne-odvody/hruba-a-cista-minimalna-mzda-v-roku-2027"),
      advanceQuarterly: p(5000, "2026-01-01", true),
      advanceMonthly: p(16600, "2026-01-01", true),
    },
    sp: {
      priemernaMzda: p(1524, "2026-01-01", true, SP_2026, "priemerná mesačná mzda v SR za rok 2024"),
      minVZ: p(914.4, "2026-01-01", true, SP_2026, "60 % priemernej mzdy 2024 (konsolidácia 2026)"),
      minPoistne: p(303.11, "2026-01-01", true, SP_2026),
      maxVZ: p(16764, "2026-01-01", true, SP_2026, "11 × priemerná mzda 2024"),
      funds: SP_FUNDS,
      limitVzniku: p(9144, "2026-07-01", true, MPSVR_2026, "hranica mikroodvodu: 50 % z 12 × 1 524 € (príjmy za rok 2025); nad ňou riadne odvody"),
      koeficient: 1.486,
      mikro: {
        vz: p(396.24, "2026-07-01", true, SP_MIKRO, "osobitný vymeriavací základ", "2026-12-31"),
        poistne: p(131.34, "2026-07-01", true, SP_MIKRO, "mikroodvod", "2026-12-31"),
        lowerIncome: p(2876.9, "2026-07-01", true, MPSVR_2026, "10,5 × životné minimum – do tejto sumy príjmov povinnosť nevzniká"),
      },
    },
    zp: {
      rate: 0.16,
      minVZ: p(762, "2026-01-01", true, NETFINANCIE_ZP_2026, "50 % priemernej mzdy 2024"),
      minPreddavok: p(121.92, "2026-01-01", true, NETFINANCIE_ZP_2026),
      koeficient: 1.486,
    },
    dph: {
      registration: p(50000, "2025-01-01", true, PODNIKAJTE_DPH),
      immediate: p(62500, "2025-01-01", true, PODNIKAJTE_DPH),
    },
  },

  2027: {
    year: 2027,
    status: "predbežné",
    tax: null,
    sp: {
      priemernaMzda: p(1620, "2027-01-01", true, PODNIKAJTE_2027, "priemerná mesačná mzda v SR za rok 2025"),
      minVZ: p(972, "2027-01-01", true, PODNIKAJTE_2027, "60 % z 1 620 €"),
      minPoistne: p(322.21, "2027-01-01", true, PODNIKAJTE_2027),
      maxVZ: p(17820, "2027-01-01", true, PODNIKAJTE_2027, "11 × 1 620 €"),
      funds: SP_FUNDS,
      limitVzniku: p(9720, "2027-07-01", false, PODNIKAJTE_2027, "hranica mikroodvodu: 50 % z 12 × 1 620 € (príjmy za rok 2026) – odvodené z pravidla 2026"),
      koeficient: 1.486,
      mikro: {
        vz: p(421.2, "2027-01-01", true, SP_MIKRO, "osobitný vymeriavací základ 2027"),
        poistne: p(139.61, "2027-01-01", true, SP_MIKRO),
        lowerIncome: p(2983.37, "2027-07-01", true, PODNIKAJTE_2027, "10,5 × životné minimum – do tejto sumy príjmov (2026) povinnosť nevzniká"),
      },
    },
    zp: {
      rate: 0.16,
      minVZ: p(810, "2027-01-01", false, undefined, "50 % z 1 620 € – podľa pravidla 2026, oficiálne nepotvrdené"),
      minPreddavok: p(129.6, "2027-01-01", false, "https://pravnenoviny.sk/?p=20581", "16 % z 810 € – sadzba 16 % pre 2027 oficiálne nepotvrdená"),
      koeficient: 1.486,
    },
    dph: {
      registration: p(50000, "2025-01-01", true, PODNIKAJTE_DPH),
      immediate: p(62500, "2025-01-01", true, PODNIKAJTE_DPH),
    },
  },
};
