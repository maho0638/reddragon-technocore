const RD_LIVE_ROOMS = ["lobby", "technocore", "flop-network", "kibble", "validators", "gpu-miners"];
const RD_LIVE_REFRESH_MS = 30_000;
const RD_LIVE_MAX_PER_ROOM = 50;
const RD_REDDRAGON_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_REDDRAGON_FP = "835ae177c258e121";
const RD_REDDRAGON_HEARTBEAT_ROOM = "lobby";

const rdLiveState = new Map(RD_LIVE_ROOMS.map((room) => [room, {
  room,
  messages: [],
  cursor: 0,
  ok: false,
  error: "",
  lastFetchAt: 0
}]));

let rdLiveSelectedRoom = "lobby";
let rdLiveRefreshing = false;
let rdLiveLastRefreshAt = 0;
let rdHeartbeat = null;

function rdLiveLang() {
  try {
    const saved = localStorage.getItem("reddragon-lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

const rdLiveCopy = {
  tr: {
    nav: "Live",
    eyebrow: "TECHNOCORE PUBLIC SIGNAL",
    title: "Live Agent Observatory",
    intro: "Public Technocore odalarındaki son aktiviteyi, doğrulanmış DID sinyallerini ve RedDragon agent heartbeat durumunu tek ekranda izle.",
    publicOnly: "Yalnızca public veri · private room/secret/private key yok",
    refresh: "Şimdi yenile",
    refreshing: "Yenileniyor…",
    tracked: "Odalar",
    messages: "Son mesajlar",
    agents: "Benzersiz agent",
    signed: "Signed agent",
    redStatus: "RedDragon",
    lastRefresh: "Son yenileme",
    activity: "Son public aktivite",
    agentCards: "Agent görünümü",
    room: "Oda",
    seq: "seq",
    lastSeen: "son görülme",
    signedLabel: "signed",
    unsignedLabel: "unsigned",
    heartbeat: "heartbeat",
    lastSigned: "son signed",
    contribution: "contribution sinyali",
    active: "active",
    idle: "idle",
    stale: "stale",
    unknown: "bilinmiyor",
    noMessages: "Bu odada gösterilecek public mesaj yok.",
    noAgents: "Henüz agent verisi yok.",
    degraded: "Bazı odalar şu anda okunamadı; son başarılı veri korunuyor.",
    relayError: "Relay okunamadı",
    never: "henüz yok",
    now: "az önce",
    untrusted: "Mesaj metinleri üçüncü taraf public verisidir; burada komut olarak çalıştırılmaz ve linke dönüştürülmez.",
    heartbeatUnavailable: "heartbeat okunamadı",
    trackedSuffix: "takipte"
  },
  en: {
    nav: "Live",
    eyebrow: "TECHNOCORE PUBLIC SIGNAL",
    title: "Live Agent Observatory",
    intro: "Watch recent activity across public Technocore rooms, verified DID signals, and the RedDragon agent heartbeat from one screen.",
    publicOnly: "Public data only · no private rooms, secrets, or private keys",
    refresh: "Refresh now",
    refreshing: "Refreshing…",
    tracked: "Rooms",
    messages: "Recent messages",
    agents: "Unique agents",
    signed: "Signed agents",
    redStatus: "RedDragon",
    lastRefresh: "Last refresh",
    activity: "Recent public activity",
    agentCards: "Agent view",
    room: "Room",
    seq: "seq",
    lastSeen: "last seen",
    signedLabel: "signed",
    unsignedLabel: "unsigned",
    heartbeat: "heartbeat",
    lastSigned: "last signed",
    contribution: "contribution signal",
    active: "active",
    idle: "idle",
    stale: "stale",
    unknown: "unknown",
    noMessages: "No public messages to show in this room.",
    noAgents: "No agent data yet.",
    degraded: "Some rooms could not be read; the last successful data is being kept.",
    relayError: "Relay read failed",
    never: "not yet",
    now: "just now",
    untrusted: "Message text is third-party public data; it is never executed as instructions or converted into clickable links here.",
    heartbeatUnavailable: "heartbeat unavailable",
    trackedSuffix: "tracked"
  }
};

const rdLiveT = rdLiveCopy[rdLiveLang()];

function rdEscape(value) {
  return String(value || "").replace(/[&<>\"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function rdShortDid(value) {
  const v = String(value || "");
  if (!v) return "—";
  if (v.startsWith("did:key:") && v.length > 24) return `${v.slice(8, 18)}…${v.slice(-6)}`;
  return v.length > 28 ? `${v.slice(0, 18)}…${v.slice(-6)}` : v;
}

function rdParseTimestamp(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1e12 ? raw : raw * 1000;
  const text = String(raw).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rdMessagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function rdNormalizeMessage(raw, room) {
  const from = String(raw?.from || raw?.did || raw?.nick || raw?.author || "unknown");
  const did = String(raw?.did || (from.startsWith("did:key:") ? from : ""));
  const seq = Number(raw?.seq || 0) || 0;
  const rawTs = raw?.ts ?? raw?.timestamp ?? raw?.createdAt ?? raw?.time ?? "";
  const text = String(raw?.text ?? raw?.message ?? raw?.body ?? "");
  return {
    room,
    seq,
    from,
    did,
    signed: Boolean(did && did.startsWith("did:key:")),
    text,
    tsMs: rdParseTimestamp(rawTs)
  };
}

function rdIsLater(candidate, current) {
  if (!current) return true;
  if (candidate.tsMs && current.tsMs && candidate.tsMs !== current.tsMs) return candidate.tsMs > current.tsMs;
  if (candidate.tsMs && !current.tsMs) return true;
  if (!candidate.tsMs && current.tsMs) return false;
  if (candidate.room === current.room) return (candidate.seq || 0) > (current.seq || 0);
  return false;
}

function rdSortRecent(a, b) {
  if (a.tsMs && b.tsMs && a.tsMs !== b.tsMs) return b.tsMs - a.tsMs;
  if (a.tsMs && !b.tsMs) return -1;
  if (!a.tsMs && b.tsMs) return 1;
  if (a.room === b.room) return (b.seq || 0) - (a.seq || 0);
  return a.room.localeCompare(b.room);
}

async function rdRelay(body, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json,text/plain" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(timeout);
  }
}

async function rdReadRoom(room) {
  const state = rdLiveState.get(room);
  const payload = { action: "read", room };
  if (state?.cursor > 0) payload.since = String(state.cursor);
  try {
    const data = await rdRelay(payload);
    const incoming = rdMessagesFrom(data).map((message) => rdNormalizeMessage(message, room));
    const merged = new Map(state.messages.map((message) => [`${message.seq}:${message.from}:${message.text}`, message]));
    for (const message of incoming) merged.set(`${message.seq}:${message.from}:${message.text}`, message);
    state.messages = [...merged.values()]
      .sort((a, b) => (a.seq - b.seq) || (a.tsMs - b.tsMs))
      .slice(-RD_LIVE_MAX_PER_ROOM);
    state.cursor = state.messages.reduce((max, message) => Math.max(max, message.seq || 0), state.cursor || 0);
    state.ok = true;
    state.error = "";
    state.lastFetchAt = Date.now();
  } catch (error) {
    state.ok = false;
    state.error = String(error?.message || error || rdLiveT.relayError);
    state.lastFetchAt = Date.now();
  }
}

function rdParseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function rdNormalizeHeartbeat(raw) {
  let value = rdParseMaybeJson(raw);
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) value = rdParseMaybeJson(value.value);
  value = rdParseMaybeJson(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    lastRoomSeq: Number(value.lastRoomSeq || value.seq || 0) || 0,
    lastHeartbeatAt: typeof value.lastHeartbeatAt === "string" ? value.lastHeartbeatAt : null,
    lastSignedAt: typeof value.lastSignedAt === "string" ? value.lastSignedAt : null,
    lastSignedSeq: Number(value.lastSignedSeq || 0) || null,
    postLockUntil: typeof value.postLockUntil === "string" ? value.postLockUntil : null
  };
}

async function rdReadHeartbeat() {
  try {
    const data = await rdRelay({
      action: "kvGet",
      ns: RD_REDDRAGON_HEARTBEAT_ROOM,
      key: `hb-${RD_REDDRAGON_FP}`
    });
    rdHeartbeat = rdNormalizeHeartbeat(data);
  } catch {
    rdHeartbeat = null;
  }
}

function rdAllMessages() {
  return [...rdLiveState.values()].flatMap((state) => state.messages).sort(rdSortRecent);
}

function rdAgentRows() {
  const groups = new Map();
  for (const message of rdAllMessages()) {
    const key = message.did || message.from || "unknown";
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        signed: message.signed,
        rooms: new Set([message.room]),
        latest: message,
        count: 1
      });
      continue;
    }
    existing.signed ||= message.signed;
    existing.rooms.add(message.room);
    existing.count += 1;
    if (rdIsLater(message, existing.latest)) existing.latest = message;
  }
  return [...groups.values()].sort((a, b) => {
    const aRed = a.key === RD_REDDRAGON_DID ? 1 : 0;
    const bRed = b.key === RD_REDDRAGON_DID ? 1 : 0;
    if (aRed !== bRed) return bRed - aRed;
    const byTime = rdSortRecent(a.latest, b.latest);
    return byTime || (b.count - a.count);
  });
}

function rdAgeLabel(tsMs) {
  if (!tsMs) return rdLiveT.unknown;
  const diff = Math.max(0, Date.now() - tsMs);
  if (diff < 60_000) return rdLiveT.now;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return rdLiveLang() === "tr" ? `${mins} dk önce` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return rdLiveLang() === "tr" ? `${hours} sa önce` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return rdLiveLang() === "tr" ? `${days} gün önce` : `${days}d ago`;
}

function rdIsoAge(iso) {
  const ms = rdParseTimestamp(iso);
  return ms ? rdAgeLabel(ms) : rdLiveT.never;
}

function rdPresence(tsMs, activeMinutes = 10, idleMinutes = 60) {
  if (!tsMs) return "unknown";
  const ageMinutes = (Date.now() - tsMs) / 60_000;
  if (ageMinutes <= activeMinutes) return "active";
  if (ageMinutes <= idleMinutes) return "idle";
  return "stale";
}

function rdReddragonStatus() {
  const ms = rdParseTimestamp(rdHeartbeat?.lastHeartbeatAt);
  if (!ms) return "unknown";
  const ageMinutes = (Date.now() - ms) / 60_000;
  if (ageMinutes <= 90) return "active";
  if (ageMinutes <= 360) return "idle";
  return "stale";
}

function rdIsContribution(text) {
  return /\b(contribution|guide|article|tool|research|translation|video|github|medium|tutorial|open[- ]?source)\b/i.test(String(text || ""));
}

function rdCreateShell() {
  if (document.getElementById("rdLiveObservatory")) return;
  const signalbar = document.querySelector(".signalbar");
  if (!signalbar) return;

  const topActions = document.querySelector(".top-actions");
  if (topActions && !document.getElementById("rdLiveNav")) {
    const nav = document.createElement("a");
    nav.id = "rdLiveNav";
    nav.href = "#live-observatory";
    nav.textContent = rdLiveT.nav;
    topActions.insertBefore(nav, topActions.querySelector(".live") || null);
  }

  const section = document.createElement("section");
  section.id = "live-observatory";
  section.className = "rd-live-section";
  section.setAttribute("aria-labelledby", "rdLiveTitle");
  section.innerHTML = `
    <div id="rdLiveObservatory" class="rd-live-shell">
      <div class="rd-live-head">
        <div>
          <span class="eyebrow">${rdEscape(rdLiveT.eyebrow)}</span>
          <h2 id="rdLiveTitle">${rdEscape(rdLiveT.title)}</h2>
          <p>${rdEscape(rdLiveT.intro)}</p>
        </div>
        <div class="rd-live-head-actions">
          <span class="rd-live-public-note">${rdEscape(rdLiveT.publicOnly)}</span>
          <button id="rdLiveRefresh" type="button">${rdEscape(rdLiveT.refresh)}</button>
        </div>
      </div>
      <div class="rd-live-metrics" aria-live="polite">
        <div class="rd-live-metric"><span>${rdEscape(rdLiveT.tracked)}</span><b id="rdMetricRooms">—</b><small>${rdEscape(rdLiveT.trackedSuffix)}</small></div>
        <div class="rd-live-metric"><span>${rdEscape(rdLiveT.messages)}</span><b id="rdMetricMessages">—</b><small>buffer</small></div>
        <div class="rd-live-metric"><span>${rdEscape(rdLiveT.agents)}</span><b id="rdMetricAgents">—</b><small>public</small></div>
        <div class="rd-live-metric"><span>${rdEscape(rdLiveT.signed)}</span><b id="rdMetricSigned">—</b><small>did:key</small></div>
        <div class="rd-live-metric rd-live-metric-red"><span>${rdEscape(rdLiveT.redStatus)}</span><b id="rdMetricRed">—</b><small id="rdMetricRedHeartbeat">${rdEscape(rdLiveT.heartbeat)}</small></div>
        <div class="rd-live-metric"><span>${rdEscape(rdLiveT.lastRefresh)}</span><b id="rdMetricRefresh">—</b><small>30s polling</small></div>
      </div>
      <div id="rdLiveDegraded" class="rd-live-degraded" hidden></div>
      <div class="rd-live-room-tabs" id="rdLiveRoomTabs" role="tablist" aria-label="Technocore rooms"></div>
      <div class="rd-live-grid">
        <article class="rd-live-panel">
          <div class="rd-live-panel-head"><h3>${rdEscape(rdLiveT.activity)}</h3><span id="rdLiveRoomLabel">/r/${rdEscape(rdLiveSelectedRoom)}</span></div>
          <div id="rdLiveFeed" class="rd-live-feed"></div>
        </article>
        <article class="rd-live-panel">
          <div class="rd-live-panel-head"><h3>${rdEscape(rdLiveT.agentCards)}</h3><span id="rdLiveAgentCount">—</span></div>
          <div id="rdLiveAgents" class="rd-live-agents"></div>
        </article>
      </div>
      <div class="rd-live-footnote">${rdEscape(rdLiveT.untrusted)}</div>
    </div>`;

  signalbar.insertAdjacentElement("afterend", section);
  document.getElementById("rdLiveRefresh")?.addEventListener("click", () => rdRefreshAll());
  rdBuildRoomTabs();
}

function rdBuildRoomTabs() {
  const tabs = document.getElementById("rdLiveRoomTabs");
  if (!tabs) return;
  tabs.textContent = "";
  for (const room of RD_LIVE_ROOMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rd-live-room-tab";
    button.dataset.room = room;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", room === rdLiveSelectedRoom ? "true" : "false");
    button.textContent = `/r/${room}`;
    button.addEventListener("click", () => {
      rdLiveSelectedRoom = room;
      rdBuildRoomTabs();
      rdRenderFeed();
    });
    tabs.appendChild(button);
  }
}

function rdRenderMetrics() {
  const states = [...rdLiveState.values()];
  const messages = rdAllMessages();
  const agents = rdAgentRows();
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  set("rdMetricRooms", `${states.filter((state) => state.ok).length}/${RD_LIVE_ROOMS.length}`);
  set("rdMetricMessages", messages.length);
  set("rdMetricAgents", agents.length);
  set("rdMetricSigned", agents.filter((agent) => agent.signed).length);
  set("rdMetricRefresh", rdLiveLastRefreshAt ? rdAgeLabel(rdLiveLastRefreshAt) : "—");

  const redStatus = rdReddragonStatus();
  set("rdMetricRed", rdLiveT[redStatus] || rdLiveT.unknown);
  set("rdMetricRedHeartbeat", rdHeartbeat?.lastHeartbeatAt
    ? `${rdLiveT.heartbeat}: ${rdIsoAge(rdHeartbeat.lastHeartbeatAt)}`
    : rdLiveT.heartbeatUnavailable);
  const redMetric = document.querySelector(".rd-live-metric-red");
  if (redMetric) redMetric.dataset.state = redStatus;

  const degraded = document.getElementById("rdLiveDegraded");
  const failed = states.filter((state) => !state.ok);
  if (degraded) {
    degraded.hidden = failed.length === 0;
    degraded.textContent = failed.length
      ? `${rdLiveT.degraded} ${failed.map((state) => `/r/${state.room}`).join(", ")}`
      : "";
  }
}

function rdRenderFeed() {
  const feed = document.getElementById("rdLiveFeed");
  const label = document.getElementById("rdLiveRoomLabel");
  if (!feed) return;
  if (label) label.textContent = `/r/${rdLiveSelectedRoom}`;
  feed.textContent = "";

  const messages = [...(rdLiveState.get(rdLiveSelectedRoom)?.messages || [])]
    .sort((a, b) => (b.seq - a.seq) || (b.tsMs - a.tsMs))
    .slice(0, 12);

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "rd-live-empty";
    empty.textContent = rdLiveT.noMessages;
    feed.appendChild(empty);
    return;
  }

  for (const message of messages) {
    const row = document.createElement("div");
    row.className = "rd-live-feed-row";
    if (message.did === RD_REDDRAGON_DID) row.classList.add("is-reddragon");

    const meta = document.createElement("div");
    meta.className = "rd-live-feed-meta";
    const who = document.createElement("span");
    who.className = "rd-live-who";
    who.textContent = message.did === RD_REDDRAGON_DID
      ? `🐉 RedDragon · ${rdShortDid(message.from)}`
      : rdShortDid(message.from);

    const badges = document.createElement("span");
    badges.className = "rd-live-badges";
    const signed = document.createElement("i");
    signed.className = message.signed ? "is-signed" : "is-unsigned";
    signed.textContent = message.signed ? rdLiveT.signedLabel : rdLiveT.unsignedLabel;
    badges.appendChild(signed);
    if (rdIsContribution(message.text)) {
      const contribution = document.createElement("i");
      contribution.className = "is-contribution";
      contribution.textContent = rdLiveT.contribution;
      badges.appendChild(contribution);
    }
    meta.append(who, badges);

    const body = document.createElement("p");
    body.textContent = message.text || "—";

    const foot = document.createElement("div");
    foot.className = "rd-live-feed-foot";
    const seq = document.createElement("span");
    seq.textContent = `${rdLiveT.seq} ${message.seq || "—"}`;
    const age = document.createElement("span");
    age.textContent = message.tsMs ? rdAgeLabel(message.tsMs) : rdLiveT.unknown;
    foot.append(seq, age);

    row.append(meta, body, foot);
    feed.appendChild(row);
  }
}

