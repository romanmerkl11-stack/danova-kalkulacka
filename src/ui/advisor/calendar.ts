import type { CalcResult } from "../../engine/types";
import { iso, lastDayOfMonth, todayIso } from "./dates";

export interface Deadline {
  id: string;
  /** ISO dátum prvého (alebo jediného) výskytu */
  date: string;
  title: string;
  note?: string;
  /** opakovanie (len text do tabuľky a RRULE do .ics) */
  recur?: { label: string; rrule: string };
}

const nextEighth = (now: Date): string => {
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (now.getDate() > 8) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return iso(y, m, 8);
};

/** Povinnosti pre rok výpočtu Y a Y+1 podľa profilu, zoradené podľa dátumu. */
export function buildDeadlines(r: CalcResult, now: Date): Deadline[] {
  const Y = r.year;
  const out: Deadline[] = [];
  const szco = r.profile !== "zamestnanec";
  if (szco) {
    out.push({
      id: "odvody",
      date: nextEighth(now),
      title: "Odvody SP a ZP",
      note: "do 8. dňa nasledujúceho mesiaca za predchádzajúci mesiac",
      recur: { label: "každý mesiac do 8.", rrule: "FREQ=MONTHLY;BYMONTHDAY=8;COUNT=12" },
    });
  }
  if (r.profile === "zamestnanec" && r.filing.canUseRZ) {
    out.push({ id: "rz", date: iso(Y + 1, 2, 15), title: `Žiadosť o ročné zúčtovanie za ${Y}`, note: "požiadajte zamestnávateľa do 15. 2." });
  }
  if (szco || r.filing.mustFile || r.filing.type === "B") {
    out.push({
      id: "dp",
      date: iso(Y + 1, 3, 31),
      title: `Daňové priznanie typ B za ${Y}`,
      note: szco ? "odklad o 3/6 mesiacov možný – oznámenie do 31. 3." : undefined,
    });
    if (r.summary.taxToPay > 0) out.push({ id: "dan", date: iso(Y + 1, 3, 31), title: `Úhrada dane za ${Y}`, note: "splatná v lehote na podanie priznania" });
  }
  if (szco) {
    out.push({ id: "zp-vysledok", date: iso(Y + 1, 6, 30), title: `Ročné zúčtovanie ZP za ${Y} – výsledok od poisťovne`, note: "poisťovňa oznámi nedoplatok/preplatok do 30. 6." });
    out.push({ id: "sp-zmena", date: iso(Y + 1, 7, 1), title: "Zmena výšky sociálneho poistenia", note: "nová výška platí od 1. 7." });
    out.push({ id: "zp-vyrovnanie", date: iso(Y + 1, 7, 31), title: `Vyrovnanie nedoplatku/preplatku ZP za ${Y}`, note: "do 31. 7." });
    const ad = r.next.taxAdvance;
    if (ad.period === "quarterly") {
      for (const m of [3, 6, 9, 12]) out.push({ id: `pred-${m}`, date: iso(Y + 1, m, lastDayOfMonth(Y + 1, m)), title: "Preddavok na daň (štvrťročne)", note: "do konca kvartálu" });
    } else if (ad.period === "monthly") {
      out.push({
        id: "pred-m",
        date: iso(Y + 1, 1, 31),
        title: "Preddavok na daň (mesačne)",
        note: "do konca mesiaca",
        recur: { label: "každý mesiac do konca mesiaca", rrule: "FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12" },
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export const isPast = (d: Deadline, now: Date) => !d.recur && d.date < todayIso(now);

// ---- iCalendar ----

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** zalomí riadok na 75 bajtov (UTF-8), pokračovanie začína medzerou */
function fold(line: string): string[] {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return [line];
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = " ";
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out;
}

const compact = (isoDate: string) => isoDate.replace(/-/g, "");
const nextDay = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(events: Deadline[], now: Date): string {
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Daňová kalkulačka//Poradca//SK", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    L.push("BEGIN:VEVENT");
    L.push(`UID:${e.id}-${compact(e.date)}@danova-kalkulacka`);
    L.push(`DTSTAMP:${stamp(now)}`);
    L.push(`DTSTART;VALUE=DATE:${compact(e.date)}`);
    L.push(`DTEND;VALUE=DATE:${compact(nextDay(e.date))}`);
    L.push(`SUMMARY:${esc(e.title)}`);
    if (e.note) L.push(`DESCRIPTION:${esc(e.note)}`);
    if (e.recur) L.push(`RRULE:${e.recur.rrule}`);
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:-P3D", "END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.flatMap(fold).join("\r\n") + "\r\n";
}
