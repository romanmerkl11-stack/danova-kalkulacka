# HANDOFF – Daňová a odvodová kalkulačka (SZČO → neskôr zamestnanec)

Odovzdanie z cloudovej relácie na pokračovanie lokálne na Macu (priečinok `~/Developer/DANE`).
Začni tým, že novej relácii povieš: **„Prečítaj HANDOFF.md a docs/PLAN.md a pokračuj krokom 1 v sekcii Ďalšie kroky.“**

---

## 1. Čo chceme postaviť (zhrnutie požiadaviek)

- Kalkulačka dane z príjmov a odvodov (SP, ZP) pre **živnostníka s paušálnymi výdavkami**. Ako nadstavba neskôr **zamestnanec** (s.r.o. vypustené).
- Zadáva sa čo najmenej údajov: **ročné príjmy alebo príjmy po mesiacoch**. Zvyšok sa dopočíta, ale **každá hodnota sa dá ručne prepísať**.
- Automatický **paušál 60 % so stropom 20 000 €** a varovanie pri prekročení.
- Na konci **rezerva do limitov**, ktoré niečo menia: sadzba dane, odvody na ďalší rok, DPH, krátenie NČZD a pod.
- **Vysvetlenie každého výpočtu**: vzorec s dosadenými číslami, paragraf a zdroj sadzby s dátumom účinnosti.
- **Export** (XLSX, PDF, JSON) a **história** uložená pod IČO alebo obchodným menom.
- Doťahovanie údajov z verejných zdrojov (RPO, ZRSR, ORSR, socpoist) a **sledovanie nových sadzieb** s dátumom, odkedy platia.
- **Rozhodnutia používateľa:**
  - Appka beží **úplne offline**. Na internet ide len vtedy, keď treba, a **vopred sa spýta**: ukáže, kam ide a čo odošle.
  - V nastaveniach je **„nepýtať sa, rovno ísť na net“**, úplný offline režim a log prístupov.
  - **Výpočty ani dáta nesmú opustiť počítač.** Žiadny server ani účet.
  - Forma: **inštalátor `.exe` pre Windows**, ktorý sa dá poslať mame. Vývoj prebieha na Macu.

## 2. Architektúra (rozhodnutá)

- **Tauri v2** (desktop) s UI v **React 19 + TypeScript + Vite**. Testy cez **Vitest**.
- `src/engine/` je čisté výpočtové jadro bez UI. Každý medzivýsledok je `Step` (hodnota, vzorec, vysvetlenie, §, zdroje, riadok DP). Prepisy hodnôt idú cez `input.overrides[stepId]`.
- `src/params/` obsahuje zabalené sadzby po rokoch. Každá hodnota je typu `P { value, validFrom, validTo?, source?, note?, verified }`.
- `src/net/` je **jediné miesto, odkiaľ sa ide na internet** (`netFetch`). Pred požiadavkou volá `ctx.ask()` (dialóg) a každý prístup zapíše do logu. V Tauri používa `@tauri-apps/plugin-http`, ktorý obchádza CORS.
- `src/store/storage.ts` ukladá všetko do jedného súboru `data.json` v AppData (Tauri) alebo do localStorage (prehliadač). Zápis je atomický (tmp + rename). Sú tam aj pomocníci `saveFileAs` a `openFile` pre export a import.
  - Odchýlka od plánu: namiesto SQLite je to JSON súbor. Je to jednoduchšie, dá sa zálohovať jedným súborom a pre tento objem dát to stačí.

## 3. Stav – čo je HOTOVÉ ✅

| Súbor | Obsah |
|---|---|
| `src/params/types.ts` | typy parametrov |
| `src/params/data.ts` | sadzby **2024, 2025, 2026** a predbežné odvody **2027** so zdrojmi |
| `src/engine/types.ts` | `CalcInput`, `CalcResult`, `Step`, `LimitInfo`, `MonthRow`, `NextYear` |
| `src/engine/money.ts` | zaokrúhľovanie na centy (bez chýb float), formátovanie € a % |
| `src/engine/calc.ts` | celý výpočet SZČO (pozri nižšie) + `defaultInput(year)` |
| `src/engine/calc.test.ts` | 18 testov vrátane **zhody s Excelom používateľa** |
| `src/store/storage.ts` | lokálne úložisko, typy `Company`, `SavedCalc`, `Settings`, `NetLogEntry` |
| `src/net/net.ts` | `netFetch` s povoleniami (raz / vždy / zamietnuť), offline režim, log |
| `src/net/sources.ts` | RPO lookup podľa IČO + parser, odkazy na ZRSR a ORSR, stiahnutie kurátorovaných sadzieb, kontrola novej verzie cez GitHub Releases |
| `src/net/sources.test.ts` | testy parsera RPO |
| `docs/PLAN.md` | schválený plán (detailný) |
| `reference/DPFOB_DP_2024_predpoklad.xlsx` | pôvodný Excel používateľa (vzor pre testy a import) |

