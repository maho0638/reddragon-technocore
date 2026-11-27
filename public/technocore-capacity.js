const rdCapacity = {
  rooms: null,
  config: null,
  lastUpdated: null,
  error: null
};

async function rdCapacityRelay(action) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ action }),
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function rdNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rdCapacityLang() {
  try { return localStorage.getItem("reddragon-lang") === "tr" ? "tr" : "en"; } catch { return "en"; }
}

function rdFmt(value, lang = rdCapacityLang()) {
  const n = rdNum(value);
  return n == null ? "—" : new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-US").format(n);
}

function rdCapacityError(error, lang) {
  if (!error) return "";
  if (error.timeout) return lang === "tr" ? "İstek zaman aşımına uğradı." : "The request timed out.";
  if (error.status) return lang === "tr" ? `Canlı kaynak HTTP ${error.status} yanıtı verdi.` : `The live source returned HTTP ${error.status}.`;
  return lang === "tr" ? "Canlı Technocore verisi alınamadı." : "Could not load live Technocore data.";
}

function rdPct(num, den) {
  const a = rdNum(num), b = rdNum(den);
  if (a == null || b == null || b <= 0) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

function rdSet(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function rdRenderCapacity(locale = rdCapacityLang()) {
  const lang = locale === "tr" ? "tr" : "en";
  const tr = lang === "tr";
  const rooms = rdCapacity.rooms || {};
  const config = rdCapacity.config || {};
  const notes = rooms.notes || {};
  const engagement = rooms.engagement || {};

  const listed = rdNum(rooms.total);
  const roomCap = rdNum(rooms.capacity ?? config.max_rooms ?? config.rooms?.capacity ?? config.MAX_ROOMS);
  const noteTotal = rdNum(notes.total);
  const noteCap = rdNum(notes.capacity ?? config.max_notes_total ?? config.notes?.capacity ?? config.MAX_NOTES_TOTAL);
  const windowedMessages = rdNum(engagement.windowed_messages);

  rdSet("rdTcRooms", listed == null ? "—" : rdFmt(listed, lang));
  rdSet("rdTcRoomCap", roomCap == null ? (tr ? "sınır —" : "cap —") : `${tr ? "sınır" : "cap"} ${rdFmt(roomCap, lang)} · ${tr ? "listelenen doluluk" : "listed occupancy"} ${rdPct(listed, roomCap)}`);
  rdSet("rdTcNotes", noteTotal == null ? "—" : rdFmt(noteTotal, lang));
  rdSet("rdTcNoteCap", noteCap == null ? (tr ? "sınır —" : "cap —") : `${tr ? "sınır" : "cap"} ${rdFmt(noteCap, lang)} · ${rdPct(noteTotal, noteCap)}`);
  rdSet("rdTcWindow", windowedMessages == null ? "—" : rdFmt(windowedMessages, lang));
  rdSet("rdTcUpdated", rdCapacity.lastUpdated ? new Date(rdCapacity.lastUpdated).toLocaleString(tr ? "tr-TR" : "en-US") : "—");

  const status = document.getElementById("rdTcStatus");
  if (status) {
    status.textContent = rdCapacity.error
      ? `${tr ? "Canlı okuma aksadı" : "Live read degraded"}: ${rdCapacityError(rdCapacity.error, lang)}`
      : (tr ? "Canlı okuma tamam · yalnızca herkese açık Technocore üst verileri" : "Live read OK · public Technocore metadata only");
    status.className = rdCapacity.error ? "notice" : "notice";
  }
}

async function rdRefreshCapacity() {
  try {
    const [rooms, config] = await Promise.all([
      rdCapacityRelay("rooms"),
      rdCapacityRelay("config")
    ]);
    rdCapacity.rooms = rooms;
    rdCapacity.config = config;
    rdCapacity.error = null;
    rdCapacity.lastUpdated = Date.now();
  } catch (error) {
    const status = Number(String(error?.message || "").match(/\bHTTP (\d{3})\b/)?.[1]);
    rdCapacity.error = { status: Number.isFinite(status) && status > 0 ? status : 0, timeout: error?.name === "AbortError" || error?.name === "TimeoutError" };
    rdCapacity.lastUpdated = Date.now();
  }
  rdRenderCapacity();
}

document.addEventListener("DOMContentLoaded", () => {
  rdRenderCapacity();
  rdRefreshCapacity();
  setInterval(rdRefreshCapacity, 60_000);
});
window.addEventListener("rd:languagechange", (event) => rdRenderCapacity(event.detail?.lang));
