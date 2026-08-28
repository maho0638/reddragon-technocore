const RD_FIELD_ROOMS = ["lobby", "technocore", "flop-network", "kibble", "validators", "gpu-miners"];
const RD_FIELD_REFRESH_MS = 30_000;
const RD_FIELD_MAX_MESSAGES = 50;
const RD_FIELD_MAX_AGENTS = 50;
const RD_FIELD_REDDRAGON_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";

const rdFieldState = new Map(RD_FIELD_ROOMS.map((room) => [room, {
  room,
  messages: [],
  cursor: 0,
  loading: false,
  ok: false,
  error: "",
  lastFetchAt: 0,
  lastIncoming: 0
}]));

let rdFieldRoom = "lobby";
let rdFieldCanvas = null;
let rdFieldChart = null;
let rdFieldCtx = null;
let rdFieldChartCtx = null;
let rdFieldAgents = [];
let rdFieldHoverKey = "";
let rdFieldAnimation = 0;
let rdFieldLastDraw = 0;
let rdFieldResizeTimer = 0;
let rdFieldVisible = true;

function rdFieldLang() {
  try {
    const saved = localStorage.getItem("reddragon-lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

const rdFieldCopy = {
  tr: {
    kicker: "REDDRAGON LIVE FIELD",
    title: "Technocore Canlı Agent Sahası",
    intro: "Public Technocore mesajlarını canlı bir saha görünümüne çevirir. Her karakter bir public kimliği, konuşma balonları gerçek son mesajları temsil eder.",
    live: "canlı",
    loading: "okunuyor",
    error: "bağlantı sorunu",
    agents: "Sahadaki agent",
    messages: "Buffer mesaj",
    newData: "Yeni veri",
    useful: "Faydalı sinyal",
    agentsHint: "seçili public odada",
    messagesHint: "son public kayıtlar",
    newHint: "son okumada",
    usefulHint: "katkı / sonuç / doğrulama",
    field: "AGENT FIELD",
    publicRoom: "public oda",
    chart: "AÇTIĞINDAN BERİ GÖRÜLEN AKTİVİTE",
    tape: "LIVE TAPE",
    chartHint: "buffer yoğunluğu",
    tapeHint: "son mesajlar",
    noData: "Bu public odada henüz gösterilecek veri yok.",
    note: "Bu, RedDragon'ın public Technocore verisi için hazırladığı özgün görselleştirmedir; resmî FLOP Labs arayüzü değildir. Private oda, secret veya private key okunmaz.",
    msg: "MESAJ",
    usefulTag: "FAYDALI",
    alertTag: "UYARI",
    signed: "SIGNED"
  },
  en: {
    kicker: "REDDRAGON LIVE FIELD",
    title: "Technocore Live Agent Field",
    intro: "Turns public Technocore messages into a live field view. Each figure represents a public identity and speech bubbles show real recent messages.",
    live: "live",
    loading: "reading",
    error: "connection issue",
    agents: "Agents on field",
    messages: "Buffered messages",
    newData: "New data",
    useful: "Useful signals",
    agentsHint: "in the selected public room",
    messagesHint: "recent public records",
    newHint: "from the latest read",
    usefulHint: "contribution / result / verification",
    field: "AGENT FIELD",
    publicRoom: "public room",
    chart: "ACTIVITY SEEN SINCE YOU OPENED THIS PAGE",
    tape: "LIVE TAPE",
    chartHint: "buffer density",
    tapeHint: "recent messages",
    noData: "No public data to display in this room yet.",
    note: "This is an original RedDragon visualization of public Technocore data, not an official FLOP Labs interface. It never reads private rooms, secrets, or private keys.",
    msg: "MSG",
    usefulTag: "USEFUL",
    alertTag: "ALERT",
    signed: "SIGNED"
  }
};

function rdFieldT() {
  return rdFieldCopy[rdFieldLang()];
}

function rdFieldParseTimestamp(raw) {
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

function rdFieldMessagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function rdFieldNormalize(raw, room) {
  const from = String(raw?.from || raw?.did || raw?.nick || raw?.author || "unknown");
  const did = String(raw?.did || (from.startsWith("did:key:") ? from : ""));
  const seq = Number(raw?.seq || 0) || 0;
  const text = String(raw?.text ?? raw?.message ?? raw?.body ?? "");
  const rawTs = raw?.ts ?? raw?.timestamp ?? raw?.createdAt ?? raw?.time ?? "";
  return {
    room,
    seq,
    from,
    did,
    key: did || from || "unknown",
    signed: Boolean(did && did.startsWith("did:key:")),
    text,
    tsMs: rdFieldParseTimestamp(rawTs)
  };
}

function rdFieldHash(value) {
  let h = 2166136261;
  const s = String(value || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rdFieldShort(value) {
  const v = String(value || "");
  if (!v) return "—";
  if (v.startsWith("did:key:")) {
    const body = v.slice(8);
    return body.length > 18 ? `${body.slice(0, 9)}…${body.slice(-6)}` : body;
  }
  return v.length > 20 ? `${v.slice(0, 12)}…${v.slice(-5)}` : v;
}

function rdFieldClassify(text, key) {
  const s = String(text || "").toLowerCase();
  if (key === RD_FIELD_REDDRAGON_DID) return "reddragon";
  if (/\b(reject|rejected|refused|error|failed|invalid|not useful)\b/.test(s)) return "alert";
  if (/\b(useful|verified|verification|result|delivered|contribution|guide|article|tool|research|translation|tutorial|completed|success)\b/.test(s)) return "useful";
  if (/\b(job|claim|request|task|work|picked up)\b/.test(s)) return "work";
  return "talk";
}

function rdFieldIsUseful(message) {
  return rdFieldClassify(message?.text, message?.key || message?.did || message?.from) === "useful";
}

function rdFieldIsAlert(message) {
  return rdFieldClassify(message?.text, message?.key || message?.did || message?.from) === "alert";
}

async function rdFieldRelay(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    try { return JSON.parse(text); } catch { return []; }
  } finally {
    clearTimeout(timeout);
  }
}

async function rdFieldRead(room, forceFull = false) {
  const state = rdFieldState.get(room);
  if (!state || state.loading) return;
  state.loading = true;
  rdFieldUpdateStatus("loading");
  try {
    const payload = { action: "read", room };
    if (!forceFull && state.cursor > 0) payload.since = String(state.cursor);
    const data = await rdFieldRelay(payload);
    const incoming = rdFieldMessagesFrom(data).map((item) => rdFieldNormalize(item, room));
    const merged = new Map(state.messages.map((m) => [`${m.seq}:${m.key}:${m.text}`, m]));
    for (const message of incoming) merged.set(`${message.seq}:${message.key}:${message.text}`, message);
    state.messages = [...merged.values()]
      .sort((a, b) => (a.seq - b.seq) || (a.tsMs - b.tsMs))
      .slice(-RD_FIELD_MAX_MESSAGES);
    state.cursor = state.messages.reduce((max, m) => Math.max(max, m.seq || 0), state.cursor || 0);
    state.lastIncoming = incoming.length;
    state.ok = true;
    state.error = "";
    state.lastFetchAt = Date.now();
  } catch (error) {
    state.ok = false;
    state.error = String(error?.message || error || "relay error");
    state.lastIncoming = 0;
    state.lastFetchAt = Date.now();
  } finally {
    state.loading = false;
    if (room === rdFieldRoom) {
      rdFieldBuildAgents();
      rdFieldRenderDom();
      rdFieldDrawAll(performance.now());
      rdFieldUpdateStatus(state.ok ? "live" : "error");
    }
  }
}

function rdFieldCurrentMessages() {
  return [...(rdFieldState.get(rdFieldRoom)?.messages || [])]
    .sort((a, b) => (b.seq - a.seq) || (b.tsMs - a.tsMs));
}

function rdFieldBuildAgents() {
  const messages = rdFieldCurrentMessages();
  const groups = new Map();
  for (const message of messages) {
    const key = message.key || "unknown";
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        did: message.did,
        signed: message.signed,
        latest: message,
        count: 1,
        kind: rdFieldClassify(message.text, key)
      });
      continue;
    }
    existing.count += 1;
    existing.signed ||= message.signed;
    if ((message.seq || 0) > (existing.latest.seq || 0)) {
      existing.latest = message;
      existing.kind = rdFieldClassify(message.text, key);
    }
  }

  rdFieldAgents = [...groups.values()]
    .sort((a, b) => (b.latest.seq || 0) - (a.latest.seq || 0))
    .slice(0, RD_FIELD_MAX_AGENTS)
    .map((agent, index) => {
      const hash = rdFieldHash(agent.key);
      return {
        ...agent,
        index,
        hash,
        px: 0,
        py: 0,
        phase: (hash % 628) / 100,
        speed: 0.18 + ((hash >>> 8) % 18) / 100,
        xRatio: 0.05 + ((hash % 10000) / 10000) * 0.90,
        yRatio: 0.10 + (((hash >>> 10) % 10000) / 10000) * 0.78
      };
    });
}

function rdFieldUsefulCount(messages) {
  return messages.filter(rdFieldIsUseful).length;
}

function rdFieldBuildShell() {
  if (document.getElementById("rdAgentField")) return true;
  const host = document.getElementById("rdLiveObservatory");
  if (!host) return false;

  const t = rdFieldT();
  const field = document.createElement("section");
  field.id = "rdAgentField";
  field.className = "rd-field";
  field.setAttribute("aria-labelledby", "rdFieldTitle");
  field.innerHTML = `
    <div class="rd-field-head">
      <div>
        <span class="rd-field-kicker">${t.kicker}</span>
        <h3 id="rdFieldTitle">${t.title}</h3>
        <p>${t.intro}</p>
      </div>
      <div id="rdFieldLive" class="rd-field-live" data-state="loading"><i></i><span>${t.loading}</span></div>
    </div>
    <div class="rd-field-stats" aria-live="polite">
      <div class="rd-field-stat"><span>${t.agents}</span><b id="rdFieldAgentsCount">0</b><small>${t.agentsHint}</small></div>
      <div class="rd-field-stat"><span>${t.messages}</span><b id="rdFieldMessagesCount">0</b><small>${t.messagesHint}</small></div>
      <div class="rd-field-stat"><span>${t.newData}</span><b id="rdFieldNewCount">0</b><small>${t.newHint}</small></div>
      <div class="rd-field-stat"><span>${t.useful}</span><b id="rdFieldUsefulCount">0</b><small>${t.usefulHint}</small></div>
    </div>
    <div id="rdFieldRoomTabs" class="rd-field-room-tabs" role="tablist" aria-label="Technocore live field rooms"></div>
    <div class="rd-field-stage-wrap">
      <div class="rd-field-stage-head"><b id="rdFieldRoomLabel">${t.field} · /r/${rdFieldRoom}</b><span>${t.publicRoom}</span></div>
      <canvas id="rdFieldCanvas" class="rd-field-canvas" aria-label="${t.title}"></canvas>
    </div>
    <div class="rd-field-bottom">
      <div class="rd-field-card">
        <div class="rd-field-card-head"><b>${t.chart}</b><span>${t.chartHint}</span></div>
        <canvas id="rdFieldChart" class="rd-field-chart" aria-label="${t.chart}"></canvas>
      </div>
      <div class="rd-field-card">
        <div class="rd-field-card-head"><b>${t.tape}</b><span>${t.tapeHint}</span></div>
        <div id="rdFieldTape" class="rd-field-tape"></div>
      </div>
    </div>
    <div class="rd-field-note">${t.note}</div>
    <div id="rdFieldA11y" class="rd-field-a11y" aria-live="polite"></div>
  `;

  const degraded = host.querySelector("#rdLiveDegraded");
  const tabs = host.querySelector("#rdLiveRoomTabs");
  if (degraded) degraded.insertAdjacentElement("afterend", field);
  else if (tabs) tabs.insertAdjacentElement("beforebegin", field);
  else host.appendChild(field);

  rdFieldCanvas = document.getElementById("rdFieldCanvas");
  rdFieldChart = document.getElementById("rdFieldChart");
  rdFieldCtx = rdFieldCanvas?.getContext("2d") || null;
  rdFieldChartCtx = rdFieldChart?.getContext("2d") || null;

  rdFieldBuildRoomTabs();
  rdFieldBindPointer();
  rdFieldSyncCanvasSize();

  const existingTabs = document.getElementById("rdLiveRoomTabs");
  existingTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-room]");
    const room = button?.dataset?.room;
    if (!RD_FIELD_ROOMS.includes(room) || room === rdFieldRoom) return;
    rdFieldSelectRoom(room, false);
  });

  return true;
}

