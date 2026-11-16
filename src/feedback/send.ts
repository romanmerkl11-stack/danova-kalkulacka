// Priame odoslanie hlásenia sprostredkovateľovi (Google Apps Script → issue v súkromnom repe).
// Ide cez sieťovú vrstvu: rešpektuje offline režim, pýta sa na súhlas a zapíše sa do logu.
import { netFetch } from "../net/net";
import { FEEDBACK_ENDPOINT, sendPayload, type FeedbackContext, type FeedbackDraft, type SendResult } from "./report";

export const canSendDirectly = () => FEEDBACK_ENDPOINT !== "";

export async function sendFeedback(d: FeedbackDraft, c: FeedbackContext, endpoint = FEEDBACK_ENDPOINT): Promise<SendResult> {
  const res = await netFetch(
    {
      source: "feedback",
      purpose: "Odoslať hlásenie autorovi aplikácie (uloží sa do jeho súkromného zoznamu podnetov)",
      url: endpoint,
      sends: "text hlásenia presne tak, ako je v náhľade",
    },
    // text/plain = bez CORS predletovej požiadavky (Apps Script ju nepodporuje)
    { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(sendPayload(d, c)) },
  );
  if (!res.ok) return { ok: false, error: `Server odpovedal ${res.status}.` };
  let j: { ok?: boolean; number?: number; error?: string };
  try {
    j = await res.json();
  } catch {
    return { ok: false, error: "Server vrátil neplatnú odpoveď." };
  }
  // úspech len keď server potvrdí uloženie (číslo záznamu)
  return j?.ok && typeof j.number === "number" ? { ok: true, number: j.number } : { ok: false, error: j?.error ?? "Neznáma chyba servera." };
}
