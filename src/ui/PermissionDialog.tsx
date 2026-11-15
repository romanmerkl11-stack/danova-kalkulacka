import { useEffect, useRef } from "react";
import { SOURCE_LABELS, type Decision, type NetRequest } from "../net/net";

export function PermissionDialog({ req, onDecide }: { req: NetRequest; onDecide: (d: Decision) => void }) {
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecide("deny");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecide]);

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="perm-title">
        <h2 id="perm-title">Povoliť prístup na internet?</h2>
        <dl className="kv">
          <dt>Zdroj</dt>
          <dd>{SOURCE_LABELS[req.source]}</dd>
          <dt>Účel</dt>
          <dd>{req.purpose}</dd>
          <dt>Adresa</dt>
          <dd className="mono wrap">{req.url}</dd>
          <dt>Odošle sa</dt>
          <dd>{req.sends}</dd>
        </dl>
        <p className="note">Vaše výpočty ani iné údaje sa neodosielajú.</p>
        <div className="dialog-actions">
          <button type="button" ref={first} onClick={() => onDecide("once")}>Povoliť raz</button>
          <button type="button" onClick={() => onDecide("always")}>Vždy pre tento zdroj</button>
          <button type="button" className="ghost" onClick={() => onDecide("deny")}>Zamietnuť</button>
        </div>
      </div>
    </div>
  );
}
