import { useState } from "react";
import type { CalcResult } from "../../engine/types";
import { saveFileAs } from "../../store/storage";
import { Card } from "../Card";
import { skDate } from "../format";
import { buildDeadlines, buildIcs, isPast } from "./calendar";

export function CalendarCard({ result, now }: { result: CalcResult; now: Date }) {
  const events = buildDeadlines(result, now);
  const [msg, setMsg] = useState("");
  const save = async () => {
    try {
      const ok = await saveFileAs("danova-kalkulacka-terminy.ics", buildIcs(events, new Date()), "Kalendár", "ics");
      setMsg(ok ? "Kalendár uložený." : "");
    } catch {
      setMsg("Súbor sa nepodarilo uložiť.");
    }
  };
  return (
    <Card id="card-calendar" title="Kalendár povinností">
      <table className="adv">
        <thead>
          <tr>
            <th scope="col">Povinnosť</th>
            <th scope="col" className="r">Termín</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className={isPast(e, now) ? "adv-past" : undefined}>
              <td>
                {e.title}
                {e.note && <div className="adv-note">{e.note}</div>}
              </td>
              <td className="r">{e.recur ? e.recur.label : skDate(`${e.date}T12:00:00`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="adv-actions">
        <button type="button" onClick={() => void save()}>Uložiť do kalendára (.ics)</button>
        {msg && <span className="adv-note" role="status">{msg}</span>}
      </div>
    </Card>
  );
}