`npm test` → 21/21 testov prechádza. `npx tsc --noEmit` → bez chýb.

**Tauri skeleton (krok 2) ✅** – `src-tauri/`:
- crate `danova-kalkulacka` (lib `danova_kalkulacka_lib`), pluginy http/fs/dialog/opener v `lib.rs`.
- Identifikátor **`sk.danovakalkulacka`** (nie `…​.app` – Tauri varuje, lebo `.app` koliduje s príponou balíka na macOS). Dáta: `%APPDATA%\sk.danovakalkulacka\data.json`.
- `capabilities/default.json`: http len `api.statistics.sk`, `raw.githubusercontent.com`, `api.github.com`; fs `$APPDATA/**` (+ súbory vybrané v dialógu, Tauri ich pridá do scope automaticky).
- CSP (prod bez `unsafe-inline` pre skripty, sieť len cez IPC) + `devCsp` pre Vite HMR.
- Bundle `nsis`, `currentUser`, slovenčina. Lokálne na Macu: `npm run tauri build -- --bundles app`.
- Ikony sú predvolené z `tauri init` → neskôr `npx tauri icon cesta/k/logo.png` (obrázok sa dá vygenerovať cez Codex/ChatGPT).

**UI – časť 1 (krok 3) ✅** – `src/App.tsx`, `src/ui/*`:
- Záložka **Výpočet** hotová: vstupy (IČO/obchodné meno, rok, ročne/mesačne, výdavky, režim SP, zbaľovacie sekcie), súhrn + varovania, **Rezerva do limitov**, tabuľka mesiacov (editovateľná), **Postup výpočtu** s ⓘ a ✎ (prepis + „Vrátiť automatiku“), budúci rok.
- **Dialóg povolenia** + log v `data.netLog` funguje (overené: zamietnutie → hláška + záznam v logu).
- **Hľadanie v RPO aj podľa obchodného mena** (`searchCompanies`, `fullName` + `onlyActive=true`, max. 30 výsledkov, výber zo zoznamu). Výsledok hľadania nemá právnu formu ani SK NACE (API ich v `search` nevracia).
- Overené v prehliadači: rok 2024, príjmy 31 500 → poistné 3 767,16, ZD 8 832,84, daň 477,95 € (zhoda s Excelom).

**UI – časť 2 (krok 3) ✅** – `src/ui/tabs/*`, `src/params/flatten.ts`, `src/version.ts`:
- **Uložiť výpočet** (nový / zmeny / ako nový), `lastIco` sa pamätá v `AppData`.
- **História:** filter, skupiny podľa IČO, otvoriť / duplikovať / premenovať / zmazať, **porovnanie dvoch** výpočtov s rozdielom.
- **Sadzby:** tabuľka všetkých hodnôt roka (zdroj, platnosť, ✓/⚠), kontrola nových sadzieb s diffom a prijatím po rokoch, „Vrátiť zabalené sadzby“. Kým `paramsUrl` obsahuje `OWNER`, je kontrola vypnutá.
- **Nastavenia:** offline, nepýtať sa, povolené zdroje, kontroly pri štarte, log prístupov, záloha/obnova JSON, kontrola novej verzie.
- **Ako sa to počíta:** text podľa enginu s hodnotami zvoleného roka.
- Overené v prehliadači: uloženie, duplikovanie, porovnanie, zobrazenie všetkých záložiek.

**Export (krok 4) ✅** – `src/export/*`, `src/ui/ExportPanel.tsx`, `src/ui/PrintReport.tsx`:
- XLSX (exceljs, samostatný chunk): Súhrn, Mesiace (SUM), Postup, Limity (vzorec rezervy), Budúci rok. PDF cez `window.print()` + print CSS (A4). JSON export/import výpočtu (aj v Histórii).
- **Import pôvodného Excelu bol zrušený** (rozhodnutie používateľa: appka Excel nahrádza). Overené pred zrušením: skutočný súbor → daň 477,95 €.