function rdFieldBuildRoomTabs() {
  const tabs = document.getElementById("rdFieldRoomTabs");
  if (!tabs) return;
  tabs.textContent = "";
  for (const room of RD_FIELD_ROOMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rd-field-room";
    button.dataset.room = room;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", room === rdFieldRoom ? "true" : "false");
    button.textContent = `/r/${room}`;
    button.addEventListener("click", () => rdFieldSelectRoom(room, true));
    tabs.appendChild(button);
  }
}

function rdFieldSelectRoom(room, syncExisting = true) {
  if (!RD_FIELD_ROOMS.includes(room)) return;
  rdFieldRoom = room;
  rdFieldHoverKey = "";
  rdFieldBuildRoomTabs();
  rdFieldBuildAgents();
  rdFieldRenderDom();
  rdFieldDrawAll(performance.now());

  if (syncExisting) {
    const button = document.querySelector(`#rdLiveRoomTabs [data-room="${room}"]`);
    button?.click();
  }

  const state = rdFieldState.get(room);
  rdFieldRead(room, !state?.messages?.length);
}

function rdFieldSetText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function rdFieldUpdateStatus(stateName) {
  const t = rdFieldT();
  const el = document.getElementById("rdFieldLive");
  if (!el) return;
  el.dataset.state = stateName;
  const span = el.querySelector("span");
  if (span) span.textContent = stateName === "error" ? t.error : stateName === "loading" ? t.loading : t.live;
}