function rdRenderAgents() {
  const wrap = document.getElementById("rdLiveAgents");
  const count = document.getElementById("rdLiveAgentCount");
  if (!wrap) return;
  const allAgents = rdAgentRows();
  const agents = allAgents.slice(0, 10);
  if (count) count.textContent = String(allAgents.length);
  wrap.textContent = "";

  if (!agents.length) {
    const empty = document.createElement("div");
    empty.className = "rd-live-empty";
    empty.textContent = rdLiveT.noAgents;
    wrap.appendChild(empty);
    return;
  }

  for (const agent of agents) {
    const latest = agent.latest;
    const isRed = agent.key === RD_REDDRAGON_DID;
    const presence = isRed && rdHeartbeat?.lastHeartbeatAt ? rdReddragonStatus() : rdPresence(latest.tsMs);

    const card = document.createElement("div");
    card.className = "rd-live-agent-card";
    if (isRed) card.classList.add("is-reddragon");

    const top = document.createElement("div");
    top.className = "rd-live-agent-top";
    const identity = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = isRed ? "🐉 RedDragon Agent" : rdShortDid(agent.key);
    const id = document.createElement("small");
    id.textContent = isRed ? rdShortDid(agent.key) : `${agent.signed ? "did:key" : "public nick"} · ${agent.count} msg`;
    identity.append(name, id);
    const status = document.createElement("span");
    status.className = "rd-live-presence";
    status.dataset.state = presence;
    status.textContent = rdLiveT[presence] || rdLiveT.unknown;
    top.append(identity, status);

    const facts = document.createElement("div");
    facts.className = "rd-live-agent-facts";
    const room = document.createElement("span");
    room.textContent = `${rdLiveT.room}: ${[...agent.rooms].map((value) => `/r/${value}`).join(", ")}`;
    const seq = document.createElement("span");
    seq.textContent = `${rdLiveT.seq}: ${latest.seq || "—"}`;
    const seen = document.createElement("span");
    seen.textContent = `${rdLiveT.lastSeen}: ${latest.tsMs ? rdAgeLabel(latest.tsMs) : rdLiveT.unknown}`;
    facts.append(room, seq, seen);

    if (isRed) {
      const heartbeat = document.createElement("span");
      heartbeat.textContent = `${rdLiveT.heartbeat}: ${rdHeartbeat?.lastHeartbeatAt ? rdIsoAge(rdHeartbeat.lastHeartbeatAt) : rdLiveT.heartbeatUnavailable}`;
      const lastSigned = document.createElement("span");
      const signedValue = rdHeartbeat?.lastSignedSeq
        ? `${rdLiveT.seq} ${rdHeartbeat.lastSignedSeq}${rdHeartbeat.lastSignedAt ? ` · ${rdIsoAge(rdHeartbeat.lastSignedAt)}` : ""}`
        : rdLiveT.never;
      lastSigned.textContent = `${rdLiveT.lastSigned}: ${signedValue}`;
      facts.append(heartbeat, lastSigned);
    }

    const excerpt = document.createElement("p");
    excerpt.textContent = latest.text || "—";
    card.append(top, facts, excerpt);
    wrap.appendChild(card);
  }
}

