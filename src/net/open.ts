// Otvorenie odkazu v predvolenom prehliadači (desktop cez Tauri opener, web cez nové okno).
import { isTauri } from "../store/storage";

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