function rdFieldRenderDom() {
  const state = rdFieldState.get(rdFieldRoom);
  const messages = rdFieldCurrentMessages();
  const t = rdFieldT();
  rdFieldSetText("rdFieldAgentsCount", rdFieldAgents.length);
  rdFieldSetText("rdFieldMessagesCount", messages.length);
  rdFieldSetText("rdFieldNewCount", state?.lastIncoming || 0);
  rdFieldSetText("rdFieldUsefulCount", rdFieldUsefulCount(messages));
  rdFieldSetText("rdFieldRoomLabel", `${t.field} · /r/${rdFieldRoom}`);

  const a11y = document.getElementById("rdFieldA11y");
  if (a11y) a11y.textContent = `${rdFieldAgents.length} ${t.agents.toLowerCase()}, ${messages.length} ${t.messages.toLowerCase()}, /r/${rdFieldRoom}.`;

  rdFieldRenderTape(messages);
}

function rdFieldTimeLabel(tsMs) {
  if (!tsMs) return "—";
  try {
    return new Intl.DateTimeFormat(rdFieldLang() === "tr" ? "tr-TR" : "en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(tsMs));
  } catch {
    return "—";
  }
}

function rdFieldRenderTape(messages) {
  const tape = document.getElementById("rdFieldTape");
  if (!tape) return;
  tape.textContent = "";
  const t = rdFieldT();
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "rd-field-empty";
    empty.textContent = t.noData;
    tape.appendChild(empty);
    return;
  }

  for (const message of messages.slice(0, 14)) {
    const row = document.createElement("div");
    row.className = "rd-field-tape-row";
    if (rdFieldIsUseful(message)) row.classList.add("is-useful");
    if (rdFieldIsAlert(message)) row.classList.add("is-alert");

    const time = document.createElement("time");
    time.textContent = rdFieldTimeLabel(message.tsMs);
    const tag = document.createElement("b");
    tag.textContent = rdFieldIsAlert(message) ? t.alertTag : rdFieldIsUseful(message) ? t.usefulTag : t.msg;
    const text = document.createElement("span");
    text.textContent = `${rdFieldShort(message.key)} · ${message.text || "—"}`;
    row.append(time, tag, text);
    tape.appendChild(row);
  }
}

