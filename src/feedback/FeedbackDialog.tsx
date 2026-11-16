import { useEffect, useRef, useState } from "react";
import { openExternal } from "../net/open";
import { isTauri, saveFileAs } from "../store/storage";
import { KIND_LABEL, feedbackAddress, isEmpty, mailtoUrl, reportText, type FeedbackContext, type FeedbackDraft, type FeedbackKind } from "./report";
import "./feedback.css";

interface Props {
  draft: FeedbackDraft;
  context: FeedbackContext;
  /** priebežné uloženie konceptu (zostane aj po zatvorení appky) */
  onDraft: (d: FeedbackDraft) => void;
  /** používateľ hlásenie odoslal alebo ho zahodil → koncept zmazať */
  onDone: () => void;
  /** zavrieť okno, koncept ostane */
  onClose: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // starší spôsob (napr. bez povolenia schránky)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const KINDS = Object.keys(KIND_LABEL) as FeedbackKind[];

/** Formulár „Nahlásiť problém / návrh“. Nič sa neodosiela na pozadí – len príprava e-mailu, kópia alebo súbor. */
export function FeedbackDialog({ draft, context, onDraft, onDone, onClose }: Props) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [status, setStatus] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const back = opener.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      // fokus späť na tlačidlo, ktoré okno otvorilo
      if (back instanceof HTMLElement) back.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (step === "form") firstRef.current?.focus();
    else previewRef.current?.focus();
  }, [step]);

  const set = (patch: Partial<FeedbackDraft>) => onDraft({ ...draft, ...patch });
  const text = reportText(draft, context);

  const prepareMail = async () => {
    setStatus(null);
    const { url, tooLong } = mailtoUrl(feedbackAddress(), draft, context);
    try {
      if (tooLong && !(await copyText(text))) {
        setStatus({ kind: "err", text: "Hlásenie je príliš dlhé na e-mail a nepodarilo sa ho skopírovať. Uložte ho do súboru a priložte k e-mailu." });
        return;
      }
      if (isTauri()) await openExternal(url);
      else window.location.href = url;
      setHandedOver(true);
      setStatus({
        kind: "ok",
        text: tooLong
          ? "E-mail je pripravený. Text hlásenia je v schránke – vložte ho do e-mailu (Ctrl+V) a odošlite ho vo svojej poštovej aplikácii."
          : "E-mail je pripravený. Odošlite ho vo svojej poštovej aplikácii. Ak sa nič neotvorilo, použite „Skopírovať“ alebo „Uložiť do súboru“.",
      });
    } catch (e) {
      setStatus({ kind: "err", text: `Poštovú aplikáciu sa nepodarilo otvoriť (${e instanceof Error ? e.message : String(e)}). Použite „Skopírovať“ alebo „Uložiť do súboru“.` });
    }
  };

  const copy = async () => {
    setStatus(null);
    if (await copyText(`${text}`)) {
      setHandedOver(true);
      setStatus({ kind: "ok", text: "Hlásenie je skopírované. Vložte ho do e-mailu alebo správy pre autora aplikácie." });
    } else setStatus({ kind: "err", text: "Kopírovanie sa nepodarilo. Uložte hlásenie do súboru." });
  };

  const saveFile = async () => {
    setStatus(null);
    try {
      const ok = await saveFileAs(`hlasenie-${draft.id}.txt`, text, "Text", "txt");
      if (ok) {
        setHandedOver(true);
        setStatus({ kind: "ok", text: "Hlásenie je uložené do súboru. Pošlite ho autorovi aplikácie (napr. ako prílohu e-mailu)." });
      } else setStatus({ kind: "err", text: "Ukladanie zrušené." });
    } catch (e) {
      setStatus({ kind: "err", text: `Súbor sa nepodarilo uložiť (${e instanceof Error ? e.message : String(e)}). Skúste „Skopírovať“.` });
    }
  };

  const field = (id: keyof FeedbackDraft, label: string, hint?: string, rows = 2) => (
    <div className="field">
      <label htmlFor={`fb-${id}`}>{label}</label>
      <textarea id={`fb-${id}`} rows={rows} value={String(draft[id] ?? "")} placeholder={hint} onChange={(e) => set({ [id]: e.target.value })} />
    </div>
  );

  return (
    <div className="overlay" role="presentation">
      <div className="dialog fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        {step === "form" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!isEmpty(draft)) setStep("preview");
            }}
          >
            <h2 id="fb-title">Nahlásiť problém alebo návrh</h2>
            <p className="note small">
              Hlásenie si pred odoslaním pozriete. Vaše výpočty, mená, IČO ani výpisy sa k nemu nepridávajú – len to, čo sem napíšete, a verzia aplikácie.
            </p>
            <div className="field">
              <label htmlFor="fb-kind">Typ</label>
              <select id="fb-kind" value={draft.kind} onChange={(e) => set({ kind: e.target.value as FeedbackKind })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fb-what">Čo sa stalo alebo čo by ste zlepšili? *</label>
              <textarea
                id="fb-what"
                ref={firstRef}
                rows={4}
                required
                value={draft.what}
                placeholder="napr. Po kliknutí na Uložiť sa výpočet neobjavil v Histórii."
                onChange={(e) => set({ what: e.target.value })}
              />
            </div>
            {field("expected", "Čo ste očakávali? (nepovinné)")}
            {draft.kind === "vypocet" && (
              <div className="fb-amounts">
                <div className="field">
                  <label htmlFor="fb-expectedAmount">Očakávaná suma</label>
                  <input id="fb-expectedAmount" type="text" value={draft.expectedAmount} onChange={(e) => set({ expectedAmount: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="fb-appAmount">Suma z aplikácie</label>
                  <input id="fb-appAmount" type="text" value={draft.appAmount} onChange={(e) => set({ appAmount: e.target.value })} />
                </div>
              </div>
            )}
            {field("steps", "Ako sa to dá zopakovať? (nepovinné)", "napr. Výpočet → rok 2026 → zmena paušálu na skutočné výdavky")}
            {(draft.kind === "vypocet" || draft.source.trim() !== "") &&
              field("source", "Odborná poznámka alebo zdroj (nepovinné)", "rok, riadok DP, ustanovenie zákona, odkaz – môžete pridať aj vymyslený testovací príklad")}
            <div className="fb-amounts">
              <div className="field">
                <label htmlFor="fb-name">Meno alebo prezývka (nepovinné)</label>
                <input id="fb-name" type="text" autoComplete="off" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="fb-contact">Kontakt na odpoveď (nepovinné)</label>
                <input id="fb-contact" type="text" autoComplete="off" value={draft.contact} onChange={(e) => set({ contact: e.target.value })} />
              </div>
            </div>
            {draft.kind === "vypocet" && <p className="note small">Sumy a príklad pridávate vedome – nepíšte sem údaje klientov, ak to nie je nutné.</p>}
            <div className="dialog-actions">
              <button type="submit" disabled={isEmpty(draft)}>Pozrieť hlásenie</button>
              <button type="button" className="ghost" onClick={onClose}>Zavrieť (koncept ostane)</button>
              <button type="button" className="ghost danger-btn" onClick={() => setConfirmDiscard(true)}>Zahodiť</button>
            </div>
          </form>
        ) : (
          <>
            <h2 id="fb-title" ref={previewRef} tabIndex={-1}>Náhľad hlásenia</h2>
            <p className="note small">Toto je celý obsah hlásenia. Nič sa neodošle automaticky.</p>
            <pre className="fb-preview">{text}</pre>
            <div className="dialog-actions">
              <button type="button" onClick={() => void prepareMail()}>Pripraviť e-mail</button>
              <button type="button" className="ghost" onClick={() => void copy()}>Skopírovať</button>
              <button type="button" className="ghost" onClick={() => void saveFile()}>Uložiť do súboru</button>
              <button type="button" className="ghost" onClick={() => setStep("form")}>Späť upraviť</button>
            </div>
            {status && (
              <p className={status.kind === "ok" ? "note" : "note bad-text"} role="status">
                {status.text}
              </p>
            )}
            <div className="dialog-actions">
              {handedOver && (
                <button type="button" onClick={onDone}>
                  Mám odoslané – zmazať koncept
                </button>
              )}
              <button type="button" className="ghost" onClick={onClose}>Zavrieť (koncept ostane)</button>
            </div>
          </>
        )}
        {confirmDiscard && (
          <div className="box warn" role="alert" style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 8px" }}>Naozaj zahodiť rozpísané hlásenie?</p>
            <div className="row">
              <button type="button" onClick={onDone}>Zahodiť</button>
              <button type="button" className="ghost" onClick={() => setConfirmDiscard(false)}>Nechať</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Otvorí formulár odkiaľkoľvek (napr. z chybového hlásenia): window.dispatchEvent(...) */
export const FEEDBACK_EVENT = "dk-feedback";
export interface FeedbackRequest {
  kind?: FeedbackKind;
  origin?: string;
  error?: string;
}
export const requestFeedback = (r: FeedbackRequest = {}) => window.dispatchEvent(new CustomEvent<FeedbackRequest>(FEEDBACK_EVENT, { detail: r }));
