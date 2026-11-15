import { eur, pct } from "../../engine/money";
import type { ParamSet } from "../../params/types";

export function HowTab({ year, params }: { year: number; params: ParamSet }) {
  const T = params[year]?.tax ?? null;
  const SP = params[year + 1]?.sp ?? params[year]?.sp;
  const ZP = params[year + 1]?.zp ?? params[year]?.zp;
  const v = (x: number | undefined, f: (n: number) => string = eur) => (x === undefined ? "—" : f(x));

  return (
    <main className="page how">
      <section className="card">
        <h2>Ako sa to počíta</h2>
        <p className="note">Uvedené sumy sú sadzby použité pre rok {year} (odvody pre rok {year + 1}). Presné hodnoty a zdroje nájdete v záložke Sadzby.</p>

        <h3>Čo appka počíta a čo nie</h3>
        <p>
          Appka robí <strong>orientačný výpočet</strong> dane z príjmov a odvodov samostatne zárobkovo činnej osoby (SZČO). Pomáha pochopiť, čo vás čaká a kde sú dôležité hranice. Nenahrádza daňového poradcu ani
          účtovníka a nevypĺňa za vás daňové priznanie. Pri hraničných situáciách si údaje overte.
        </p>
        <p>Ak je niektorý údaj odhad (napr. daňový bonus), je to v postupe výpočtu napísané.</p>

        <h3>Príjmy a paušálne výdavky</h3>
        <ul>
          <li>Príjmy sú všetky v roku prijaté platby za živnosť, ročne alebo po mesiacoch (chýbajúce mesiace môže appka dopočítať priemerom).</li>
          <li>Pri paušálnych výdavkoch sa odpočíta {T ? pct(T.pausalRate) : "60 %"} z príjmov, najviac {v(T?.pausalCap.value)} ročne.</li>
          <li>Popri paušále sa ako výdavok uznáva aj <strong>zaplatené poistné</strong> (sociálne a zdravotné) – appka ho k paušálu pripočíta.</li>
          <li>Pri skutočných výdavkoch zadáte ich výšku sami.</li>
        </ul>

        <h3>Základ dane a nezdaniteľná časť</h3>
        <p>
          Základ dane = príjmy − výdavky (spolu s ostatnými príjmami zo zamestnania a prenájmu a prípadnou stratou). Od neho sa odpočíta nezdaniteľná časť základu dane (NČZD) na daňovníka –{" "}
          {v(T?.nczd.value)}. Ak základ dane presiahne {v(T?.nczdFullUpTo.value)}, NČZD sa kráti: {T ? `${eur(T.nczdReduceConst.value)} − základ dane / ${T.nczdReduceDivisor}` : "podľa vzorca zákona"}, až úplne
          zanikne. Môžete si uplatniť aj NČZD na manžela/ku a príspevky na doplnkové dôchodkové sporenie.
        </p>

        <h3>Sadzba dane</h3>
        <ul>
          <li>
            Ak zdaniteľné príjmy zo živnosti nepresiahnu {v(T?.reducedRateLimit.value)}, zdaní sa základ dane zo živnosti sadzbou {T ? pct(T.reducedRate) : "15 %"}.
          </li>
          <li>
            Inak sa zdaní progresívne po pásmach{T ? ": " + T.brackets.map((b) => (b.upTo ? `${pct(b.rate)} do ${eur(b.upTo.value)}` : `${pct(b.rate)} nad touto hranicou`)).join(", ") : ""}.
          </li>
          <li>Daň do {v(T?.minTaxLevied.value)} sa nevyrubuje ani neplatí.</li>
        </ul>

        <h3>Daňový bonus (odhad)</h3>
        <p>
          Bonus na dieťa sa počíta po mesiacoch podľa veku dieťaťa{T ? ` (${T.bonusTiers.map((t) => `do ${t.maxAge} rokov ${eur(t.monthly.value)} mesačne`).join(", ")})` : ""}.
          {T?.bonusReductionThreshold ? ` Pri mesačnom základe dane nad ${eur(T.bonusReductionThreshold.value)} sa kráti o 1/10 z rozdielu.` : ""} Nárok vzniká, ak zdaniteľné príjmy dosiahnu aspoň 6 ×
          minimálna mzda{T ? ` (${eur(6 * T.minimalnaMzda.value)})` : ""}. Je to odhad – presnú sumu si overte.
        </p>

        <h3>Sociálne poistenie</h3>
        <ul>
          <li>
            Povinné poistenie vzniká <strong>od 1. 7.</strong> podľa príjmov za predošlý rok: ak príjmy z podnikania presiahnu {v(SP?.limitVzniku.value)}, platíte poistné z vymeriavacieho základu.
          </li>
          <li>
            Vymeriavací základ (VZ) = základ dane zo živnosti / {SP?.koeficient ?? "koeficient"} / 12, najmenej {v(SP?.minVZ.value)}, najviac {v(SP?.maxVZ.value)} mesačne. Poistné sa počíta zo
            sadzieb jednotlivých fondov (spolu {SP ? pct(SP.funds.reduce((a, f) => a + f.rate, 0)) : "33,15 %"}).
          </li>
          <li>
            Pod limitom môže platiť <strong>mikroodvod</strong> (od 7/2026){SP?.mikro ? `: ${eur(SP.mikro.poistne.value)} mesačne z osobitného základu ${eur(SP.mikro.vz.value)}` : ""}. Ak v danom roku neexistuje,
            použije sa minimálne poistné.
          </li>
          <li>
            <strong>Posun platby o mesiac:</strong> poistné sa platí do 8. dňa nasledujúceho mesiaca, takže januárová platba je za december predošlého roka. Do výdavkov ide poistné skutočne zaplatené v roku.
          </li>
        </ul>

        <h3>Zdravotné poistenie</h3>
        <ul>
          <li>
            Mesačný preddavok = vymeriavací základ × {ZP ? pct(ZP.rate) : "sadzba"}; základ je najmenej {v(ZP?.minVZ.value)} (preddavok aspoň {v(ZP?.minPreddavok.value)}) a odvíja sa od základu dane
            / {ZP?.koeficient ?? "koeficient"} / 12.
          </li>
          <li>
            Po podaní daňového priznania zdravotná poisťovňa urobí <strong>ročné zúčtovanie</strong>: porovná zaplatené preddavky so skutočným poistným. Výsledkom je nedoplatok alebo preplatok (orientačný odhad v
            appke).
          </li>
        </ul>

        <h3>Rezerva do limitov</h3>
        <p>
          Panel „Limity“ ukazuje, ako ďaleko ste od hraníc, po ktorých sa niečo mení – strop paušálnych výdavkov, limit pre {T ? pct(T.reducedRate) : "15 %"} sadzbu, začiatok krátenia NČZD, hranice pásiem dane,
          vznik sociálneho poistenia, registrácia na DPH, povinnosť podať priznanie. Pri mesačnom zadaní odhaduje aj mesiac, v ktorom limit pri súčasnom tempe prekročíte.
        </p>

        <h3>Odkiaľ sú sadzby</h3>
        <p>
          Sadzby sú zabalené priamo v appke, každá s dátumom účinnosti a odkazom na zdroj. Hodnota označená <strong>⚠ neoverené</strong> pochádza z neoficiálneho zdroja alebo je odvodená – overte si ju. V záložke
          Sadzby môžete skontrolovať nový súbor sadzieb, pozrieť si rozdiely a prijať ich; zabalené hodnoty sa dajú kedykoľvek vrátiť.
        </p>

        <h3>Súkromie</h3>
        <ul>
          <li>Appka funguje <strong>offline</strong> a vaše výpočty ostávajú len v tomto zariadení. Nič sa neodosiela na internet.</li>
          <li>Na internet ide len pri vyhľadaní firmy v registri, kontrole sadzieb a kontrole novej verzie – a vždy až po vašom povolení v dialógu (pokiaľ ste ho natrvalo nepovolili).</li>
          <li>Každý prístup sa zapíše do logu v Nastaveniach (adresa, čo sa odoslalo, výsledok). Režim „Úplne offline“ sieť úplne vypne.</li>
        </ul>
      </section>
    </main>
  );
}
