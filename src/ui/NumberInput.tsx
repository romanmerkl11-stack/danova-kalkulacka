import { useId, useRef, useState } from "react";
import { formatSkNumber, parseSkNumber } from "./format";

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  /** zobrazí sa v prázdnom poli (napr. automatická hodnota) */
  placeholder?: string;
  /** prázdne pole = null (inak 0) */
  allowNull?: boolean;
  /** povoliť záporné čísla (predvolene nie) */
  allowNegative?: boolean;
  id?: string;
  label?: string;
  ariaLabel?: string;
  suffix?: string;
  className?: string;
}

/** Textové pole pre čísla v slovenskom zápise. Mimo fokusu ukazuje formátovanú hodnotu. */
export function NumberInput({ value, onChange, placeholder, allowNull, allowNegative, id, label, ariaLabel, suffix = "€", className }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const [text, setText] = useState<string | null>(null); // null = pole nie je v úprave
  const startRef = useRef<number | null | undefined>(undefined); // hodnota pri začiatku úpravy

  const shown = text ?? (value === null ? "" : formatSkNumber(value));
  // neplatný text: výpočet ďalej používa poslednú platnú hodnotu – povedať to nahlas
  const parsed = text === null ? null : parseSkNumber(text);
  const problem =
    text === null || text.trim() === ""
      ? null
      : parsed === null
        ? "Neplatné číslo"
        : parsed < 0 && !allowNegative
          ? "Záporné číslo tu nie je povolené"
          : null;
  const errId = `${inputId}-err`;

  const input = (
    <span className={`num-wrap ${className ?? ""}`}>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className={problem ? "num invalid" : "num"}
        value={shown}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? errId : undefined}
        placeholder={placeholder}
        aria-label={label ? undefined : (ariaLabel ?? placeholder)}
        onFocus={(e) => {
          startRef.current = value;
          setText(value === null ? "" : String(value).replace(".", ","));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseSkNumber(e.target.value);
          if (n !== null && (n >= 0 || allowNegative)) onChange(n);
          else if (e.target.value.trim() === "") onChange(allowNull ? null : 0);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && startRef.current !== undefined) {
            // Escape = zrušiť úpravu, vrátiť hodnotu spred úpravy
            if (startRef.current !== value) onChange(startRef.current);
            e.currentTarget.blur();
          } else if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
      {problem && (
        <span id={errId} className="num-err" role="alert">
          {problem} – použije sa {value === null ? "automatická hodnota" : `${formatSkNumber(value)}${suffix ? " " + suffix : ""}`}
        </span>
      )}
    </span>
  );
  if (!label) return input;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {input}
    </div>
  );
}