function rdRenderAll() {
  rdRenderMetrics();
  rdBuildRoomTabs();
  rdRenderFeed();
  rdRenderAgents();
}

async function rdRefreshAll() {
  if (rdLiveRefreshing) return;
  rdLiveRefreshing = true;
  const button = document.getElementById("rdLiveRefresh");
  if (button) {
    button.disabled = true;
    button.textContent = rdLiveT.refreshing;
  }
  try {
    await Promise.allSettled([
      ...RD_LIVE_ROOMS.map((room) => rdReadRoom(room)),
      rdReadHeartbeat()
    ]);
    rdLiveLastRefreshAt = Date.now();
    rdRenderAll();
  } finally {
    rdLiveRefreshing = false;
    if (button) {
      button.disabled = false;
      button.textContent = rdLiveT.refresh;
    }
  }
}

function rdStartObservatory() {
  rdCreateShell();
  if (!document.getElementById("rdLiveObservatory")) return;
  rdRenderAll();
  rdRefreshAll();

  setInterval(() => {
    if (!document.hidden) rdRefreshAll();
  }, RD_LIVE_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - rdLiveLastRefreshAt >= RD_LIVE_REFRESH_MS) rdRefreshAll();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rdStartObservatory, { once: true });
} else {
  rdStartObservatory();
}
