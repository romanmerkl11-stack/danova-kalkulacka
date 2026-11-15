import { useState } from "react";
import { eur } from "../engine/money";
import type { CalcInput, CalcResult } from "../engine/types";
import { buildXlsx } from "../export/xlsx";
import { calcToJson, parseCalcJson, type CalcData } from "../export/json";
import { openFile, saveFileAs } from "../store/storage";
import { Card } from "./Card";
import { skDate } from "./format";

interface Props {
  result: CalcResult;
  input: CalcInput;
  ico: string;
  companyName: string;
  title: string;
  /** nahradí aktuálny vstup (a IČO, ak je v súbore) */
  onLoad: (input: CalcInput, ico?: string) => void;
}

interface Preview {
  input: CalcInput;
  ico?: string;
  lines: string[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ExportPanel({ result, input, ico, companyName, title, onLoad }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `vypocet-${ico || "bez-ico"}-${input.year}`;
  const s = result.summary;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const exportXlsx = () =>
    run(async () => {
      const bytes = await buildXlsx(result, input, { title, companyName, ico, createdAt: new Date().toISOString() });
      if (await saveFileAs(`${base}.xlsx`, bytes, "Excel", "xlsx")) setInfo("Excel uložený.");
    });

  const exportJson = () =>
    run(async () => {
      const now = new Date().toISOString();
      const data: CalcData = {
        ico,
        companyName,
        title,
        year: input.year,
        createdAt: now,
        updatedAt: now,
        input: structuredClone(input),
        summary: { income: s.income, tax: s.tax, taxToPay: s.taxToPay, sp: s.sp, zp: s.zp, net: s.net },
      };
      if (await saveFileAs(`${base}.json`, calcToJson(data), "Výpočet (JSON)", "json")) setInfo("JSON uložený.");
    });

  const importJson = () =>
    run(async () => {
      const f = await openFile("Výpočet (JSON)", ["json"]);
      if (!f) return;
      const c = parseCalcJson(new TextDecoder().decode(f.bytes));
      setPreview({
        input: c.input,
        ico: c.ico || undefined,
        lines: [
          `Výpočet: ${c.title}`,
          `Firma: ${c.companyName}${c.ico ? ` (IČO ${c.ico})` : ""}`,
          `Rok: ${c.year}`,
          `Príjmy ${eur(c.summary.income)}, daň ${eur(c.summary.tax)}`,
          `Uložené: ${skDate(c.updatedAt)}`,
        ],
      });
    });

  const confirm = () => {
    if (!preview) return;
    onLoad(preview.input, preview.ico);
    setPreview(null);
    setInfo("Údaje načítané.");
  };

  return (
    <Card id="card-export" title="Export a import" defaultOpen={false}>
      <div className="row export-row">
        <span className="export-label">Export:</span>
        <button type="button" className="ghost" disabled={busy} onClick={exportXlsx}>Excel (XLSX)</button>
        <button type="button" className="ghost" disabled={busy} onClick={() => window.print()}>PDF / Tlač</button>
        <button type="button" className="ghost" disabled={busy} onClick={exportJson}>JSON</button>
      </div>
      <div className="row export-row">
        <span className="export-label">Import:</span>
        <button type="button" className="ghost" disabled={busy} onClick={importJson}>Načítať výpočet (JSON)</button>
      </div>
      {error && <div className="box danger" role="alert">{error}</div>}
      {info && !error && <p className="good-text" role="status">{info}</p>}
      {preview && (
        <div className="box info import-preview" role="group" aria-label="Potvrdenie importu">
          <strong>Načítaním sa nahradí aktuálne zadanie:</strong>
          <ul>
            {preview.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <div className="row">
            <button type="button" onClick={confirm}>Načítať</button>
            <button type="button" className="ghost" onClick={() => setPreview(null)}>Zrušiť</button>
          </div>
        </div>
      )}
    </Card>
  );
}