**Výpis z účtu ✅** – `src/bank/*`, `src/ui/bank/*`:
- PDF (pdfjs-dist 4.10.38, heuristika), XLSX/CSV (autodetekcia stĺpcov SK bánk + ručné priradenie), camt.053 XML.
- Triedenie: príjem / SP / ZP / nezapočítať podľa názvu protistrany; ručné zmeny sa dajú zapamätať ako pravidlá (`AppData.bankRules`). Rozpis do mesiacov → `income.monthly`, `spPaid`, `zpPaid`.
- ⚠ Neotestované na reálnom PDF/exporte banky – treba vzorové (anonymizované) výpisy. `KNOWN_IBANS` je prázdne.

**Odvody** – vstupy „Moje mesačné odvody“ (SP 1–6, SP 7–12, ZP) a panel **„Z čoho sa skladajú odvody“** (fondy SP so sadzbami a účelom, VZ, ZP, budúci rok) – `src/ui/contrib.ts`, `ContributionsPanel.tsx`.

**Rýchly výpočet** (prvá, predvolená záložka) – `src/ui/tabs/QuickTab.tsx`, `src/ui/quick.ts`: príjmy + posuvník so značkami limitov, výdavky predvyplnené (prepis cez `overrides.vydavky`), daň, odvody roka, nové odvody, čistý príjem. Prekročené limity sa ukážu až po prekročení, pod výsledkami (bez „povinnosti podať DP“). Stav v `AppData.quick`.

**Publikovanie ODLOŽENÉ** (rozhodnutie používateľa: najprv dokončiť appku). Rozhodnuté: **verejné** GitHub repo. Pripravené: história gitu očistená od osobných údajov (autor `danova-kalkulacka`, vymyslené čísla v teste), `reference/*.xlsx` v `.gitignore`, `npm run params` → `params/params.json`. Zálohy pred čistením `../*.bundle` obsahujú osobné údaje – nepushovať.

- Dev v prehliadači: `npm run dev` (port 1420); `.claude/launch.json` je v nadradenom priečinku `DANE/`.

### Čo engine počíta (`calculate(input)`)
1. **Príjmy** zadané ročne alebo po mesiacoch. Chýbajúce mesiace sa môžu dopočítať priemerom zadaných.
2. **Poistné po mesiacoch:**
   - predvolene minimá roka, s **posunom o mesiac** (január platí 12/predošlý rok, ako v Exceli),
   - režim SP od júla: štandard, **mikroodvod 2026** alebo bez povinnosti,
   - každý mesiac sa dá prepísať.
3. **Výdavky:**
   - paušál `min(60 % × príjmy, 20 000)` + zaplatené poistné, s varovaním pri prekročení stropu,
   - alebo skutočné výdavky.
4. Čiastkový ZD, **strata**, **zamestnanie §5**, **prenájom §6 ods. 3** (oslobodenie 500 € a pomerné krátenie výdavkov ako v hárku `nájom`).
5. **NČZD:**
   - na daňovníka s krátením (2024–25: `44,2×ŽM − ZD/4`, 2026: `51,6×ŽM − ZD/3`),
   - na manžela/ku, DDS (max. 180 €).
   - NČZD sa uplatní najprv na §5, zvyšok na §6.
6. **Daň:**
   - **15 %**, ak príjmy §6 ≤ limit (2024: 49 790 €, od 2025: 100 000 €),
   - inak progresívne pásma (2026: **19/25/30/35 %**),
   - zaokrúhlenie nadol, daň sa nevyrubí do 17 €.
7. **Daňový bonus** podľa veku dieťaťa po mesiacoch, krátenie 1/10 nad 2 286 € (2026). Je to odhad.
8. **Daň na úhradu / preplatok**, preddavky na daň na ďalší rok.
9. **Ďalší rok:**
   - SP od 7/(Y+1) z `ZD / 1,486 / 12` v rozsahu min a max VZ,
   - poistné **po fondoch zaokrúhlené nadol** (presne sedí so sumami Sociálnej poisťovne),
   - mikroodvod alebo bez povinnosti pod limitom,
   - preddavok ZP (Y+1) a **ročné zúčtovanie ZP** za rok Y.
10. **Limity** (aktuálna hodnota, limit, rezerva, dôsledok; pri mesačnom režime aj mesiac, v ktorom sa limit pri súčasnom tempe prekročí):
    - strop paušálu (33 333,33 €), limit 15 %, krátenie NČZD, ďalšie pásmo dane,
    - vznik SP, min. a max. VZ SP,
    - DPH 50 000 / 62 500 €, povinnosť podať DP, min. príjem pre bonus.

