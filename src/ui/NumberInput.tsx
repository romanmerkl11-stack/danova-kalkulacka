import { useId, useState } from "react";
import { formatSkNumber, parseSkNumber } from "./format";

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  /** zobrazí sa v prázdnom poli (napr. automatická hodnota) */
  placeholder?: string;
  /** prázdne pole = null (inak 0) */
  allowNull?: boolean;
  id?: string;
  label?: string;
  ariaLabel?: string;
  suffix?: string;
  className?: string;
}

/** Textové pole pre čísla v slovenskom zápise. Mimo fokusu ukazuje formátovanú hodnotu. */
export function NumberInput({ value, onChange, placeholder, allowNull, id, label, ariaLabel, suffix = "€", className }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const [text, setText] = useState<string | null>(null); // null = pole nie je v úprave

  const shown = text ?? (value === null ? "" : formatSkNumber(value));

  const input = (
    <span className={`num-wrap ${className ?? ""}`}>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className="num"
        value={shown}
        placeholder={placeholder}
        aria-label={label ? undefined : (ariaLabel ?? placeholder)}
        onFocus={(e) => {
          setText(value === null ? "" : String(value).replace(".", ","));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseSkNumber(e.target.value);
          if (n !== null) onChange(n);
          else if (e.target.value.trim() === "") onChange(allowNull ? null : 0);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
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
