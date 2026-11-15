import { useState, type ReactNode } from "react";

// Jednotná karta: nadpis + voliteľné zbalenie celej karty jednou šípkou.
// Obsah vnútri je vždy rozbalený (žiadne vnorené šípky).
// Stav zbalenia si pamätá tento prehliadač (len pohodlie, nič dôležité).

interface Props {
  /** stabilné id – kotva pre rýchle odkazy (#id) a kľúč zapamätaného stavu */
  id: string;
  title: ReactNode;
  children: ReactNode;
  /** false = karta sa nedá zbaliť */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** tlačidlá vpravo v hlavičke */
  actions?: ReactNode;
  className?: string;
}

const KEY = "dk-card-open:";

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(KEY + id);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function Card({ id, title, children, collapsible = true, defaultOpen = true, actions, className }: Props) {
  const [open, setOpen] = useState(() => (collapsible ? readOpen(id, defaultOpen) : true));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(KEY + id, next ? "1" : "0");
    } catch {
      /* úložisko nedostupné – nevadí */
    }
  };
  const bodyId = `${id}-body`;
  return (
    <section id={id} className={`card ui-card${open ? "" : " collapsed"}${className ? ` ${className}` : ""}`}>
      <div className="card-head">
        {collapsible ? (
          <button type="button" className="card-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
            <span className="chev" aria-hidden="true">▸</span>
            <h2>{title}</h2>
          </button>
        ) : (
          <h2>{title}</h2>
        )}
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {open && (
        <div id={bodyId} className="card-body">
          {children}
        </div>
      )}
    </section>
  );
}
