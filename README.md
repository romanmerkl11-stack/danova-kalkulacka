# Daňová kalkulačka

Kalkulačka dane z príjmov a odvodov (SP, ZP) pre **živnostníkov s paušálnymi výdavkami** a **zamestnancov** (aj súbeh, prenájom a ostatné príjmy).
Všetky výpočty a dáta zostávajú v počítači. Na internet ide appka len s vaším dovolením (hľadanie v registri, kontrola sadzieb a novej verzie).

- **Webová verzia (bez inštalácie):** https://romanmerkl11-stack.github.io/danova-kalkulacka/
- **Windows verzia:** [posledné vydanie](https://github.com/romanmerkl11-stack/danova-kalkulacka/releases/latest)

---

## Návod na inštaláciu (Windows)

1. Otvorte [posledné vydanie](https://github.com/romanmerkl11-stack/danova-kalkulacka/releases/latest) a kliknite na súbor, ktorý končí na **`.exe`** (napr. `Danova.kalkulacka_0.1.0_x64-setup.exe`). Stiahne sa do priečinka *Stiahnuté súbory*.
2. Súbor spustite dvojklikom.
3. Ak sa objaví modré okno **„Systém Windows ochránil váš počítač“**, kliknite na **Ďalšie informácie** a potom na **Spustiť aj tak**. (Appka nie je podpísaná certifikátom, preto ju Windows nepozná – je to v poriadku.)
4. Sprievodca inštaláciou je v slovenčine – stačí klikať **Ďalej** a **Inštalovať**. Netreba heslo správcu.
5. Na ploche a v ponuke Štart pribudne **Daňová kalkulačka**.

## Nová verzia

- Pri spustení sa appka (s vaším dovolením) pozrie, či nie je k dispozícii novšia verzia. Ak áno, zobrazí hore pruh **„Je k dispozícii nová verzia“** s tlačidlom **Stiahnuť**.
- Stiahnutý súbor `.exe` spustite rovnako ako pri prvej inštalácii – nová verzia sa nainštaluje cez starú a **uložené výpočty zostanú**.
- Kontrolu môžete kedykoľvek spustiť ručne v **Nastavenia → Aktualizácia aplikácie**.

## Kde sú moje údaje a ako ich zálohovať

- Výpočty sa ukladajú len v tomto počítači (súbor `data.json` v priečinku aplikácie).
- **Záloha:** Nastavenia → **Zálohovať všetky dáta** – uložte súbor napr. na USB kľúč alebo do e-mailu.
- **Obnova** (napr. na novom počítači): Nastavenia → **Obnoviť zo zálohy**.

## Odinštalovanie

Štart → Nastavenia → Aplikácie → **Daňová kalkulačka** → Odinštalovať.

---

## Pre vývojára

Stav vývoja a ďalšie kroky sú v [HANDOFF.md](HANDOFF.md), detailný plán v [docs/PLAN.md](docs/PLAN.md).

```bash
npm install
npm test            # testy
npm run dev         # webová verzia na http://localhost:1420
npm run tauri dev   # desktopová appka
npm run params      # params/params.json zo src/params/data.ts (po zmene sadzieb zvýš PARAMS_DATE)
```

**Vydanie novej verzie (Windows .exe):** zvýš `version` v `package.json`, `src-tauri/tauri.conf.json` a `src-tauri/Cargo.toml`, commitni a pushni značku, napr.:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

GitHub Actions (`.github/workflows/release.yml`) zostaví inštalátor a nahrá ho do Releases. Push do `main` zároveň aktualizuje webovú verziu (`pages.yml`).
