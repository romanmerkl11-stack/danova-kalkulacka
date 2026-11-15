import type { Profile } from "../engine/types";

export const PROFILES: { id: Profile; label: string }[] = [
  { id: "szco", label: "Živnosť (SZČO)" },
  { id: "zamestnanec", label: "Zamestnanec" },
  { id: "oboje", label: "Oboje" },
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
