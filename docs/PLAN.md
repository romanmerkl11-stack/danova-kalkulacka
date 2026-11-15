# Daňová a odvodová kalkulačka – SZČO (paušál) + neskôr zamestnanec

## Kontext
Používateľ dnes počíta daň a odvody v Exceli `DPFOB_DP_2024_predpoklad.xlsx`
(hárky `podklady`, `nájom`, `DP paušál`). Chce webovú kalkulačku, kde zadá minimum
(mesačné alebo ročné príjmy), zvyšok sa dopočíta, všetko sa dá prepísať, uvidí
vysvetlenie výpočtu, rezervu do limitov, môže exportovať a ukladať históriu podľa
IČO/obchodného mena, údaje o firme sa doťahujú z verejných registrov a ročné sadzby
sa sledujú automaticky (s dátumom účinnosti). Neskôr verzia pre zamestnanca (s.r.o. vypustené).

Rozhodnuté: **základ beží úplne offline**; na internet ide len keď treba, a **vopred sa spýta**
(„Idem na rpo.statistics.sk zistiť údaje k IČO 12345678 – povoliť?“). V nastaveniach prepínač
**„Nepýtať sa, rovno ísť na net“** (globálne aj po zdrojoch). História lokálne + export/import, zamestnanec ako fáza 2 (s.r.o. vypustené).

## Postrehy z tvojho Excelu (opravím v kalkulačke)
1. **Strop 20 000 € sa reálne neuplatňuje** – `podklady!C18 = C15 + C17` berie nezastropených 60 %
   (`C16` = 20000 je len text vedľa), rovnako `DP paušál!E19 = D19*0.6 + D23`. Správne `MIN(60 %; 20 000)`.
2. **15 % sadzba je natvrdo** (`C27 = C26*0.15`, `D72`). 15 % platí len do limitu príjmov (60 000 €),
   inak 19 % / 25 % podľa pásma – treba automaticky.
3. **Nezdaniteľná časť je natvrdo** (`C25` = 5 646,48 – hodnota 2024). Pri vyššom základe sa kráti
   (44,2 × ŽM − ZD/4) a každý rok sa mení → počítať zo sadzieb roka.
4. Mesiac `12/22` (SP 187,78 / ZP 79,31) sa ráta do riadku `príjmy` (`C13 = H26 + D13`, D13 = 7000 ručne) –
   v aplikácii bude jasne oddelené: príjmy daného roka vs. odvody zaplatené v roku (daňovo uznané sú zaplatené v roku).
5. Tabuľka minimálnych odvodov a „limitu na SP“ 2018–2024 je výborný základ pre históriu sadzieb – prenesiem ju.
6. Strata `D33 = D32/4` – zachovať (umorenie 1/4), ale ako voliteľné pole.

## Architektúra (offline-first)
- **Desktopová appka Tauri, dodaná ako inštalátor `.exe` pre Windows** (~10 MB) s UI v **React + TypeScript (Vite)**.
  Cieľ: pošleš inštalátor napr. mame, nainštaluje si ho a používa u seba. **Žiadne výpočty ani dáta neopustia počítač**,
  nie je žiadny server ani účet. Registre (ZRSR, ORSR, socpoist) appka číta priamo z daného PC a len s dovolením.
- Inštalátor: NSIS `.exe` s jednoduchým sprievodcom v slovenčine, ikona na ploche, inštalácia pre používateľa (netreba admin práva).
  Nepodpísaný → pri prvom spustení SmartScreen „Neznámy vydavateľ“ → *Ďalšie informácie → Spustiť aj tak* (do README pribudne návod
  so screenshotom). Neskôr sa dá doplniť podpis certifikátom.
- Aktualizácie: appka sa **s dovolením** pozrie na GitHub Releases, či je nová verzia, a ponúkne jej stiahnutie. Dá sa vypnúť.
- Všetky dáta lokálne v **SQLite** v profile používateľa (história, profily firiem, sadzby, log sieťových prístupov).
  Tlačidlo „Zálohovať / Obnoviť“ uloží celú databázu do jedného súboru, napr. na USB.