### Chyby nájdené v pôvodnom Exceli (appka ich rieši)
1. Strop 20 000 € sa reálne neuplatňuje: `podklady!C18 = C15 + C17` a `DP paušál!E19` počítajú s nezastropenými 60 %.
2. 15 % je natvrdo (`C27`, `D72`), bez kontroly limitu príjmov.
3. NČZD je natvrdo `C25 = 5 646,48` (hodnota pre 2024), bez krátenia.
4. Hárok `podklady` pre 2024 dáva: príjmy 31 500, poistné 3 767,16, ZD 8 832,84, po NČZD 3 186,36, daň 477,95 €. Test `Excel používateľa` to overuje.

## 4. Sadzby – stav overenia ⚠

Overované cez webové vyhľadávanie. Priame čítanie socpoist.sk a financnasprava.sk bolo v cloude blokované.
Hodnoty s `verified: false` appka označí ⚠ a **treba ich overiť na oficiálnom zdroji**:
- 2024 max. VZ SP 14 344 € (predpoklad 11 × 1 304).
- 2025 hranica krátenia daňového bonusu 2 145 €.
- 2026 minimálna mzda 915 €.
- 2026 dolná hranica mikroodvodu 2 876,90 €.
- 2027 všetko okrem mikroodvodu 421,20 / 139,61 € (odvodené z priemernej mzdy 1 620 €).

Ďalej treba **overiť a doplniť**:
- výpočet VZ pre ZP (či sa k ZD nepripočítava zaplatené poistné),
- presné pravidlo mikroodvodu (kto ho platí),
- NČZD na manžela nad hranicou v roku 2026,
- čísla riadkov tlačiva DPFO B za 2026 (pole `dpRow` je teraz podľa tlačiva za 2024).

Hlavné zdroje: podpora.financnasprava.sk (NČZD 2026, bonus 2026, paušálne výdavky), socpoist.sk (VZ 2026, mikroodvod od 1. 7. 2026), podnikajte.sk (progresia 2026, odvody 2025, DPH od 2025). URL sú priamo v `src/params/data.ts`.


## 5. Ďalšie kroky (TODO, v poradí)

1. ✅ **Lokálne prostredie (Mac):** (hotovo – Node 22, Rust 1.100, Xcode CLT)
   ```bash
   npm install && npm test
   ```
   Pre Tauri treba Rust (`rustup`) a Xcode Command Line Tools.
2. ✅ **Tauri skeleton:** (hotovo, pozri sekciu 3)
   - `npx tauri init` → `src-tauri/`, identifikátor `sk.danovakalkulacka.app`, názov „Daňová kalkulačka“.
   - Pluginy: `tauri-plugin-http`, `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener` (registrovať v `lib.rs`).
   - Capabilities:
     - `http:default` so scope len pre `https://api.statistics.sk/*`, `https://raw.githubusercontent.com/*` a `https://api.github.com/*`,
     - `fs` scope `$APPDATA/**`,
     - `dialog:default`, `opener:default`.
   - CSP v `tauri.conf.json`.
   - Bundle: `targets: ["nsis"]`, `windows.nsis.installMode: "currentUser"` (netreba admin), `languages: ["Slovak"]`.
3. **UI** (`src/main.tsx`, `src/App.tsx`, `src/ui/*`) – ✅ hotové (všetky záložky). Pôvodná špecifikácia:
   - **Výpočet:**
     - vľavo vstupy: IČO s tlačidlom „Doplniť z registra“, rok, prepínač ročne/mesačne, tabuľka 12 mesiacov (príjem, SP, ZP, editovateľné), zbaľovacie sekcie (zamestnanie, prenájom, deti, manžel/ka, DDS, strata, preddavky);
     - vpravo súhrn, varovania, **panel limitov** s progress barmi a rezervou, kroky výpočtu s ⓘ (vzorec, §, zdroj, dátum, ⚠ neoverené) a ✎ na prepísanie (s „vrátiť automatiku“), odvody a preddavky na ďalší rok.
   - **História:** podľa IČO/firmy, uložiť pod vlastným názvom, otvoriť, duplikovať, porovnať dva výpočty, zmazať.
   - **Sadzby:** tabuľka všetkých parametrov po rokoch (hodnota, platí od–do, zdroj, overené). Tlačidlo „Skontrolovať nové sadzby“ zobrazí diff a umožní prijať. Prijaté hodnoty idú do `AppData.acceptedParams` a zlúčia sa so `PARAMS` pred `calculate(input, params)`.
   - **Nastavenia:** offline režim, „nepýtať sa“, povolené zdroje, log prístupov, adresa súboru sadzieb, záloha a obnova `data.json`.
   - **Ako sa to počíta:** text s vysvetlením.
   - **Dialóg povolenia** (`setNetContext` v App): ukáže účel, URL a čo sa odošle; tlačidlá *Povoliť raz / Vždy pre tento zdroj / Zamietnuť*.
