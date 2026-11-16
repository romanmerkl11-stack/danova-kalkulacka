import { useMemo, useState } from "react";
import type { CalcInput } from "../../engine/types";
import { aggregate, applyToInput, type ApplyOpts } from "../../bank/aggregate";
import { addRule, classify, ruleFromTx } from "../../bank/classify";
import { ACCEPTED_EXTS, loadStatement } from "../../bank/load";
import { applyMapping, type ColumnMapping, type TableParseResult } from "../../bank/parseTable";
import type { BankRule, Category, ClassifiedTx, Tx } from "../../bank/types";
import { mergeTxs } from "../../bank/util";
import { MappingStep } from "./MappingStep";
import { ReviewTable } from "./ReviewTable";
import { SummaryStep } from "./SummaryStep";
import "./bank.css";
import { requestFeedback } from "../../feedback/FeedbackDialog";

const DUP_REASON = "Možná duplicita – rovnaký dátum a suma ako v inom výpise. Ak ide o inú platbu, zmeňte kategóriu.";

export interface BankImportProps {
  input: CalcInput;
  rules: BankRule[];
  onRulesChange(rules: BankRule[]): void;
  onApply(newInput: CalcInput): void;
  onClose(): void;
  openFile: (filterName: string, exts: string[]) => Promise<{ name: string; bytes: Uint8Array } | null>;
}

export function BankImport({ input, rules, onRulesChange, onApply, onClose, openFile }: BankImportProps) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [ownIban, setOwnIban] = useState<string | undefined>();
  const [ownerName, setOwnerName] = useState<string | undefined>();
  const [files, setFiles] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; table: TableParseResult } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Category>>({});
  const [opts, setOpts] = useState<ApplyOpts>({ income: true, sp: true, zp: true });

  const classified: ClassifiedTx[] = useMemo(
    () =>
      classify(txs, rules, { ownIban, ownerName })
        // možná duplicita z iného výpisu → predvolene nezapočítať (používateľ ju môže zaradiť ručne)
        .map((t) => (t.possibleDuplicate ? { ...t, category: "ine" as Category, reason: DUP_REASON } : t))
        .map((t) => (overrides[t.id] ? { ...t, category: overrides[t.id], reason: "Ručne zmenené" } : t)),
    [txs, rules, ownIban, ownerName, overrides],
  );
  const agg = useMemo(() => aggregate(classified, input.year), [classified, input.year]);
  const touched = useMemo(() => new Set(Object.keys(overrides)), [overrides]);

  const addTxs = (name: string, incoming: Tx[], extraWarnings: string[]) => {
    const r = mergeTxs(txs, incoming);
    setTxs(r.txs);
    setFiles((f) => [...f, name]);
    setWarnings((w) => [...w, ...extraWarnings.map((x) => `${name}: ${x}`)]);
    setInfo(
      `${name}: pridaných ${r.added} transakcií${r.skipped ? `, ${r.skipped} už bolo načítaných (preskočené)` : ""}.` +
        (r.suspect ? ` ${r.suspect} vyzerá ako možná duplicita (rovnaký dátum a suma ako v inom výpise) – nezapočítané, skontrolujte ich v zobrazení „Možné duplicity“.` : ""),
    );
  };

  const chooseFile = async () => {
    setError(null);
    setInfo(null);
    const f = await openFile("Výpis z účtu", ACCEPTED_EXTS);
    if (!f) return;
    setBusy(true);
    try {
      const res = await loadStatement(f.name, f.bytes);
      if (res.error) return setError(res.error);
      if (res.ownIban) setOwnIban(res.ownIban);
      if (res.ownerName) setOwnerName(res.ownerName);
      if (res.table && !res.table.confident) return setPending({ name: f.name, table: res.table });
      addTxs(f.name, res.txs, res.warnings);
    } finally {
      setBusy(false);
    }
  };

  const confirmMapping = (mapping: ColumnMapping) => {
    if (!pending) return;
    const parsed = applyMapping(pending.table.rows, mapping);
    if (parsed.length === 0) setError(`${pending.name}: s týmto priradením sa nenašla žiadna transakcia.`);
    else addTxs(pending.name, parsed, []);
    setPending(null);
  };

  const setCategory = (t: ClassifiedTx, c: Category) => setOverrides((o) => ({ ...o, [t.id]: c }));
  const remember = (t: ClassifiedTx) => {
    onRulesChange(addRule(rules, ruleFromTx(t, t.category)));
    setOverrides((o) => {
      const n = { ...o };
      delete n[t.id];
      return n;
    });
  };

  const reset = () => {
    setTxs([]);
    setFiles([]);
    setWarnings([]);
    setOverrides({});
    setInfo(null);
    setError(null);
    setOwnIban(undefined);
  };

  return (
    <div className="overlay" role="presentation">
      <div className="dialog bank-dialog" role="dialog" aria-modal="true" aria-labelledby="bank-title">
        <div className="bank-head">
          <div>
            <h2 id="bank-title">Import z bankového výpisu</h2>
            <p className="note">Rok výpočtu: {input.year}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Zavrieť
          </button>
        </div>
        <p className="bank-privacy">Výpis sa spracuje len v tomto počítači, nikam sa neodosiela.</p>

        <div className="bank-files">
          <button type="button" onClick={chooseFile} disabled={busy || pending !== null}>
            {files.length === 0 ? "Nahrať výpis z účtu" : "Pridať ďalší výpis"}
          </button>
          {txs.length > 0 && (
            <button type="button" className="ghost" onClick={reset}>
              Vymazať načítané
            </button>
          )}
          <span className="note small">PDF, XLSX, CSV, XML (camt.053). Pre viac mesiacov nahrajte viac výpisov.</span>
        </div>
        {busy && <p className="note" role="status">Spracúvam výpis…</p>}
        {files.length > 0 && <p className="note small">Načítané súbory: {files.join(", ")}</p>}
        {info && <p className="good-text" role="status">{info}</p>}
        {error && (
          <div className="bank-msg err" role="alert">
            {error}{" "}
            <button type="button" className="link-btn" onClick={() => requestFeedback({ kind: "data", origin: "Chyba importu výpisu", error })}>
              Nahlásiť tento problém
            </button>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="bank-msg" role="status">
            Niektoré riadky sa nepodarilo spracovať – skontrolujte ich vo výpise ručne:
            <ul>
              {warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {warnings.length > 10 && <li>… a ďalších {warnings.length - 10}</li>}
            </ul>
          </div>
        )}

        {pending && <MappingStep fileName={pending.name} table={pending.table} onConfirm={confirmMapping} onCancel={() => setPending(null)} />}

        {txs.length > 0 && !pending && (
          <>
            <ReviewTable txs={classified} year={input.year} touched={touched} onCategory={setCategory} onRemember={remember} />
            <SummaryStep
              agg={agg}
              year={input.year}
              annualIncome={input.income.mode === "annual"}
              opts={opts}
              onOpts={setOpts}
              empty={txs.length === 0}
              onApply={() => onApply(applyToInput(input, agg, opts))}
              onCancel={onClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
