# HANDOFF – Daňová a odvodová kalkulačka (SZČO → neskôr s.r.o.)

Odovzdanie z cloudovej relácie na pokračovanie lokálne na Macu (priečinok `~/Developer/DANE`).
Začni tým, že novej relácii povieš: **„Prečítaj HANDOFF.md a docs/PLAN.md a pokračuj krokom 1 v sekcii Ďalšie kroky.“**

---

## 1. Čo chceme postaviť (zhrnutie požiadaviek)

- Kalkulačka dane z príjmov a odvodov (SP, ZP) pre **živnostníka s paušálnymi výdavkami**. Ako nadstavba neskôr **s.r.o.**
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

**Pre s.r.o. (fáza 2) zistené:**
- DPPO 10 % do 100 000 €, 21 % do 5 mil. €, 24 % nad 5 mil. €.
- Daňová licencia sa od 2026 mení (sumy treba overiť).
- Dividendy 7 %.

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
8. **Fáza 2 – s.r.o.:**
   - DPPO, daňová licencia, mzda konateľa, dividendy (7 % + ZP),
   - porovnanie SZČO a s.r.o.

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
