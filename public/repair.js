const cfg = window.APP_CONFIG || {};
const PUBLIC_PREFIX = "reddragon-public-state-v1:";
const LEGACY_PROGRESS = "reddragon-progress";
const SESSION_PROOF = "reddragon-imported-public-proof";
const PENDING_PROOF = "reddragon-pending-public-proof";
const RECEIPT_PREFIX = "reddragon-signed-contribution:";
const DID_PROGRESS_PREFIX = "reddragon-public-progress:";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const te = new TextEncoder();

function numericSeq(value) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0;
}

function invalidProofRecord(proof) {
  const record = proof?.contribution?.record;
  return !!record && !numericSeq(record.seq);
}

function scrubProof(proof) {
  if (!proof || typeof proof !== "object") return proof;
  if (invalidProofRecord(proof)) {
    proof = JSON.parse(JSON.stringify(proof));
    proof.contribution = proof.contribution || {};
    proof.contribution.record = null;
  }
  return proof;
}

function scrubStoredState() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PROGRESS) || "[]");
    if (Array.isArray(legacy)) {
      localStorage.setItem(LEGACY_PROGRESS, JSON.stringify(legacy.filter((n) => n !== 9 && n !== 10)));
    }
  } catch {}

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PUBLIC_PREFIX)) continue;
      try {
        const state = JSON.parse(localStorage.getItem(key) || "null");
        if (!state || typeof state !== "object") continue;
        if (invalidProofRecord(state.proof)) {
          state.proof = scrubProof(state.proof);
          state.done = Array.isArray(state.done) ? state.done.filter((n) => n !== 9 && n !== 10) : [];
          localStorage.setItem(key, JSON.stringify(state));
        }
      } catch {}
    }
  } catch {}

  for (const key of [SESSION_PROOF, PENDING_PROOF]) {
    try {
      const proof = JSON.parse(sessionStorage.getItem(key) || "null");
      if (invalidProofRecord(proof)) sessionStorage.removeItem(key);
    } catch {}
  }
}

function repairXLinks() {
  const handle = cfg.xHandle || "@joannawolker";
  const url = cfg.xUrl || "https://x.com/joannawolker";

  document.querySelectorAll('a[href="https://x.com/joannawalker"]').forEach((a) => {
    a.href = url;
    if ((a.textContent || "").includes("@joannawalker")) {
      a.textContent = (a.textContent || "").replaceAll("@joannawalker", handle);
    }
  });

  document.querySelectorAll(".profile-card b").forEach((b) => {
    if ((b.textContent || "").trim() === "@joannawalker") b.textContent = handle;
  });

  document.querySelectorAll(".ownerline a, footer a").forEach((a) => {
    if ((a.textContent || "").includes("@joannawalker")) {
      a.textContent = (a.textContent || "").replaceAll("@joannawalker", handle);
      a.href = url;
    }
  });
}

function currentProof() {
  try { return JSON.parse(document.querySelector("#proofText")?.value || "null"); }
  catch { return null; }
}

function syncInvalidContributionUi() {
  const proof = currentProof();
  if (!invalidProofRecord(proof)) return;

  for (const n of [9, 10]) {
    const chip = document.querySelector(`[data-stepchip="${n}"]`);
    chip?.classList.remove("done");
    const status = document.querySelector(`#s${n}`);
    if (status) {
      status.classList.remove("done");
      status.textContent = "Bekliyor";
    }
  }

  const out = document.querySelector("#contribOut");
  if (out && /seq\s+signed\b/i.test(out.textContent || "")) {
    out.textContent = "Önceki kayıt cevabında sayısal sequence alınamadı. Relay düzeltildi; contribution'ı bir kez yeniden gönder.";
  }
  const vault = document.querySelector("#vaultContrib");
  if (vault && !numericSeq(vault.textContent)) vault.textContent = "—";

  ["copyProof", "downloadProof", "xShare"].forEach((id) => {
    const el = document.querySelector(`#${id}`);
    if (el) el.disabled = true;
  });
}