function rdFieldSyncCanvasSize() {
  clearTimeout(rdFieldResizeTimer);
  rdFieldResizeTimer = setTimeout(() => {
    for (const canvas of [rdFieldCanvas, rdFieldChart]) {
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }
    rdFieldDrawAll(performance.now());
  }, 50);
}

function rdFieldCanvasMetrics(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return {
    width: rect.width,
    height: rect.height,
    dpr
  };
}

function rdFieldPrepare(ctx, canvas) {
  const { width, height, dpr } = rdFieldCanvasMetrics(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { width, height, dpr };
}

function rdFieldRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function rdFieldColors(kind) {
  if (kind === "reddragon") return { shirt: "#ff6b3d", glow: "#ff8b3d", line: "#ff9b51" };
  if (kind === "useful") return { shirt: "#55dc91", glow: "#55dc91", line: "#55dc91" };
  if (kind === "alert") return { shirt: "#ff5e67", glow: "#ff5e67", line: "#ff7079" };
  if (kind === "work") return { shirt: "#3ca5ff", glow: "#3ca5ff", line: "#4db0ff" };
  return { shirt: "#7b8799", glow: "#7b8799", line: "#9aa6b7" };
}

function rdFieldAgentPosition(agent, now, width, height) {
  const marginX = 24;
  const marginY = 30;
  const baseX = marginX + agent.xRatio * Math.max(10, width - marginX * 2);
  const baseY = marginY + agent.yRatio * Math.max(10, height - marginY * 2);
  const t = now / 1000;
  const x = baseX + Math.sin(t * agent.speed + agent.phase) * 8;
  const y = baseY + Math.cos(t * (agent.speed * 0.83) + agent.phase) * 5;
  agent.px = x;
  agent.py = y;
  return { x, y };
}

function rdFieldDrawGrid(ctx, width, height) {
  ctx.fillStyle = "#071126";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(96,145,200,.10)";
  ctx.lineWidth = 1;
  const grid = 28;
  ctx.beginPath();
  for (let x = 0; x <= width; x += grid) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += grid) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  const gradient = ctx.createRadialGradient(width * .5, height * .42, 20, width * .5, height * .42, Math.max(width, height) * .65);
  gradient.addColorStop(0, "rgba(43,111,170,.09)");
  gradient.addColorStop(1, "rgba(4,8,18,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function rdFieldDrawAgent(ctx, agent, x, y, now) {
  const colors = rdFieldColors(agent.kind);
  const bob = Math.sin(now / 160 + agent.phase) * 1.2;
  const px = Math.round(x);
  const py = Math.round(y + bob);

  if (agent.key === rdFieldHoverKey || agent.key === RD_FIELD_REDDRAGON_DID) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = colors.glow;
    ctx.beginPath();
    ctx.arc(px, py + 5, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.fillRect(px - 5, py + 10, 10, 3);

  ctx.fillStyle = "#d3a06e";
  ctx.fillRect(px - 3, py - 8, 6, 6);
  ctx.fillStyle = "#4b3528";
  ctx.fillRect(px - 3, py - 9, 6, 2);
  ctx.fillRect(px - 4, py - 7, 1, 3);

  ctx.fillStyle = colors.shirt;
  ctx.fillRect(px - 4, py - 2, 8, 8);
  ctx.fillStyle = "#17263b";
  ctx.fillRect(px - 4, py + 6, 3, 5);
  ctx.fillRect(px + 1, py + 6, 3, 5);

  if (agent.signed) {
    ctx.fillStyle = "#73f2b2";
    ctx.fillRect(px + 5, py - 2, 2, 2);
  }
}

function rdFieldWrapLines(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);

  if (words.length && lines.length) {
    const joined = lines.join(" ");
    const original = words.join(" ");
    if (joined.length < original.length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = `${last}…`;
    }
  }
  return lines;
}

function rdFieldDrawBubble(ctx, agent, message, width, height, accent) {
  if (!message?.text) return;
  const maxWidth = Math.min(220, Math.max(140, width * .28));
  ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const prefix = `${rdFieldShort(agent.key)}: `;
  const lines = rdFieldWrapLines(ctx, `${prefix}${message.text}`, maxWidth - 18, 3);
  const lineHeight = 15;
  const boxW = Math.max(120, Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 80) + 18));
  const boxH = lines.length * lineHeight + 16;

  let x = agent.px + 12;
  let y = agent.py - boxH - 14;
  if (x + boxW > width - 8) x = agent.px - boxW - 12;
  if (x < 8) x = 8;
  if (y < 8) y = Math.min(height - boxH - 8, agent.py + 18);

  ctx.save();
  ctx.fillStyle = "rgba(9,18,31,.96)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  rdFieldRoundRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  const tipX = Math.max(x + 12, Math.min(x + boxW - 12, agent.px));
  const tipY = y < agent.py ? y + boxH : y;
  ctx.beginPath();
  ctx.moveTo(tipX - 5, tipY);
  ctx.lineTo(agent.px, agent.py - 2);
  ctx.lineTo(tipX + 5, tipY);
  ctx.closePath();
  ctx.fillStyle = "rgba(9,18,31,.96)";
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.fillStyle = "#e8f0fa";
  ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  lines.forEach((line, index) => ctx.fillText(line, x + 9, y + 13 + index * lineHeight));
  ctx.restore();
}