- `src/engine/` – **čistý výpočtový modul** (bez UI), deterministický, plne testovaný.
  Každá funkcia vracia hodnotu + **„krok vysvetlenia“** (vzorec, dosadené čísla, odkaz na § a zdroj).
- `params/<rok>.json` – **zabalené v appke**: všetky sadzby a limity s `value`, `validFrom`, `validTo`, `source` (URL), `note`.
  Kalkulačka vyberá parametre podľa obdobia; podporuje polročné zmeny (bonus 01–06 / 07–12, odvody od 1. 7.).
- **Sieťová vrstva `src/net/`**: jediné miesto, odkiaľ ide request. Pred každým: dialóg s presnou URL, čo sa hľadá a čo sa odošle
  (napr. len IČO). Možnosti: *Povoliť raz / Vždy pre tento zdroj / Zamietnuť*. Nastavenia: „Nepýtať sa“ globálne + po zdrojoch,
  úplný offline režim, **log** všetkých prístupov (kedy, kam, čo).

## Fáza 1 – SZČO s paušálnymi výdavkami
### Vstupy (minimum → zvyšok dopočítaný, každé pole prepísateľné „🔓 upraviť“)
- IČO → doťahne obchodné meno, adresu, SK NACE, dátum vzniku, DIČ (ak dostupné).
- Rok; režim príjmov: **ročná suma** alebo **12 mesiacov** (prepínač; pri mesačnom aj „predpoklad do konca roka“ = extrapolácia priemeru).
- Zaplatené SP a ZP: predvyplnené minimami roka/mesačne, dá sa prepísať po mesiacoch.
- Voliteľné sekcie (zbalené): závislá činnosť (HM, poistné, zrazená daň, bonus od zamestnávateľa), prenájom (§6 ods.3,
  oslobodenie 500 €, pomerné krátenie výdavkov – logika z hárku `nájom`), deti (bonus), DDS, manžel/ka, strata, preddavky, 2 % / 3 % asignácia.

### Výpočet (engine)
1. Príjmy §6 ods.1,2 → paušál `min(60 % × príjmy, 20 000)`; ak 60 % > strop → **varovanie „prekročený strop, uplatňuje sa 20 000 €“**
   + pri príjmoch nad limit pre paušál (DPH/60 000 – overiť pre daný rok) upozornenie.
2. + zaplatené poistné SP+ZP → čiastkový ZD.
3. NČZD na daňovníka (s krátením), manžela, DDS → ZD.
4. Sadzba: 15 % ak príjmy ≤ limit, inak 19 % / 25 % nad hranicou (176,8 × ŽM); zaokrúhlenia, nevyrubenie do 17 €.
5. Bonus na deti, zrazené preddavky → **daň na úhradu / preplatok**, preddavky na ďalší rok.
6. **Odvody na ďalší rok**: povinnosť SP podľa limitu príjmov, vymeriavací základ = (ZD × koeficient) / počet mesiacov,
   ohraničený min/max; ZP rovnako + ročné zúčtovanie ZP (nedoplatok/preplatok). Mesačné sumy od júla (SP) / podľa pravidiel roka.
7. Mapovanie na **riadky DPFO typ B** (r. 39, 40, 41, 72, 73, 80, 95, 96, 116…) – rovnako ako tvoj hárok `DP paušál`, ako pomôcka pre vyplnenie.

### Panel „Rezerva do limitov“
Pre každý prah: aktuálna hodnota, limit, **koľko zostáva** (€ a %), čo sa stane po prekročení:
- strop paušálu 20 000 € (príjem 33 333 €), limit 15 % sadzby (60 000 €), hranica 25 % (176,8 × ŽM),
- limit vzniku povinného SP na ďalší rok, max. vymeriavací základ SP/ZP,
- registrácia DPH (obrat 50 000 € / okamžitá 62 500 – overiť pre rok), krátenie NČZD, povinnosť podať DP (50 % NČZD), 17 € nevyrubenie.
- Pri mesačnom režime: „pri súčasnom tempe prekročíš limit X v mesiaci Y“.

### Vysvetlenie
Každý medzivýsledok má ikonu ⓘ → rozbalí vzorec s dosadenými číslami, paragraf (zákon 595/2003, 461/2003, 580/2004) a zdroj sadzby
s dátumom účinnosti. Plus samostatná stránka „Ako sa to počíta“.

