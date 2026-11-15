import { useState } from "react";
import { eur } from "../engine/money";
import { assignShare } from "./assign";

const KEY = "dk-assign-hidden";

/** Okienko: „môžete darovať 2 % / 3 % dane“ – ukáže sa, len keď vychádza daň aspoň 150 €. */
export function AssignNotice({ tax, year }: { tax: number; year: number }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const a = assignShare(tax);
  if (!a || hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      /* nevadí */
    }
  };
  return (
    <div className="assign-notice" role="status">
      <div className="assign-icon" aria-hidden="true">💝</div>
      <div className="assign-body">
        <strong>Môžete darovať časť dane – nič vás to nestojí</strong>
        <div>
          <b>2 % = {eur(a.two)}</b> neziskovej organizácii, alebo <b>3 % = {eur(a.three)}</b>, ak ste v roku {year} dobrovoľníčili aspoň 40 hodín.
        </div>
        <div className="small muted">
          2 % sa dajú poukázať aj rodičovi, ktorý poberá dôchodok (rodičovský dôchodok) – podmienky si overte na financnasprava.sk. Vyplní sa priamo v daňovom
          priznaní (do 31. 3. {year + 1}). Suma je orientačná – počíta sa zo skutočne zaplatenej dane.
        </div>
      </div>
      <button type="button" className="ghost icon" aria-label="Skryť upozornenie" onClick={hide}>×</button>
    </div>
  );
}