4. ✅ **Export a import:** (hotovo; import Excelu zrušený)
   - XLSX cez `exceljs` (hárky Súhrn, Kroky, Mesiace, Limity; ideálne so vzorcami),
   - PDF cez `window.print()` s print CSS,
   - JSON (jeden výpočet aj celá záloha),
   - **import pôvodného Excelu**: hárok `podklady`, H14:H25 príjmy, I14:I25 SP, J14:J25 ZP, D13 ďalšie príjmy.
5. **Kurátorovaný súbor sadzieb:**
   - `params/params.json` v GitHub repe (`{ publishedAt, years }`, rovnaký tvar ako `PARAMS`),
   - skript, ktorý ho vygeneruje z `src/params/data.ts`,
   - GitHub Action, ktorá raz denne skontroluje zmeny na stránkach socpoist a FS a otvorí issue alebo PR na ručnú kontrolu.
   - V nastaveniach treba nahradiť `OWNER` v `paramsUrl` a `updateRepo`.
6. **Windows inštalátor:**
   - workflow `.github/workflows/release.yml` (`tauri-apps/tauri-action`, runner `windows-latest`, pri tagu `v*` nahrá `.exe` do Releases),
   - návod pre mamu v README (SmartScreen → „Ďalšie informácie → Spustiť aj tak“, kde sú dáta, ako zálohovať).
7. Overenie podľa `docs/PLAN.md`, sekcia „Overenie“ (offline test, test povolení, Playwright E2E, inštalácia na čistý Windows).
8. **Fáza 2 – zamestnanec** (s.r.o. vypustené) – pozri docs/PLAN.md.

## 6. Užitočné príkazy

```bash
npm install
npm test            # unit testy engine
npx tsc --noEmit    # typová kontrola
npm run dev         # UI v prehliadači (po dorobení UI)
npm run tauri dev   # desktop appka (po kroku 2)
```

## 7. Poznámky

- Pred commitom do verejného repa zváž, či tam má byť `reference/DPFOB_DP_2024_predpoklad.xlsx`. Obsahuje osobné údaje (DIČ, príjmy), preto ho daj do `.gitignore` alebo repo nastav ako súkromné.
- Git: projekt má lokálny git s 1 commitom plus zmeny v tomto balíku. Vzdialené repo zatiaľ nie je nastavené.

## 8. ROZPRACOVANÉ – požiadavky používateľa (15. 11. 2026), poradie pre ďalšiu session
Spoločná zbaľovacia karta `src/ui/Card.tsx` sa používa vo Výpočte aj Rýchlom výpočte (udalosť `dk-open-card`).
1. ✅ **Uložiť výpočet** nebude samostatná karta → plávajúca lišta na konci stránky (Uložiť + rýchle odkazy na sekcie/karty, `#id` z Card).
2. ✅ **Ukladanie primárne anonymne pod prezývkou**; IČO voliteľné. V karte Podnikateľ len malé tlačidlo „Hľadať“ na konci, **bez odkazov** na ZRSR/ORSR/FS/RPO.
3. ✅ s.r.o. vyhodené; **fáza 2 = zamestnanec** (súbeh, prenájom, §8, DP typ A/B) – rozsah v docs/PLAN.md.
4. ✅ **Výdavky po riadkoch** (napr. pri nájme: voda, plyn, telefón, internet/TV, nájom) – meno + mesačná suma (× mesiace) → súčet; použiť v Prenájme aj v skutočných výdavkoch.
5. ✅ **Výpočet:** navrchu Postup výpočtu, pod ním Odvody po mesiacoch, potom ostatné karty – **predvolene zbalené**.
6. ✅ **Nastavenia:** výber, ktoré karty sa na záložke Výpočet zobrazia a v akom poradí.
7. ✅ **Rýchly výpočet:** dole zbalený Postup výpočtu; pridať limit „od akého príjmu začnem platiť daň“ (značka na posuvníku + bublina).
8. ✅ **Zjednotiť šípky:** zbaľuje sa celá karta (Card), vnútri všetko rozbalené (napr. „Z čoho sa skladajú odvody“ bez vnorených šípok).
9. Farby podľa systému (tmavý režim) – používateľ OK.
10. ✅ Návrhy prejdené. Schválené: overiť ⚠ sadzby, „—“ pri príjme 0 (✅), značka neuložených zmien (✅), test desktopovej verzie. Zamietnuté: Safari/trvalé úložisko, mobil (nie je priorita), predvolený rok (aktuálny je správny – odhad DP za bežný rok).
Web: https://romanmerkl11-stack.github.io/danova-kalkulacka/ (push do main = nasadenie).

