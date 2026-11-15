import { useEffect, useRef, useState } from "react";
import type { Profile } from "../engine/types";

export const PROFILES: { id: Profile; label: string }[] = [
  { id: "szco", label: "SZČO" },
  { id: "zamestnanec", label: "Zamestnanec" },
  { id: "oboje", label: "SZČO + zamestnanec" },
];

/** Prepínač profilu: živnosť / zamestnanec / oboje. */
export function ProfileSwitch({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  return (
    <div className="seg" role="group" aria-label="Typ daňovníka">
      {PROFILES.map((p) => (
        <button key={p.id} type="button" className={value === p.id ? "active" : ""} aria-pressed={value === p.id} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

const TITLE: Record<Profile, string> = {
  szco: "Daňová kalkulačka SZČO",
  zamestnanec: "Daňová kalkulačka zamestnanec",
  oboje: "Daňová kalkulačka SZČO + zamestnanec",
};

/** Nadpis appky so šípkou – po kliknutí výber profilu (živnosť / zamestnanec / oboje). */
export function ProfileTitle({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="profile-title" ref={ref}>
      <h1>
        <button type="button" className="profile-title-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Zmeniť typ výpočtu">
          {TITLE[value]}
          <span className="profile-chev" aria-hidden="true" />
        </button>
      </h1>
      {open && (
        <ul className="profile-menu" role="menu" aria-label="Typ výpočtu">
          {PROFILES.map((p) => (
            <li key={p.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === p.id}
                className={value === p.id ? "active" : ""}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
              >
                <span className="profile-check" aria-hidden="true">{value === p.id ? "✓" : ""}</span>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
