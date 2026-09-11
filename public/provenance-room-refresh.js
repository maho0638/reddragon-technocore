const RD_PROV_FIX_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_PROV_FIX_FP = "835ae177c258e121";
const RD_PROV_FIX_ROOM = "d-reddragon-835ae177";
const RD_PROV_FIX_PROOF_ROOM = "d-reddragon-lab";
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
    intro: "Aynı DID altında ownership claim, site manifesti ve tclk capability sinyallerini canlı doğrular. Technocore oda-retention/kapasite durumu nedeniyle signed manifest-room kanıtı ayrı ve opsiyonel bir sinyal olarak gösterilir.",
    owner: "Owned-room claim",
    manifest: "Signed manifest-room kanıtı",
    didNote: "DID notu + tclk capability",
    local: "Site manifesti",
    checking: "kontrol ediliyor",
    verified: "doğrulandı",
    missing: "bulunamadı",
    deferred: "Technocore oda kapasitesi nedeniyle ertelendi",
    summaryOk: "RedDragon DID → ownership claim → signed manifest-room proof → tclk1:paper zinciri doğrulandı.",
    summaryDeferred: "Kimlik, ownership ve tclk capability doğrulanabilir; ek signed manifest-room kanıtı Technocore oda kapasitesi/retention nedeniyle şu anda kullanılamıyor.",
    summaryBad: "Temel kanıt sinyallerinin bazıları doğrulanamadı.",
    refresh: "Kanıtı yenile",
    manifestJson: "Manifest JSON",
    openProof: "Tarihsel proof room",
    capacityNote: "d-reddragon-835ae177 ownership claim'i aynı DID tarafından alınmış durumda. d-reddragon-lab tarihsel TCLK proof odasıdır; retention sonrası oda yoksa ve global room cap doluysa yeniden yaratılamaz. Bu yüzden site, mevcut olmayan signed manifest-room kanıtını doğrulanmış gibi göstermez.",
    room: "Ownership claim",
    proofRoom: "Tarihsel proof room",
    did: "Public DID",
    mailbox: "Signed mailbox",
    cap: "TCLK capability",
    hash: "Manifest SHA-256"
  },
  en: {
    title: "RedDragon provenance",
    intro: "Live-verifies the ownership claim, site manifest and tclk capability signals under the same DID. Because of Technocore room retention/capacity, signed manifest-room proof is shown as a separate optional signal.",
    owner: "Owned-room claim",
    manifest: "Signed manifest-room proof",
    didNote: "DID note + tclk capability",
    local: "Site manifest",
    checking: "checking",
    verified: "verified",
    missing: "missing",
    deferred: "deferred by Technocore room capacity",
    summaryOk: "RedDragon DID → ownership claim → signed manifest-room proof → tclk1:paper chain verified.",
    summaryDeferred: "Identity, ownership and tclk capability are verifiable; the extra signed manifest-room proof is currently unavailable because of Technocore room capacity/retention.",
    summaryBad: "Some core proof signals could not be verified.",
    refresh: "Refresh proof",
    manifestJson: "Manifest JSON",
    openProof: "Historical proof room",
    capacityNote: "The ownership claim for d-reddragon-835ae177 is held by the same DID. d-reddragon-lab is a historical TCLK proof room; if retention has reaped it while the global room cap is full, it cannot be recreated. The site therefore does not present a missing signed manifest-room proof as verified.",
    room: "Ownership claim",
    proofRoom: "Historical proof room",
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
      <span>${rdProvFixT.proofRoom}</span><code>${RD_PROV_FIX_PROOF_ROOM}</code>
      <span>${rdProvFixT.did}</span><code>${RD_PROV_FIX_DID}</code>
      <span>${rdProvFixT.mailbox}</span><code>${RD_PROV_FIX_MAILBOX}</code>
      <span>${rdProvFixT.cap}</span><code>${RD_PROV_FIX_CAP}</code>
      <span>${rdProvFixT.hash}</span><code id="rdProvFixHash" class="rd-prov-manifest-hash">—</code>
    </div>
    <div class="rd-prov-actions">
      <button id="rdProvFixRefresh" type="button">${rdProvFixT.refresh}</button>
      <a href="/reddragon-contribution.json" target="_blank" rel="noopener">${rdProvFixT.manifestJson}</a>
      <a href="https://technocore.chat/humans#r/${RD_PROV_FIX_PROOF_ROOM}" target="_blank" rel="noopener noreferrer">${rdProvFixT.openProof}</a>
    </div>
    <div class="rd-prov-result">${rdProvFixT.capacityNote}</div>`;

  const verifierRoom = document.getElementById("rdVerifyRoom");
  if (verifierRoom) verifierRoom.value = RD_PROV_FIX_ROOM;
  const sourceNote = shell.querySelector(".rd-prov-note");
  if (sourceNote) sourceNote.textContent = rdProvFixT.capacityNote;

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
      manifest.data?.manifestProofRoom === RD_PROV_FIX_PROOF_ROOM &&
      manifest.data?.mailbox === RD_PROV_FIX_MAILBOX;
    rdProvFixStatus("rdProvFixLocal", localOk);

    const [ownerResult, proofRoomResult, noteResult] = await Promise.allSettled([
      rdProvFixRelay({ action: "kvGet", ns: "room-owners", key: RD_PROV_FIX_ROOM }),
      rdProvFixRelay({ action: "read", room: RD_PROV_FIX_PROOF_ROOM }),
      rdProvFixRelay({ action: "kvGet", ns: `did-${RD_PROV_FIX_FP.slice(0, 2)}`, key: RD_PROV_FIX_FP.slice(2) })
    ]);

    const owner = ownerResult.status === "fulfilled" ? rdProvFixExtractDid(ownerResult.value) : "";
    const ownerOk = owner === RD_PROV_FIX_DID;
    rdProvFixStatus("rdProvFixOwner", ownerOk, ownerOk ? rdProvFixT.verified : rdProvFixT.missing);

    let signedManifest = null;
    if (proofRoomResult.status === "fulfilled") {
      signedManifest = rdProvFixMessages(proofRoomResult.value)
        .filter((m) => rdProvFixDid(m) === RD_PROV_FIX_DID)
        .sort((a, b) => rdProvFixSeq(b) - rdProvFixSeq(a))
        .find((m) => {
          const text = rdProvFixText(m);
          return text.includes(RD_PROV_FIX_MARKER) &&
            text.includes(`manifest_sha256=${manifest.hash}`) &&
            text.includes(`ownership_room=${RD_PROV_FIX_ROOM}`);
        }) || null;
    }
    const manifestDetail = signedManifest
      ? `seq ${rdProvFixSeq(signedManifest)}`
      : proofRoomResult.status === "rejected"
        ? rdProvFixT.deferred
        : rdProvFixT.missing;
    rdProvFixStatus("rdProvFixManifest", Boolean(signedManifest), manifestDetail);

    const didNote = noteResult.status === "fulfilled" ? String(noteResult.value || "") : "";
    const noteOk = didNote.includes(RD_PROV_FIX_DID) &&
      didNote.includes(`mailbox:${RD_PROV_FIX_MAILBOX}`) &&
      didNote.split(/\s+/).includes(RD_PROV_FIX_CAP);
    rdProvFixStatus("rdProvFixDidNote", noteOk);

    const summary = document.getElementById("rdProvFixSummary");
    if (summary) {
      const coreOk = localOk && ownerOk && noteOk;
      summary.textContent = coreOk && signedManifest
        ? rdProvFixT.summaryOk
        : coreOk
          ? rdProvFixT.summaryDeferred
          : rdProvFixT.summaryBad;
    }
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