## 9. Hotové 15. 11. 2026 (večer)
- **Sadzby overené** (subagent, web): opravené max. VZ SP 2024 = **9 128 €** (7×, nie 11×); overené bonus 2025, min. mzda 2026, mikroodvod 2026, 2027 (priemerná mzda 1 620, min. VZ 972, min. SP 322,21, max. VZ 17 820, mikroodvod 139,61), DPH 50 000 / 62 500. Stále **neoverené**: hranica mikroodvodu 2027 (9 720 – odvodené), ZP 2027 (min. VZ 810, 129,60 €, sadzba 16 %).
- **Oprava logiky od 7/2026:** príjem do 10,5 × ŽM (2 876,90 € / 2027: 2 983,37 €) = bez povinnosti SP; do 50 % z 12 × priem. mzdy (9 144 € / 9 720 €) = mikroodvod; nad = riadne odvody. Limity `spVznik` (dolná hranica) + nový `spMikro` (koniec mikroodvodu).
- **Okienko 2 % / 3 % dane** (`src/ui/AssignNotice.tsx`, `assign.ts`) v Rýchlom výpočte a v Súhrne – ukáže sa pri dani ≥ 150 € (min. 3 €). Pravidlá pre rodičov 2026 nejednoznačné – v texte „overte“.
- „Prezývka“ → **„Názov“**; hľadanie v registri schované pod **ikonou lupy** v hlavičke karty Podnikateľ.
- Rýchly výpočet: čistý príjem „—“ pri príjme 0; efektívne zaťaženie „nad 100 %“ keď odvody prevyšujú príjmy.
- **Značka neuložených zmien** v lište (`src/ui/unsaved.ts`).
- **Desktop (Tauri) otestovaný:** build `.app`, štart, výpočet, zápis `data.json` v Application Support OK. Natívne dialógy (export/import súborov, PDF výpis) treba vyskúšať ručne.
- Fáza 2 = **zamestnanec** (súbeh, prenájom, §8, DP typ A/B) – rozsah v docs/PLAN.md, ďalší krok.

## 10. Fáza 2 – zamestnanec ✅ (15. 11. 2026)
- `input.profile` / `quick.profile`: **szco | zamestnanec | oboje**. Zamestnanec: bez odvodov SZČO, bez limitov živnosti; viac zamestnávateľov (`employment.items`), §8 ostatné príjmy (`other.items`, spoločné oslobodenie 500 € s prenájmom), `result.filing` (typ A/B, povinnosť, ročné zúčtovanie, termín) + karta „Daňové priznanie“.
- Rýchly výpočet: suma navrchu kariet, limity pod posuvníkom **v schodoch** (prvý najnižšie) so zvislou čiarkou k číslu, popis len v bubline.
- 2 %: plávajúci odznak vpravo dole (`AssignNotice` + `assign.css`) na oboch záložkách.
- **Sadzby majú dátum `PARAMS_DATE` (src/params/data.ts) – pri každej zmene sadzieb ho zvýš a spusti `npm run params`.** Prijaté sadzby staršie ako PARAMS_DATE sa ignorujú (`src/params/merge.ts`), Sadzby ukážu upozornenie.

## 11. Poradca, ikona, vydania pre Windows (15. 11. 2026)
- Záložka **Poradca** (`src/ui/tabs/AdvisorTab.tsx`, `src/ui/advisor/*`): koľko si mesačne odkladať, kalendár povinností + export .ics, paušál vs. skutočné výdavky, FYI medziročné porovnanie.
- **Ikona** vygenerovaná cez Codex/ChatGPT → `assets/icon.png`, `npx tauri icon assets/icon.png`; favicon webu `public/favicon.png`.
- **Vydania:** `.github/workflows/release.yml` – značka `v*` zostaví NSIS `.exe` na windows-latest a nahrá do Releases. Návod pre mamu v README.
- **Nová verzia:** desktop pri štarte (predvolene zapnuté, s povolením) zistí posledné vydanie; pruh „Je k dispozícii nová verzia … Stiahnuť“ otvorí priamo `.exe`. Odkazy na web sa v desktope otvárajú v systémovom prehliadači (`src/net/open.ts`).
- Mesačné príjmy sa zadávajú priamo v Základných údajoch (12 polí), tabuľka mesiacov ich len zobrazuje.
- Odložené do plánu: ťahák „čo kam napísať“ do DP.