### Export a história
- Uloženie výpočtu pod **IČO + obchodné meno + rok + vlastný názov** (napr. „predpoklad 11/2026“), verzie, porovnanie dvoch výpočtov.
- Export: **XLSX** (s vzorcami, aby nadväzoval na tvoj Excel), **PDF** (súhrn + vysvetlenie), **JSON** (záloha/import).
- Import tvojho súčasného Excelu (hárok `podklady`) – jednorazová migrácia.

## Verejné zdroje (realita)
| Zdroj | Čo dá | Spôsob |
|---|---|---|
| **RPO – Register právnických osôb** (ŠÚ SR, `api.statistics.sk/rpo`) | názov, adresa, právna forma, SK NACE, vznik/zánik – aj pre živnostníkov | oficiálne otvorené API ✅ |
| **ZRSR** (živnostenský register) | predmety podnikania, prevádzkarne | bez API → scraping výpisu podľa IČO (krehké, fallback) |
| **ORSR** | s.r.o.: konatelia, spoločníci, ZI | bez API → scraping; väčšinu pokryje RPO |
| **Finančná správa – open data** (`opendata.financnasprava.sk`) | DIČ/IČ DPH, registrácia DPH, index spoľahlivosti, daňové dlžníky | API s bezplatným kľúčom ✅ |
| **Sociálna poisťovňa** | min/max odvody, limity | bez API → sledovanie stránky „výška poistného“ |
| **Zdravotné poisťovne / ÚDZS** | min. preddavok ZP, max. VZ | bez API → sledovanie VšZP/ÚDZS stránok |
| **Slov-Lex, ŠÚ SR** | zákony, priemerná mzda, životné minimum (MPSVR) | sledovanie zmien |

### Sledovanie nových hodnôt (na požiadanie, s dovolením)
- Tlačidlo **„Skontrolovať nové sadzby“** (alebo automaticky pri štarte, ak je povolené): appka napíše, ktoré stránky ide pozrieť
  (socpoist.sk – výška poistného, financnasprava.sk – NČZD/sadzby, vszp.sk/udzs-sk.sk – ZP, MPSVR – životné minimum).
- Načíta stránky, parsuje známe tabuľky, porovná so zabalenými hodnotami a ukáže **diff**: „Min. odvod SP 2027: 2xx,xx € platí od 1. 7. 2027 (zdroj …) – prijať?“.
  Nič sa neprepíše bez potvrdenia; prijaté hodnoty sa uložia lokálne s pôvodom a dátumom.
- Záložný kanál: kurátorovaný `params/<rok>.json` v GitHub repe (aktualizovaný GitHub Action + kontrola) – appka ho vie stiahnuť
  ako jeden súbor, opäť len s dovolením. Ak parser stránky zlyhá (zmena layoutu), appka to povie a ponúkne ručné zadanie s odkazom na zdroj.
- Pri každom parametri v appke: hodnota, **platí od–do**, zdroj, kedy overené; banner keď je nový rok a sadzby ešte nie sú potvrdené.
- Odvodené parametre (NČZD, hranica 25 %, limity SP) sa počítajú zo základných (ŽM, priemerná mzda) – menej ručných zmien.
- Údaje firmy z registrov sa uložia do profilu firmy → ďalšie použitie už offline.

## Moje návrhy navyše
- **Scenáre „čo ak“**: posuvník príjmov → živý graf dane+odvodov a čistého; zlom pri 20 000 strope a limitoch.
- **Paušál vs. skutočné výdavky** porovnanie (ak výdavky > 60 %).
- **Kalendár povinností**: termín DP (31. 3./odklad), zmena odvodov od 1. 7., ročné zúčtovanie ZP, preddavky na daň.
- **Efektívne zaťaženie** (% z príjmu), čistý mesačný príjem.
- **Upozornenie na stav DPH** (podľa obratu za 12 po sebe idúcich mesiacov, nie kalendárny rok).
- Záloha celej databázy jedným klikom (súbor), aby sa história nestratila pri výmene PC.

