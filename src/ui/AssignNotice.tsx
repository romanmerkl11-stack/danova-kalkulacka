import { useState } from "react";
import { eur } from "../engine/money";
import { assignShare } from "./assign";
import "./assign.css";

/**
 * Riadok vo výsledku: „💝 Môžete darovať 2 % · X €“. Klik rozbalí podrobnosti (3 %, rodičia, termín).
 * Ukáže sa, len keď vychádza daň aspoň 150 € (podiel min. 3 €). Neprekrýva výsledky ani upozornenia.
 */
export function AssignNotice({ tax, year }: { tax: number; year: number }) {
  const [open, setOpen] = useState(false);
  const a = assignShare(tax);
  if (!a) return null;
  return (
    <div className={`assign-inline${open ? " open" : ""}`}>
      <button type="button" className="assign-pill" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="assign-heart" aria-hidden="true">💝</span>
        <span className="assign-text">
          Môžete darovať 2 % dane <strong>· {eur(a.two)}</strong>
        </span>
        <span className="assign-more" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="assign-detail">
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
    </div>
  );
}
