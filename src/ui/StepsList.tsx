import { useState } from "react";
import { eur } from "../engine/money";
import type { CalcInput, CalcResult, Step } from "../engine/types";
import type { Update } from "./InputSections";
import { Card } from "./Card";
import { NumberInput } from "./NumberInput";

const GROUPS: { id: Step["group"]; title: string }[] = [
  { id: "prijmy", title: "Príjmy a výdavky" },
  { id: "zamestnanie", title: "Zamestnanie (§5)" },
  { id: "najom", title: "Prenájom (§6 ods. 3)" },
  { id: "ostatne", title: "Ostatné príjmy (§ 8)" },
  { id: "dan", title: "Daň" },
  { id: "odvody", title: "Odvody" },
  { id: "buduci", title: "Budúci rok" },
];

const paramFmt = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 6 });

function StepRow({ step, input, update, readOnly }: { step: Step; input: CalcInput; update: Update; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(step.value);

  const save = () => {
    if (draft !== null) update((d) => void (d.overrides[step.id] = draft));
    setEditing(false);
  };

  return (
    <li className="step">
      <div className="step-main">
        <span className="step-label">
          {step.label}
          {step.dpRow && <span className="badge">{step.dpRow}</span>}
          {step.overridden && <span className="badge manual">ručne</span>}
        </span>
        {editing ? (
          <span className="step-edit">
            <NumberInput ariaLabel={`Nová hodnota – ${step.label}`} value={draft} onChange={setDraft} allowNull allowNegative />
            <button type="button" onClick={save}>Uložiť</button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>Zrušiť</button>
          </span>
        ) : (
          <span className="step-value num-text">{step.id === "sadzba15" ? (step.value ? "áno" : "nie") : eur(step.value)}</span>
        )}
        <span className="step-buttons">
          <button type="button" className="ghost icon" aria-expanded={open} aria-label={`Podrobnosti – ${step.label}`} title="Podrobnosti" onClick={() => setOpen(!open)}>
            ⓘ
          </button>
          {step.editable && !readOnly && !editing && (
            <button
              type="button"
              className="ghost icon"
              aria-label={`Upraviť ručne – ${step.label}`}
              title="Upraviť ručne"
              onClick={() => {
                setDraft(step.value);
                setEditing(true);
              }}
            >
              ✎
            </button>
          )}
        </span>
      </div>
      {step.overridden && input.overrides[step.id] !== undefined && (
        <button type="button" className="link-btn" onClick={() => update((d) => void delete d.overrides[step.id])}>
          Vrátiť automatiku
        </button>
      )}
      {open && (
        <div className="step-detail">
          <pre className="formula">{step.formula}</pre>
          {step.explain && <p>{step.explain}</p>}
          {step.law && <p className="note small">Zákon: {step.law}</p>}
          {step.params && step.params.length > 0 && (
            <ul className="params">
              {step.params.map((p, i) => (
                <li key={i}>
                  <strong>{p.label}:</strong> {paramFmt.format(p.param.value)}{" "}
                  <span className="note small">
                    (platí od {p.param.validFrom}
                    {p.param.validTo ? ` do ${p.param.validTo}` : ""})
                  </span>{" "}
                  {p.param.source && (
                    <a href={p.param.source} target="_blank" rel="noreferrer">zdroj</a>
                  )}{" "}
                  {!p.param.verified && <span className="badge warn">⚠ neoverené</span>}
                  {p.param.note && <div className="note small">{p.param.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

interface Props {
  result: CalcResult;
  input: CalcInput;
  update: Update;
  /** bez ručného prepisovania krokov (napr. Rýchly výpočet) */
  readOnly?: boolean;
  cardId?: string;
  defaultOpen?: boolean;
}

export function StepsList({ result, input, update, readOnly, cardId = "card-steps", defaultOpen = true }: Props) {
  // ručné prepisy sú pokročilá funkcia – ceruzky až po zapnutí
  const [editMode, setEditMode] = useState(false);
  const overridden = result.steps.filter((s) => s.overridden && input.overrides[s.id] !== undefined);
  return (
    <Card id={cardId} title="Postup výpočtu" defaultOpen={defaultOpen}>
      {!readOnly && (
        <div className="steps-tools">
          {overridden.length > 0 && (
            <span className="steps-overrides" role="status">
              <span className="badge manual">ručne</span> Ručné prepisy: {overridden.length} ({overridden.map((s) => s.label).join(", ")}) ·{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  update((d) => {
                    for (const s of overridden) delete d.overrides[s.id];
                  })
                }
              >
                Obnoviť všetky
              </button>
            </span>
          )}
          <button type="button" className="link-btn" aria-pressed={editMode} onClick={() => setEditMode(!editMode)}>
            {editMode ? "Hotovo – skryť úpravy" : "Upraviť medzivýsledky ručne"}
          </button>
        </div>
      )}
      {GROUPS.map((g) => {
        const steps = result.steps.filter((s) => s.group === g.id);
        if (steps.length === 0) return null;
        return (
          <div key={g.id} className="step-group">
            <h3>{g.title}</h3>
            <ul className="steps">
              {steps.map((s) => (
                <StepRow key={s.id} step={s} input={input} update={update} readOnly={readOnly || !editMode} />
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}
