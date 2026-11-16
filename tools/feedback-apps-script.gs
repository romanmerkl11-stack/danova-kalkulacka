/**
 * Sprostredkovateľ spätnej väzby: prijme hlásenie z Daňovej kalkulačky a vytvorí issue
 * v súkromnom repozitári. GitHub token je LEN tu (Vlastnosti skriptu → GITHUB_TOKEN),
 * nikdy nie v aplikácii. Návod na nasadenie: docs/SPATNA-VAZBA.md
 *
 * Ochrana: obmedzená veľkosť, najviac MAX_PER_HOUR hlásení za hodinu, to isté ID hlásenia
 * (opakované odoslanie) nevytvorí druhé issue.
 */
var REPO = "romanmerkl11-stack/privat-vecicky";
var LABEL = "danova-kalkulacka";
var MAX_PER_HOUR = 20;
var MAX_BODY = 20000;
var KINDS = { problem: "Problém", vypocet: "Výpočet", ovladanie: "Ovládanie", data: "Dáta", navrh: "Návrh", ine: "Iné" };

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var id = String(req.id || "");
    var title = String(req.title || "").slice(0, 200);
    var body = String(req.body || "");
    var kind = KINDS[req.kind] ? req.kind : "ine";
    if (!/^DK-[0-9A-F]{8}$/.test(id)) return reply({ ok: false, error: "Neplatné ID hlásenia." });
    if (!title.trim() || !body.trim()) return reply({ ok: false, error: "Hlásenie je prázdne." });
    if (body.length > MAX_BODY) return reply({ ok: false, error: "Hlásenie je príliš dlhé." });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var props = PropertiesService.getScriptProperties();
      // opakované odoslanie toho istého hlásenia → vráť existujúce issue
      var existing = props.getProperty("id:" + id);
      if (existing) return reply({ ok: true, number: Number(existing), duplicate: true });

      var cache = CacheService.getScriptCache();
      var count = Number(cache.get("count") || 0);
      if (count >= MAX_PER_HOUR) return reply({ ok: false, error: "Príliš veľa hlásení naraz. Skúste to neskôr." });

      var res = createIssue(props, { title: title, body: body, labels: [LABEL, KINDS[kind]] });
      // štítky sa nepodarilo nastaviť → aspoň issue bez nich
      if (res.getResponseCode() === 422) res = createIssue(props, { title: title, body: body });
      if (res.getResponseCode() !== 201) {
        console.error("GitHub " + res.getResponseCode() + ": " + res.getContentText().slice(0, 300));
        return reply({ ok: false, error: "Hlásenie sa nepodarilo uložiť (GitHub " + res.getResponseCode() + ")." });
      }
      var number = JSON.parse(res.getContentText()).number;
      props.setProperty("id:" + id, String(number));
      cache.put("count", String(count + 1), 3600);
      return reply({ ok: true, number: number });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return reply({ ok: false, error: "Chyba na serveri." });
  }
}

function createIssue(props, issue) {
  return UrlFetchApp.fetch("https://api.github.com/repos/" + REPO + "/issues", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + props.getProperty("GITHUB_TOKEN"),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    payload: JSON.stringify(issue),
    muteHttpExceptions: true,
  });
}

/** Kontrola v prehliadači: otvorenie adresy ukáže „ok“. */
function doGet() {
  return reply({ ok: true, service: "danova-kalkulacka-feedback" });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
