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
    intro: "Bu araç, aynı DID altındaki sahiplik beyanını, site manifestini ve TCLK yeteneği sinyallerini canlı olarak kontrol eder. Posta kutusu adı site manifestinde ayrıca listelenir; DID notunda bulunmadıkça imzalı sahiplik bağı sayılmaz. İmzalı manifest-oda kanıtı ayrı ve isteğe bağlı bir sinyaldir.",
    owner: "Oda sahiplik beyanı",
    manifest: "İmzalı manifest-oda kanıtı",
    didNote: "DID notu + tclk yeteneği",
    local: "Site manifesti",
    checking: "kontrol ediliyor",
    verified: "doğrulandı",
    missing: "bulunamadı",
    deferred: "Tarihsel kanıt odası şu anda okunamadı",
    summaryOk: "RedDragon DID → sahiplik beyanı → imzalı manifest-oda kanıtı → tclk1:paper zinciri doğrulandı.",
    summaryDeferred: "Kimlik, sahiplik ve tclk yeteneği doğrulandı; tarihsel kanıt odasındaki ek imzalı manifest kanıtı bu kontrolde doğrulanamadı.",
    summaryBad: "Temel kanıt sinyallerinin bazıları doğrulanamadı.",
    refresh: "Kanıtı yenile",
    manifestJson: "Manifest JSON",
    openProof: "Tarihsel kanıt odası",
    capacityNote: "d-reddragon-835ae177 sahiplik odasıdır; d-reddragon-lab tarihsel TCLK/manifest kanıt odasıdır. Sahiplik kaydı ve imzalı manifest kanıtı yenileme sırasında ayrı sorgulanır; kayıt bulunamazsa sahiplik doğrulanmış sayılmaz.",
    room: "Sahiplik beyanı",
    proofRoom: "Tarihsel kanıt odası",
    did: "Herkese açık DID",
    mailbox: "Posta kutusu kanalı",
    cap: "TCLK yeteneği",
    hash: "Manifest SHA-256"
  },
  en: {
    title: "RedDragon provenance",
    intro: "Checks the ownership claim, site manifest and TCLK capability under the same DID. The mailbox name is listed separately in the site manifest and is not treated as a signed DID-note binding. Signed manifest-room proof is a separate optional signal.",
    owner: "Owned-room claim",
    manifest: "Signed manifest-room proof",
    didNote: "DID note + tclk capability",
    local: "Site manifest",
    checking: "checking",
    verified: "verified",
    missing: "missing",
    deferred: "historical proof room could not be read",
    summaryOk: "RedDragon DID → ownership claim → signed manifest-room proof → tclk1:paper chain verified.",
    summaryDeferred: "Identity, ownership and tclk capability are verified; the extra signed manifest marker in the historical proof room could not be verified in this check.",
    summaryBad: "Some core proof signals could not be verified.",
    refresh: "Refresh proof",
    manifestJson: "Manifest JSON",
    openProof: "Historical proof room",
    capacityNote: "d-reddragon-835ae177 is the owned room; d-reddragon-lab is a historical TCLK/manifest proof room. The ownership record and signed manifest proof are checked separately on refresh; a missing record is not treated as verified ownership.",
    room: "Ownership claim",
    proofRoom: "Historical proof room",
    did: "Public DID",
    mailbox: "Mailbox lane",
    cap: "TCLK capability",
    hash: "Manifest SHA-256"
  }
};

const RD_PROV_FIX_CATALOG = window.RD_I18N?.register("provenanceRefresh", RD_PROV_FIX_COPY) || RD_PROV_FIX_COPY;
const rdProvFixT = RD_PROV_FIX_CATALOG[rdProvFixLang()];
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
    // The live DID note currently contains the DID and tclk1:paper capability,
    // but not a mailbox:... field. Validate only what the note actually signs;
    // the mailbox name is independently checked in the site manifest above.
    const noteOk = didNote.includes(RD_PROV_FIX_DID) &&
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
