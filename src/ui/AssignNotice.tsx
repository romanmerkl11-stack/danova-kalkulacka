import { useState } from "react";
import { eur } from "../engine/money";
import { assignShare } from "./assign";
import "./assign.css";

const KEY = "dk-assign-hidden";

/**
 * Plávajúci odznak vpravo dole: „💝 Darujte 2 % · X €“. Klik ho rozbalí (3 %, rodičia, termín),
 * × ho skryje do konca relácie. Ukáže sa, len keď vychádza daň aspoň 150 € (podiel min. 3 €).
 */
export function AssignNotice({ tax, year }: { tax: number; year: number }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
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
    <aside className={`assign-float${open ? " open" : ""}`} aria-label="Darujte 2 % dane">
      <button type="button" className="assign-pill" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="assign-heart" aria-hidden="true">💝</span>
        <span className="assign-text">
          Darujte 2 % <strong>· {eur(a.two)}</strong>
        </span>
      </button>
      <button type="button" className="assign-close" aria-label="Zavrieť upozornenie na 2 %" onClick={hide}>×</button>
      {open && (
        <div className="assign-detail" role="status">
          <p>
            Časť dane môžete darovať – <b>nič vás to nestojí</b>.
          </p>
          <ul>
            <li><b>2 % = {eur(a.two)}</b> neziskovej organizácii</li>
            <li><b>3 % = {eur(a.three)}</b>, ak ste v roku {year} dobrovoľníčili aspoň 40 hodín</li>
            <li>2 % aj rodičovi, ktorý poberá dôchodok (podmienky overte na financnasprava.sk)</li>
          </ul>
          <p className="small muted">Vyplní sa v daňovom priznaní (do 31. 3. {year + 1}). Suma je orientačná – počíta sa zo skutočne zaplatenej dane.</p>
        </div>
      )}
    </aside>
  );
}