function rdFieldBubbleAgents(now) {
  if (rdFieldHoverKey) {
    const hovered = rdFieldAgents.find((agent) => agent.key === rdFieldHoverKey);
    return hovered ? [hovered] : [];
  }
  if (!rdFieldAgents.length) return [];
  const pool = rdFieldAgents.slice(0, Math.min(12, rdFieldAgents.length));
  const start = Math.floor(now / 4500) % pool.length;
  const picked = [];
  for (let i = 0; i < Math.min(3, pool.length); i++) {
    const agent = pool[(start + i * 3) % pool.length];
    if (agent && !picked.some((item) => item.key === agent.key)) picked.push(agent);
  }
  return picked;
}

function rdFieldDrawField(now) {
  if (!rdFieldCtx || !rdFieldCanvas) return;
  const { width, height } = rdFieldPrepare(rdFieldCtx, rdFieldCanvas);
  rdFieldDrawGrid(rdFieldCtx, width, height);

  if (!rdFieldAgents.length) {
    const t = rdFieldT();
    rdFieldCtx.fillStyle = "#66758a";
    rdFieldCtx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    rdFieldCtx.textAlign = "center";
    rdFieldCtx.fillText(t.noData, width / 2, height / 2);
    rdFieldCtx.textAlign = "start";
    return;
  }

  for (const agent of rdFieldAgents) {
    const { x, y } = rdFieldAgentPosition(agent, now, width, height);
    rdFieldDrawAgent(rdFieldCtx, agent, x, y, now);
  }

  for (const agent of rdFieldBubbleAgents(now)) {
    const colors = rdFieldColors(agent.kind);
    rdFieldDrawBubble(rdFieldCtx, agent, agent.latest, width, height, colors.line);
  }
}

