// Typy parametrov (sadzby a limity) pre jeden kalendárny rok.
// Každá hodnota nesie zdroj a dátum účinnosti, aby sa dala v appke vysvetliť a overiť.

export interface P {
  value: number;
  /** ISO dátum, odkedy hodnota platí */
  validFrom: string;
  /** ISO dátum, dokedy platí (vrátane); chýba = do odvolania / do konca roka */
  validTo?: string;
  /** URL zdroja */
  source?: string;
  note?: string;
  /** false = hodnotu sa nepodarilo overiť z oficiálneho zdroja, appka ju označí ⚠ */
  verified: boolean;
}

export interface Bracket {
  /** horná hranica pásma základu dane (vrátane); null = bez hranice */
  upTo: P | null;
  rate: number;
}

export interface BonusTier {
  /** vek, do ktorého (bez dovŕšenia) platí suma */
  maxAge: number;
  monthly: P;
}

export interface TaxParams {
  zivotneMinimum: P;
  nczd: P;
  /** do tejto výšky základu dane sa uplatní plná NČZD */
  nczdFullUpTo: P;
  /** NČZD = nczdReduceConst − ZD / nczdReduceDivisor */
  nczdReduceConst: P;
  nczdReduceDivisor: number;
  spouse: P;
  spouseFullUpTo: P;
  ddsMax: P;
  brackets: Bracket[];
  reducedRate: number;
  /** zdaniteľné príjmy § 6 ods. 1 a 2 do tejto sumy → 15 % */
  reducedRateLimit: P;
  /** daň sa nevyrubí, ak nepresiahne */
  minTaxLevied: P;
  pausalRate: number;
  pausalCap: P;
  bonusTiers: BonusTier[];
  /** mesačný základ dane, nad ktorým sa bonus kráti (1/10 z rozdielu na dieťa) */
  bonusReductionThreshold: P | null;
  minimalnaMzda: P;
  /** preddavky na daň: nad túto daň štvrťročne */
  advanceQuarterly: P;
  /** preddavky na daň: nad túto daň mesačne */
  advanceMonthly: P;
}

export interface SpFund {
  name: string;
  rate: number;
}

export interface SpParams {
  priemernaMzda: P;
  /** minimálny mesačný vymeriavací základ */
  minVZ: P;
  /** minimálne mesačné poistné (podľa Sociálnej poisťovne, zaokrúhlené po fondoch) */
  minPoistne: P;
  maxVZ: P;
  funds: SpFund[];
  /** príjem z podnikania za PREDCHÁDZAJÚCI rok, nad ktorý vzniká povinné SP od 1. 7. tohto roka */
  limitVzniku: P;
  koeficient: number;
  /** osobitný vymeriavací základ (mikroodvod) pre SZČO s príjmom do limitu */
  mikro?: { vz: P; poistne: P; lowerIncome?: P };
}

export interface ZpParams {
  rate: number;
  minVZ: P;
  minPreddavok: P;
  koeficient: number;
}

export interface DphParams {
  /** obrat v kalendárnom roku → platiteľ od 1. 1. nasledujúceho roka */
  registration: P;
  /** obrat → platiteľ okamžite */
  immediate: P | null;
  note?: string;
}

export interface YearParams {
  year: number;
  status: "platné" | "predbežné";
  /** daňové parametre roka (null = ešte nie sú známe) */
  tax: TaxParams | null;
  sp: SpParams;
  zp: ZpParams;
  dph: DphParams;
}

export type ParamSet = Record<number, YearParams>;