## Fáza 2 – zamestnanec (súbeh príjmov, DP typ A / B)
Schválené používateľom 15. 11. 2026; s.r.o. **vypustené**. Cieľ: zamestnanci, ktorí musia/chcú podať DP (aj s prenájmom a inými príjmami).
1. **Profil „Zamestnanec“** – živnosť sa dá vypnúť; vstup z **potvrdenia o zdaniteľnej mzde** (príjem, poistné, preddavky, bonus), viac zamestnávateľov po riadkoch.
2. **Súbeh** zamestnanie (§5) + živnosť (§6 ods. 1, 2) + prenájom (§6 ods. 3) + ostatné príjmy (§8) v jednom výpočte, správne poradie NČZD.
3. **Ostatné príjmy (§8)** – príležitostná činnosť / prenájom hnuteľných vecí (oslobodenie 500 €), predaj nehnuteľnosti/hnuteľnej veci (oslobodenia), autorské honoráre.
4. **Typ DP a povinnosť podať** – A len pri výlučne §5; s §6 ods. 3 alebo §8 → **typ B**; termín, preplatok/nedoplatok voči zrazeným preddavkom.
5. **Kontrola ročného zúčtovania** zamestnávateľa.
6. 2 % / 3 % asignácia, (zamestnanecká prémia – overiť, či platí), daňový bonus na úroky z hypotéky pre mladých.

## Kroky implementácie
1. Init repo (Tauri + React + TS + Vite, Vitest, Playwright), štruktúra `src/engine/`, `src/net/`, `params/`.
2. `params/2024–2026.json` – overím každú hodnotu na oficiálnych zdrojoch (finančná správa, socpoist, VšZP) a pridám URL + dátum.
3. Engine SZČO + vysvetľujúce kroky + testy (funguje bez siete).
4. UI: vstupy (ročný/mesačný), výsledky, panel limitov, ⓘ vysvetlenia, SK lokalizácia.
5. SQLite história + export XLSX/PDF/JSON + import tvojho Excelu.
6. Sieťová vrstva s dialógom povolenia, nastaveniami „nepýtať sa“ a logom; konektory RPO, FS open data, ZRSR/ORSR.
7. Kontrola nových sadzieb (parsery + diff + potvrdenie) a GitHub Action pre kurátorovaný súbor sadzieb.
8. Windows inštalátor `.exe` (build cez GitHub Actions na Windows runneri → GitHub Releases), updater s dovolením, návod pre
   netechnického používateľa (inštalácia, SmartScreen, záloha). macOS `.dmg` voliteľne neskôr.
9. Fáza 2 – zamestnanec

## Overenie
- **Unit testy engine** proti tvojmu Excelu: vstupy z `podklady` (2024: príjmy 31 500, SP 216,13, ZP 97,80, NČZD 5 646,48)
  musia dať rovnaké medzisúčty ako Excel; samostatný test, kde 60 % > 20 000, ukáže rozdiel oproti Excelu (oprava bodu 1).
- Kontrolné príklady z podnikajte.sk / finančnej správy pre roky 2024–2026 (min. odvody, NČZD, 15 % limit).
- Test offline: so zablokovanou sieťou celý výpočet, história aj export fungujú; žiadny request bez dialógu (overené logom).
- Test povolení: dialóg ukazuje správnu URL; „nepýtať sa“ preskočí dialóg; zamietnutie nechá pole na ručné zadanie.
- Playwright E2E: zadanie IČO → dialóg → doplnenie údajov, ročný/mesačný režim, prepísanie poľa, varovanie pri strope, uloženie, export XLSX a jeho otvorenie.
- Inštalátor: nainštalovať na čistý Windows (VM / CI runner) bez admin práv, spustiť, urobiť výpočet, odinštalovať; overiť, že bez siete
  appka štartuje a nerobí žiadny request (log + firewall).
- Ručne: porovnanie výsledku s reálnym DP 2024.

## Neskôr (odložené používateľom 15. 11. 2026)
- **Ťahák „čo kam napísať“ do DP** – zoznam riadok tlačiva DPFO A/B → suma (appka už pozná `dpRow`). Nízka priorita: appku používa autor a mama, ktorá DP vypĺňať vie.
- Zamietnuté: graf pod posuvníkom (menej prehľadné), tempo voči limitom v Rýchlom výpočte.