function activeDid() {
  const did = document.querySelector("#vaultDid")?.textContent?.trim() || "";
  return did === "—" ? "" : did;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function b64uToBytes(value) {
  let s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function base58Decode(value) {
  const s = String(value || "");
  let x = 0n;
  for (const ch of s) {
    const n = B58.indexOf(ch);
    if (n < 0) throw new Error("invalid base58");
    x = x * 58n + BigInt(n);
  }
  const bytes = [];
  while (x > 0n) {
    bytes.push(Number(x & 255n));
    x >>= 8n;
  }
  bytes.reverse();
  let leading = 0;
  while (leading < s.length && s[leading] === "1") leading++;
  return Uint8Array.from([...new Array(leading).fill(0), ...bytes]);
}

function rawPublicKeyFromDid(did) {
  const prefix = "did:key:z";
  if (!String(did).startsWith(prefix)) throw new Error("invalid did:key");
  const decoded = base58Decode(String(did).slice(prefix.length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) throw new Error("invalid Ed25519 did:key");
  return decoded.slice(2);
}

async function verifyReceipt(receipt, did) {
  if (!receipt?.sig || !receipt?.nonce || !receipt?.room || !receipt?.text || receipt?.did !== did || !numericSeq(receipt?.seq)) return false;
  try {
    const raw = rawPublicKeyFromDid(did);
    const key = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    const payload = te.encode(`${receipt.room}|${receipt.nonce}|${cleanText(receipt.text)}`);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, b64uToBytes(receipt.sig), payload);
  } catch (e) {
    console.error("RedDragon receipt verify", e);
    return false;
  }
}

function loadReceipt(did) {
  try { return JSON.parse(localStorage.getItem(RECEIPT_PREFIX + did) || "null"); }
  catch { return null; }
}

function durableProof(receipt) {
  const base = currentProof();
  const proof = base && typeof base === "object" ? JSON.parse(JSON.stringify(base)) : {};
  proof.proofFormat = "reddragon-public-proof-v2";
  proof.tool = proof.tool || "RedDragon Technocore Agent Lab";
  proof.owner = cfg.xHandle || proof.owner || "";
  proof.notice = "Portable Ed25519-signed contribution proof. Private key is never included.";
  proof.generatedAt = new Date().toISOString();
  proof.did = receipt.did;
  proof.fingerprint = proof.fingerprint || document.querySelector("#vaultFp")?.textContent?.trim() || null;
  proof.contribution = {
    ...(proof.contribution || {}),
    url: receipt.url || proof?.contribution?.url || null,
    title: receipt.title || proof?.contribution?.title || null,
    type: receipt.type || proof?.contribution?.type || "Tool / Code",
    summary: receipt.summary || proof?.contribution?.summary || null,
    record: {
      room: receipt.room,
      seq: String(receipt.seq),
      did: receipt.did,
      sig: receipt.sig,
      nonce: String(receipt.nonce),
      text: cleanText(receipt.text),
      capturedAt: receipt.capturedAt || null,
      verification: "offline-ed25519-signature"
    }
  };
  return proof;
}

function downloadJson(name, obj) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markDurableProgress(did) {
  let done = [];
  try { done = JSON.parse(localStorage.getItem(LEGACY_PROGRESS) || "[]"); } catch {}
  const set = new Set(Array.isArray(done) ? done.filter(Number.isInteger) : []);
  set.add(9); set.add(10);
  try { localStorage.setItem(LEGACY_PROGRESS, JSON.stringify([...set])); } catch {}

  let didDone = [];
  try { didDone = JSON.parse(localStorage.getItem(DID_PROGRESS_PREFIX + did) || "[]"); } catch {}
  const didSet = new Set(Array.isArray(didDone) ? didDone.filter(Number.isInteger) : []);
  didSet.add(9); didSet.add(10);
  try { localStorage.setItem(DID_PROGRESS_PREFIX + did, JSON.stringify([...didSet])); } catch {}

  for (const n of [9, 10]) {
    const chip = document.querySelector(`[data-stepchip="${n}"]`);
    chip?.classList.add("done");
    const status = document.querySelector(`#s${n}`);
    if (status) { status.classList.add("done"); status.textContent = "Tamam"; }
  }
}

async function recoverLocalSignedProof() {
  const did = activeDid();
  if (!did) return false;
  const receipt = loadReceipt(did);
  if (!receipt || !(await verifyReceipt(receipt, did))) return false;

  const proof = durableProof(receipt);
  const proofText = document.querySelector("#proofText");
  if (proofText) proofText.value = JSON.stringify(proof, null, 2);
  const vault = document.querySelector("#vaultContrib");
  if (vault) vault.textContent = String(receipt.seq);
  const out = document.querySelector("#contribOut");
  if (out) out.textContent = `Kalıcı Ed25519 imzalı contribution · ${receipt.room} · seq ${receipt.seq}`;
  markDurableProgress(did);

  try { sessionStorage.setItem(SESSION_PROOF, JSON.stringify(proof)); } catch {}

  const downloadBtn = document.querySelector("#downloadProof");
  if (downloadBtn) {
    downloadBtn.disabled = false;
    downloadBtn.dataset.rdDurable = "1";
    downloadBtn.onclick = async () => {
      const latest = loadReceipt(did);
      if (!latest || !(await verifyReceipt(latest, did))) return;
      downloadJson(`reddragon-proof-${(document.querySelector("#vaultFp")?.textContent || "proof").trim()}.json`, durableProof(latest));
      const t = document.querySelector("#toast");
      if (t) { t.textContent = "Kalıcı imzalı Public Proof indirildi"; t.classList.add("show"); }
    };
  }

  const copyBtn = document.querySelector("#copyProof");
  if (copyBtn) {
    copyBtn.disabled = false;
    copyBtn.dataset.rdDurable = "1";
    copyBtn.onclick = async () => {
      const latest = loadReceipt(did);
      if (!latest || !(await verifyReceipt(latest, did))) return;
      await navigator.clipboard.writeText(JSON.stringify(durableProof(latest), null, 2));
    };
  }

  if (!window.__rdReceiptRecoveryShown) {
    window.__rdReceiptRecoveryShown = true;
    const t = document.querySelector("#toast");
    if (t) {
      t.textContent = `Yerel Ed25519 receipt doğrulandı · contribution #${receipt.seq} kalıcı proof'a bağlandı`;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 6000);
    }
  }
  return true;
}

scrubStoredState();

window.addEventListener("load", () => {
  repairXLinks();
  syncInvalidContributionUi();
  recoverLocalSignedProof();
  const timer = setInterval(() => {
    repairXLinks();
    syncInvalidContributionUi();
    recoverLocalSignedProof();
  }, 750);
  setTimeout(() => clearInterval(timer), 120000);
});