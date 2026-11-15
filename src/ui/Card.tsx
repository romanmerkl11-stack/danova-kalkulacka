import { useEffect, useState, type ReactNode } from "react";

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
export const OPEN_EVENT = "dk-open-card";

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
  const store = (next: boolean) => {
    try {
      window.localStorage.setItem(KEY + id, next ? "1" : "0");
    } catch {
      /* úložisko nedostupné – nevadí */
    }
  };
  const toggle = () => {
    const next = !open;
    setOpen(next);
    store(next);
  };
  // rozbalenie zvonku: window.dispatchEvent(new CustomEvent("dk-open-card", { detail: id }))
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return;
      setOpen(true);
      store(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const bodyId = `${id}-body`;
  return (
    <section id={id} className={`card ui-card${open ? "" : " collapsed"}${className ? ` ${className}` : ""}`}>
      <div className="card-head">
        {collapsible ? (
          <button type="button" className="card-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
            <span className="chev" aria-hidden="true" />
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