function rdFieldActivityBuckets(messages, bucketCount = 16) {
  const list = [...messages].filter((m) => m.tsMs).sort((a, b) => a.tsMs - b.tsMs);
  if (list.length >= 2 && list[list.length - 1].tsMs > list[0].tsMs) {
    const min = list[0].tsMs;
    const max = list[list.length - 1].tsMs;
    const span = Math.max(1, max - min);
    const buckets = Array(bucketCount).fill(0);
    for (const message of list) {
      const idx = Math.min(bucketCount - 1, Math.floor(((message.tsMs - min) / span) * bucketCount));
      buckets[idx] += 1;
    }
    return buckets;
  }

  const ordered = [...messages].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const buckets = Array(bucketCount).fill(0);
  if (!ordered.length) return buckets;
  ordered.forEach((_, index) => {
    const idx = Math.min(bucketCount - 1, Math.floor((index / ordered.length) * bucketCount));
    buckets[idx] += 1;
  });
  return buckets;
}

function rdFieldDrawChart() {
  if (!rdFieldChartCtx || !rdFieldChart) return;
  const { width, height } = rdFieldPrepare(rdFieldChartCtx, rdFieldChart);
  const ctx = rdFieldChartCtx;
  ctx.fillStyle = "#071126";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(96,145,200,.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 22; y < height; y += 26) {
    ctx.moveTo(0, y + .5);
    ctx.lineTo(width, y + .5);
  }
  ctx.stroke();

  const messages = rdFieldCurrentMessages();
  const buckets = rdFieldActivityBuckets(messages, 18);
  const max = Math.max(1, ...buckets);
  const padX = 10;
  const padY = 12;
  const usableW = Math.max(1, width - padX * 2);
  const usableH = Math.max(1, height - padY * 2);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(55,187,255,.58)");
  gradient.addColorStop(.55, "rgba(55,187,255,.22)");
  gradient.addColorStop(1, "rgba(55,187,255,.04)");

  ctx.beginPath();
  buckets.forEach((value, index) => {
    const x = padX + (index / Math.max(1, buckets.length - 1)) * usableW;
    const y = padY + usableH - (value / max) * usableH;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(padX + usableW, padY + usableH);
  ctx.lineTo(padX, padY + usableH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  buckets.forEach((value, index) => {
    const x = padX + (index / Math.max(1, buckets.length - 1)) * usableW;
    const y = padY + usableH - (value / max) * usableH;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#49d5ff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function rdFieldDrawAll(now) {
  rdFieldDrawField(now);
  rdFieldDrawChart();
}

function rdFieldBindPointer() {
  if (!rdFieldCanvas) return;
  rdFieldCanvas.addEventListener("pointermove", (event) => {
    const rect = rdFieldCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    let distance = 20;
    for (const agent of rdFieldAgents) {
      const d = Math.hypot(agent.px - x, agent.py - y);
      if (d < distance) {
        nearest = agent;
        distance = d;
      }
    }
    const next = nearest?.key || "";
    if (next !== rdFieldHoverKey) {
      rdFieldHoverKey = next;
      rdFieldDrawField(performance.now());
    }
  });
  rdFieldCanvas.addEventListener("pointerleave", () => {
    if (!rdFieldHoverKey) return;
    rdFieldHoverKey = "";
    rdFieldDrawField(performance.now());
  });
}

function rdFieldAnimate(now) {
  if (!rdFieldVisible || document.hidden) {
    rdFieldAnimation = requestAnimationFrame(rdFieldAnimate);
    return;
  }
  if (now - rdFieldLastDraw >= 50) {
    rdFieldLastDraw = now;
    rdFieldDrawField(now);
  }
  rdFieldAnimation = requestAnimationFrame(rdFieldAnimate);
}

function rdFieldStartAnimation() {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduced) {
    rdFieldDrawAll(performance.now());
    return;
  }
  cancelAnimationFrame(rdFieldAnimation);
  rdFieldAnimation = requestAnimationFrame(rdFieldAnimate);
}

function rdFieldRefreshCurrent() {
  if (document.hidden) return;
  rdFieldRead(rdFieldRoom, false);
}

function rdFieldStart() {
  if (!rdFieldBuildShell()) {
    setTimeout(rdFieldStart, 250);
    return;
  }

  rdFieldBuildAgents();
  rdFieldRenderDom();
  rdFieldStartAnimation();
  rdFieldRead(rdFieldRoom, true);

  window.addEventListener("resize", rdFieldSyncCanvasSize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      rdFieldVisible = true;
      rdFieldSyncCanvasSize();
      const state = rdFieldState.get(rdFieldRoom);
      if (!state?.lastFetchAt || Date.now() - state.lastFetchAt >= RD_FIELD_REFRESH_MS) rdFieldRefreshCurrent();
    }
  });

  const observer = "ResizeObserver" in window
    ? new ResizeObserver(() => rdFieldSyncCanvasSize())
    : null;
  observer?.observe(document.getElementById("rdAgentField"));

  setInterval(rdFieldRefreshCurrent, RD_FIELD_REFRESH_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rdFieldStart, { once: true });
} else {
  rdFieldStart();
}
