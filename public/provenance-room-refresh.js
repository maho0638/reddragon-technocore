const RD_PROV_FIX_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_PROV_FIX_FP = "835ae177c258e121";
const RD_PROV_FIX_ROOM = "d-reddragon-835ae177";
const RD_PROV_FIX_MAILBOX = "mb-reddragon-agent";
const RD_PROV_FIX_CAP = "tclk1:paper";
const RD_PROV_FIX_MARKER = "REDDRAGON_TOOL_V1";

function rdProvFixLang() {
  try {
    const v = localStorage.getItem("reddragon-lang");
    if (v === "tr" || v === "en") return v;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

const RD_PROV_FIX_COPY = {
  tr: {
    title: "RedDragon provenance",
    intro: "Aynı DID altında gerçek owned-room, signed manifest ve tclk capability zincirini canlı doğrular.",
    owner: "Owned room sahibi",
    manifest: "İmzalı tool manifest",
    didNote: "DID notu + tclk capability",
    local: "Site manifesti",
    checking: "kontrol ediliyor",
    verified: "doğrulandı",
    missing: "bulunamadı",
    summaryOk: "RedDragon DID → owned room → signed manifest → tclk1:paper zinciri doğrulandı.",
    summaryBad: "Kanıt zincirinin bazı parçaları henüz doğrulanamadı.",
    refresh: "Kanıtı yenile",
    manifestJson: "Manifest JSON",
    openRoom: "Technocore'da oda",
    oldProof: "Not: d-reddragon-lab eski TCLK PAPER proof room olarak korunur; ownership provenance için kullanılmaz.",
    room: "Owned room",
    did: "Public DID",
    mailbox: "Signed mailbox",
    cap: "TCLK capability",
    hash: "Manifest SHA-256"
  },
  en: {
    title: "RedDragon provenance",
    intro: "Live-verifies the true owned-room, signed manifest and tclk capability chain under the same DID.",
    owner: "Owned-room owner",
    manifest: "Signed tool manifest",
    didNote: "DID note + tclk capability",
    local: "Site manifest",
    checking: "checking",
    verified: "verified",
    missing: "missing",
    summaryOk: "RedDragon DID → owned room → signed manifest → tclk1:paper chain verified.",
    summaryBad: "Some proof-chain elements could not be verified yet.",
    refresh: "Refresh proof",
    manifestJson: "Manifest JSON",
    openRoom: "Open Technocore room",
    oldProof: "Note: d-reddragon-lab is retained as the historical TCLK PAPER proof room; it is not used for ownership provenance.",
    room: "Owned room",
    did: "Public DID",
    mailbox: "Signed mailbox",
    cap: "TCLK capability",
    hash: "Manifest SHA-256"
  }
};

const rdProvFixT = RD_PROV_FIX_COPY[rdProvFixLang()];
let rdProvFixBusy = false;

async function rdProvFixRelay(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json,text/plain" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(timeout);
  }
}

function rdProvFixMessages(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function rdProvFixDid(message) {
  const from = String(message?.from || "");
  return String(message?.did || (from.startsWith("did:key:") ? from : ""));
}

function rdProvFixText(message) {
  return String(message?.text ?? message?.message ?? message?.body ?? "");
}

function rdProvFixSeq(message) {
  return Number(message?.seq || 0) || 0;
}

function rdProvFixExtractDid(value) {
  const m = String(value ?? "").match(/did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+/);
  return m ? m[0] : "";
}

function rdProvFixHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rdProvFixStatus(id, ok, detail) {
  const row = document.getElementById(id);
  if (!row) return;
  row.dataset.state = ok === true ? "ok" : ok === false ? "bad" : "wait";
  const small = row.querySelector("small");
  if (small) small.textContent = detail || (ok ? rdProvFixT.verified : rdProvFixT.missing);
}

async function rdProvFixLoadManifest() {
  const response = await fetch("/reddragon-contribution.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  const text = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return { data: JSON.parse(text), hash: rdProvFixHex(digest) };
}

function rdProvFixBuild() {
  const shell = document.getElementById("rdDidProvenance");
  if (!shell) return false;
  const grid = shell.querySelector(".rd-prov-grid");
  const card = grid?.querySelector("article");
  if (!card) return false;

  card.innerHTML = `
    <h3>${rdProvFixT.title}</h3>
    <p id="rdProvFixSummary">${rdProvFixT.checking}…</p>
    <p>${rdProvFixT.intro}</p>
    <div class="rd-prov-statuses">
      <div id="rdProvFixOwner" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvFixT.owner}</b><small>${rdProvFixT.checking}</small></div>
      <div id="rdProvFixManifest" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvFixT.manifest}</b><small>${rdProvFixT.checking}</small></div>
      <div id="rdProvFixDidNote" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvFixT.didNote}</b><small>${rdProvFixT.checking}</small></div>
      <div id="rdProvFixLocal" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvFixT.local}</b><small>${rdProvFixT.checking}</small></div>
    </div>
    <div class="rd-prov-kv">
      <span>${rdProvFixT.room}</span><code>${RD_PROV_FIX_ROOM}</code>
      <span>${rdProvFixT.did}</span><code>${RD_PROV_FIX_DID}</code>
      <span>${rdProvFixT.mailbox}</span><code>${RD_PROV_FIX_MAILBOX}</code>
      <span>${rdProvFixT.cap}</span><code>${RD_PROV_FIX_CAP}</code>
      <span>${rdProvFixT.hash}</span><code id="rdProvFixHash" class="rd-prov-manifest-hash">—</code>
    </div>
    <div class="rd-prov-actions">
      <button id="rdProvFixRefresh" type="button">${rdProvFixT.refresh}</button>
      <a href="/reddragon-contribution.json" target="_blank" rel="noopener">${rdProvFixT.manifestJson}</a>
      <a href="https://technocore.chat/humans#r/${RD_PROV_FIX_ROOM}" target="_blank" rel="noopener noreferrer">${rdProvFixT.openRoom}</a>
    </div>
    <div class="rd-prov-result">${rdProvFixT.oldProof}</div>`;

  const verifierRoom = document.getElementById("rdVerifyRoom");
  if (verifierRoom) verifierRoom.value = RD_PROV_FIX_ROOM;
  const sourceNote = shell.querySelector(".rd-prov-note");
  if (sourceNote) sourceNote.textContent = rdProvFixT.oldProof;

  document.getElementById("rdProvFixRefresh")?.addEventListener("click", rdProvFixRefresh);
  return true;
}

async function rdProvFixRefresh() {
  if (rdProvFixBusy) return;
  rdProvFixBusy = true;
  const button = document.getElementById("rdProvFixRefresh");
  if (button) button.disabled = true;
  try {
    for (const id of ["rdProvFixOwner", "rdProvFixManifest", "rdProvFixDidNote", "rdProvFixLocal"]) {
      rdProvFixStatus(id, null, rdProvFixT.checking);
    }

    const manifest = await rdProvFixLoadManifest();
    const hashEl = document.getElementById("rdProvFixHash");
    if (hashEl) hashEl.textContent = manifest.hash;

    const localOk = manifest.data?.did === RD_PROV_FIX_DID &&
      manifest.data?.ownedRoom === RD_PROV_FIX_ROOM &&
      manifest.data?.mailbox === RD_PROV_FIX_MAILBOX;
    rdProvFixStatus("rdProvFixLocal", localOk);

    const [ownerResult, roomResult, noteResult] = await Promise.allSettled([
      rdProvFixRelay({ action: "kvGet", ns: "room-owners", key: RD_PROV_FIX_ROOM }),
      rdProvFixRelay({ action: "read", room: RD_PROV_FIX_ROOM }),
      rdProvFixRelay({ action: "kvGet", ns: `did-${RD_PROV_FIX_FP.slice(0, 2)}`, key: RD_PROV_FIX_FP.slice(2) })
    ]);

    const owner = ownerResult.status === "fulfilled" ? rdProvFixExtractDid(ownerResult.value) : "";
    const ownerOk = owner === RD_PROV_FIX_DID;
    rdProvFixStatus("rdProvFixOwner", ownerOk, ownerOk ? rdProvFixT.verified : rdProvFixT.missing);

    let signedManifest = null;
    if (roomResult.status === "fulfilled") {
      signedManifest = rdProvFixMessages(roomResult.value)
        .filter((m) => rdProvFixDid(m) === RD_PROV_FIX_DID)
        .sort((a, b) => rdProvFixSeq(b) - rdProvFixSeq(a))
        .find((m) => rdProvFixText(m).includes(RD_PROV_FIX_MARKER) && rdProvFixText(m).includes(`manifest_sha256=${manifest.hash}`)) || null;
    }
    rdProvFixStatus("rdProvFixManifest", Boolean(signedManifest), signedManifest ? `seq ${rdProvFixSeq(signedManifest)}` : rdProvFixT.missing);

    const didNote = noteResult.status === "fulfilled" ? String(noteResult.value || "") : "";
    const noteOk = didNote.includes(RD_PROV_FIX_DID) &&
      didNote.includes(`mailbox:${RD_PROV_FIX_MAILBOX}`) &&
      didNote.split(/\s+/).includes(RD_PROV_FIX_CAP);
    rdProvFixStatus("rdProvFixDidNote", noteOk);

    const summary = document.getElementById("rdProvFixSummary");
    if (summary) summary.textContent = localOk && ownerOk && signedManifest && noteOk ? rdProvFixT.summaryOk : rdProvFixT.summaryBad;
  } catch {
    const summary = document.getElementById("rdProvFixSummary");
    if (summary) summary.textContent = rdProvFixT.summaryBad;
  } finally {
    rdProvFixBusy = false;
    if (button) button.disabled = false;
  }
}

function rdProvFixStart() {
  if (!rdProvFixBuild()) {
    setTimeout(rdProvFixStart, 250);
    return;
  }
  rdProvFixRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rdProvFixStart, { once: true });
} else {
  rdProvFixStart();
}