## 12. Audit od Codexu (15. 11. 2026, verzia v0.1.0) – stav
Audit (súbor od používateľa, nie v repe) overený na aktuálnom kóde. Reprodukované: F01, F02, F05, F06; potvrdené v kóde: F03, F04, F09, F13; ostatné (F07, F08, F10–F15, U01–U12, G01–G06) sedia s kódom, F10/F11 treba overiť na oficiálnych zdrojoch.
**Balík A – hotové (16. 11.):** F01 jednotný súhrn (príjmy = živnosť + mzda + prenájom + § 8; „Príjem po dani a odvodoch“ = príjmy − daň po bonuse − odvody SZČO − poistné zamestnanca, pred nákladmi; test `src/engine/summary.test.ts`), F02 neznáme odvody „Zatiaľ neznáme“ + texty o použitých sadzbách, varovania vždy viditeľné (`src/ui/ResultNotices.tsx`) v Rýchlom výpočte aj nad kartami Výpočtu, Súhrn predvolene otvorený, názvy „Daňové výdavky“ a „Príjem po dani a odvodoch“ všade (UI, História, export, tlač, Poradca).
**Balík B – naprogramované (16. 11.), v prehliadači/desktope ZATIAĽ NEOVERENÉ (overiť na konci spolu):** F03 `saveData` vracia chybu, „Uložené“ až po zápise (`persist` v App.tsx), červený pruh pri chybe zápisu, flush pri zatváraní (web `beforeunload`/`pagehide`, desktop `onCloseRequested` + oprávnenie `core:window:allow-destroy`); F04 `loadData` → `LoadResult`, poškodené dáta = `RecoveryScreen` (zápis zablokovaný, poškodený obsah sa odloží ako `data.poskodene-….json`), `data.json.bak` pred prvým prepisom v session; F05 záloha `{format, schema: 1, data}` + `parseBackup` (staré zálohy prijíma), bezpečnostná kópia `data.pred-obnovou.json` / stiahnutie na webe, oprava `withRealRepo`. Testy `src/store/storage.test.ts`.
**Balík C – naprogramované (16. 11.), v prehliadači ZATIAĽ NEOVERENÉ:** F06 `aggregate` sčítava so znamienkom (vratky znižujú príjem/poistné, záporný mesiac → 0 + varovanie), cudzia mena sa nezapočíta (varovanie, suma v mene v tabuľke); F07 `covered` = mesiace od prvého po posledný pohyb v roku, `applyToInput` prepíše len tie, súhrn ukáže „mimo výpisu – nezmení sa“; F08 `mergeTxs` páruje po kusoch, rovnaký dátum+suma s inou protistranou/VS = `possibleDuplicate` (predvolene „Nezapočítať“, filter „Možné duplicity“). Testy v `src/bank/aggregate.test.ts`, `util.test.ts`.
**Balík D – naprogramované (16. 11.), v prehliadači ZATIAĽ NEOVERENÉ:** F09 `transferLosses` (src/ui/quick.ts) – pred prenosom Rýchly → Podrobný sa appka opýta, ak by prepísala mesačné príjmy, zamestnávateľov, rozpis prenájmu, ručné odvody/výdavky alebo výpočet iného roka („Prepísať“ / „Otvoriť podrobný bez prenosu“ / „Zrušiť“); F12 `SavedCalc.params` + `paramsDate` pri uložení, História ukáže „sadzby z …“ a upozornenie pri zmene, Porovnanie počíta s uloženými sadzbami (`paramsForSaved`). Odstránené zatúlané „Export JSON“ vo formulári premenovania. **F14 neurobené – chýba popis z auditu.**
**Balík E – naprogramované (16. 11.), v prehliadači ZATIAĽ NEOVERENÉ:** F13 `src/net/askQueue.ts` – otázky na internet vo fronte (jedna naraz), „Vždy povoliť“ vybaví čakajúce z rovnakého zdroja; F15 `NumberInput` ukáže neplatné/záporné číslo (červené pole + „použije sa …“), záporné len s `allowNegative` (prepis krokov), `parseSkNumber` číta „1.234,56“; `src/engine/sanitize.ts` prečistí `lastInput` aj vstupy uložených výpočtov pri načítaní/obnove (doplní chýbajúce polia, 12 mesiacov, neplatné čísla).
**Doplnky podľa plného textu auditu (16. 11., NEOVERENÉ v prehliadači):** F09 `transferReport` – okrem prepísaného ukáže aj čo zostane a zmení výsledok (ručné prepisy krokov, skutočné výdavky, deti, manžel/ka, DDS, strata, preddavky, poistné po mesiacoch, prenájom, § 8) + voľba „Nový podrobný výpočet z týchto údajov“ (= `buildQuickInput`, zhoda s rýchlym); F08 mena v `dedupeKey`; F07 veta o dopočítaní poistného v súhrne importu; F13 časový limit 15 s (`NET_TIMEOUT_MS`) + offline zapnutý počas súhlasu zablokuje požiadavku; F15 Escape vráti hodnotu spred úpravy; F12 aj `paramsNext` (rok+1) a `appVersion`; **F14** `src/params/validate.ts` – stiahnuté sadzby sa pred prijatím podrobne skontrolujú (sumy, sadzby 0–100 %, pásma, bonus, dátumy), roky vo Výpočte aj Rýchlom výpočte a texty paušálu/placeholdery z efektívnych sadzieb.
**Balík H – spätná väzba (16. 11., NEOVERENÉ v prehliadači):** `src/feedback/` – odkaz „Nahlásiť problém / návrh“ v hlavičke + „Nahlásiť tento problém“ pri chybe uloženia/výpočtu/importu (udalosť `dk-feedback`, `requestFeedback`); formulár → náhľad → Pripraviť e-mail (mailto, pri dlhom texte kópia do schránky) / Skopírovať / Uložiť do súboru; nikdy „Odoslané“, koncept v `AppData.feedbackDraft` do „Mám odoslané“/zahodenia. Kontakt v `feedbackAddress()` poskladaný z kúskov, vo formulári sa nezobrazuje. Bez súm, mien, IČO; predmet `[Daňová kalkulačka][Typ][DK-…]` na filter v Gmaile. Odoslanie do repa zamietnuté (verejné issues, token v klientovi) – prípadná 2. etapa: Google Apps Script → súkromná tabuľka.
Balíky B–H nasadené (commit 1e567d0), web overil používateľ. **.exe:** nikto ho zatiaľ nemá → zostávame na v0.1.0, pri „hotovo“ sa vydanie v0.1.0 prestavia z aktuálneho kódu (na pokyn).
**Balík F – vzhľad (16. 11., NEOVERENÉ v prehliadači):** U01 riadok „Rok · typ výpočtu · odhad“ pri výsledku (Rýchly aj Súhrn); U03 „Automaticky: …“ / „Vlastná suma · Obnoviť automatiku“ pod výdavkami a odvodmi; U05 prvé „Daň na úhradu“/„Preplatok“, potom „Daň za rok“; U06 posuvník predvolene len najbližšie limity (`nearestTicks`) + „Zobraziť všetky limity“, veta „Najbližšie: …“, upozornenie nad rozsahom; U07 bežné povinnosti v neutrálnom boxe „Čo pre vás tento príjem znamená“, žlté len `ATTENTION_LIMITS` (DPH, strop paušálu); U08 ceruzky v Postupe až po „Upraviť medzivýsledky ručne“, súhrn „Ručné prepisy: N · Obnoviť všetky“; U09 odznak 2 % už nepláva – riadok vo výsledku Rýchleho výpočtu a v Súhrne; U10 Nastavenia: Dáta a zálohy → Internet a súkromie → Aktualizácia → Karty → Pokročilé a diagnostika (zbalené: adresa sadzieb, repozitár, log); U12 zlúčené duplicitné `.tick span`, `.chev`.
**16. 11. popoludní:** .exe v0.1.0 prestavané z 474e8b5 (mama ho dostane na skúšku); web: tlačidlo „Stiahnuť aplikáciu pre Windows“ (`windowsDownloadUrl` v src/version.ts). **Menu:** navrchu len Rýchly výpočet a Podrobný výpočet (záložka „Výpočet“ premenovaná), ostatné sekcie + stiahnutie + spätná väzba v „☰ Ďalšie“. „Nahlásiť problém / návrh“ v spodnej plávajúcej lište (Podrobný aj Rýchly výpočet), nie v hlavičke.
**Spätná väzba → issues v súkromnom `privat-vecicky`:** cez Google Apps Script (`tools/feedback-apps-script.gs`, návod `docs/SPATNA-VAZBA.md`); token len v skripte. Appka: zdroj siete `feedback`, `src/feedback/send.ts`, tlačidlo „Odoslať“ sa ukáže až po vyplnení `FEEDBACK_ENDPOINT` (src/feedback/report.ts) – **čaká na URL nasadeného skriptu od používateľa**; Tauri allowlist script.google.com + script.googleusercontent.com (nový .exe potrebný, aby to fungovalo v desktope).
**Ďalej:** G (Windows smoke, exceljs advisory), U11 prístupnosť, F10/F11 odborné overenie. Zostáva z auditu: F10/F11 odborné overenie, U11 prístupnosť.
**Zámerne ponechané podľa používateľa:** plávajúci odznak 2 % a výber profilu v nadpise (audit navrhuje zmeniť – predložiť zvlášť).
