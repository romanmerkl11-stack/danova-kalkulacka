# Spätná väzba → issues v súkromnom repe

Appka pošle hlásenie malému skriptu v Google Apps Script, ten vytvorí issue v
`romanmerkl11-stack/privat-vecicky` so štítkom `danova-kalkulacka`. GitHub token je
uložený len v skripte – v appke (web ani .exe) nie je.

## 1. Token na GitHube (len na issues v jednom repe)
1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → *Generate new token*.
2. Name: `danova-kalkulacka-feedback`, Expiration: napr. 1 rok.
3. Repository access: **Only select repositories** → `privat-vecicky`.
4. Permissions → Repository permissions → **Issues: Read and write** (nič iné).
5. Vygenerovať a token skopírovať (zobrazí sa len raz). Nikam ho nevkladaj okrem kroku 2.6.

## 2. Skript
1. Otvor https://script.google.com → **Nový projekt**, názov `Daňová kalkulačka – spätná väzba`.
2. Obsah `Code.gs` nahraď súborom `tools/feedback-apps-script.gs` z tohto repa. Uložiť.
3. ⚙ **Nastavenia projektu** → *Vlastnosti skriptu* → Pridať: `GITHUB_TOKEN` = token z kroku 1.
4. **Nasadiť → Nové nasadenie** → typ **Webová aplikácia**:
   - Spustiť ako: **Ja**
   - Kto má prístup: **Ktokoľvek**
5. Povoliť prístup (Google sa spýta na oprávnenia – „externé služby“ pre volanie GitHubu).
6. Skopírovať **URL webovej aplikácie** (končí na `/exec`) a poslať ju Claudovi – vloží ju do appky
   (`FEEDBACK_ENDPOINT` v `src/feedback/report.ts`).
7. Kontrola: otvor URL v prehliadači → má ukázať `{"ok":true,...}`.

## 3. Štítky v repe (raz)
V `privat-vecicky` → Issues → Labels vytvor `danova-kalkulacka` (a podľa chuti Problém, Výpočet,
Ovládanie, Dáta, Návrh, Iné). Ak sa štítky nepodarí nastaviť, skript vytvorí issue bez nich.

## Prevádzka
- Pri zmene skriptu: *Nasadiť → Spravovať nasadenia → upraviť → Nová verzia* (URL ostane rovnaká).
- Limit: 20 hlásení za hodinu, max. 20 000 znakov; opakované odoslanie toho istého hlásenia nevytvorí duplicitu.
- Token vyprší → vytvor nový a prepíš `GITHUB_TOKEN` (appku netreba meniť).
- Stav podnetov: Otvorené → komentár „Opravené vo verzii X“ → zavrieť po potvrdení používateľom.
