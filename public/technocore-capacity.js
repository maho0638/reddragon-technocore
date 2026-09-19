const rdCapacity = {
  rooms: null,
  config: null,
  lastUpdated: null,
  error: ""
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

function rdFmt(value) {
  const n = rdNum(value);
  return n == null ? "—" : new Intl.NumberFormat("en-US").format(n);
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

function rdRenderCapacity() {
  const rooms = rdCapacity.rooms || {};
  const config = rdCapacity.config || {};
  const notes = rooms.notes || {};
  const engagement = rooms.engagement || {};

  const listed = rdNum(rooms.total);
  const roomCap = rdNum(rooms.capacity ?? config.max_rooms ?? config.rooms?.capacity ?? config.MAX_ROOMS);
  const noteTotal = rdNum(notes.total);
  const noteCap = rdNum(notes.capacity ?? config.max_notes_total ?? config.notes?.capacity ?? config.MAX_NOTES_TOTAL);
  const windowedMessages = rdNum(engagement.windowed_messages);

  rdSet("rdTcRooms", listed == null ? "—" : rdFmt(listed));
  rdSet("rdTcRoomCap", roomCap == null ? "cap —" : `cap ${rdFmt(roomCap)} · listed occupancy ${rdPct(listed, roomCap)}`);
  rdSet("rdTcNotes", noteTotal == null ? "—" : rdFmt(noteTotal));
  rdSet("rdTcNoteCap", noteCap == null ? "cap —" : `cap ${rdFmt(noteCap)} · ${rdPct(noteTotal, noteCap)}`);
  rdSet("rdTcWindow", windowedMessages == null ? "—" : rdFmt(windowedMessages));
  rdSet("rdTcUpdated", rdCapacity.lastUpdated ? new Date(rdCapacity.lastUpdated).toLocaleString() : "—");

  const status = document.getElementById("rdTcStatus");
  if (status) {
    status.textContent = rdCapacity.error
      ? `Live read degraded: ${rdCapacity.error}`
      : "Live read OK · public Technocore metadata only";
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
    rdCapacity.error = "";
    rdCapacity.lastUpdated = Date.now();
  } catch (error) {
    rdCapacity.error = String(error?.message || error || "read failed");
    rdCapacity.lastUpdated = Date.now();
  }
  rdRenderCapacity();
}

document.addEventListener("DOMContentLoaded", () => {
  rdRenderCapacity();
  rdRefreshCapacity();
  setInterval(rdRefreshCapacity, 60_000);
});
