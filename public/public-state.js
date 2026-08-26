const $ = (s) => document.querySelector(s);

const PREFIX = "reddragon-public-state-v1:";
let restoredDid = "";
let lastSaved = "";

function currentDid() {
  const did = $("#vaultDid")?.textContent?.trim() || "";
  return /^did:key:z6Mk/.test(did) ? did : "";
}

function keyFor(did) { return PREFIX + did; }

function hasSensitiveMaterial(value, key = "") {
  const k = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  const blocked = new Set([
    "privatekey","privatekeypkcs8","privatekeyraw","pkcs8","seed","seedphrase",
    "walletseed","mnemonic","secret","secretkey","ciphertext","ciphertextb64u",
    "saltb64u","ivb64u","password","passphrase"
  ]);
  if (blocked.has(k)) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => hasSensitiveMaterial(v));
  return Object.entries(value).some(([ck, cv]) => hasSensitiveMaterial(cv, ck));
}

function parseProof() {
  try {
    const p = JSON.parse($("#proofText")?.value || "null");
    return p && typeof p === "object" && !hasSensitiveMaterial(p) ? p : null;
  } catch { return null; }
}

function mergeProof(oldP, newP) {
  if (!oldP) return newP;
  if (!newP) return oldP;
  const out = { ...oldP, ...newP };
  for (const k of ["didNote","lobbyHello","lobbyIntro","publicRoom","profileStyle"]) {
    if (!newP[k]) out[k] = oldP[k] || null;
  }
  out.privateRoomCreated = Boolean(oldP.privateRoomCreated || newP.privateRoomCreated);
  out.contribution = { ...(oldP.contribution || {}), ...(newP.contribution || {}) };
  if (!newP?.contribution?.record) out.contribution.record = oldP?.contribution?.record || null;
  return out;
}

function publicForm() {
  const ids = ["ctype","targetRoom","clink","ctitle","csummary","agentName","xhandle","helloText","introText","publicRoom","roomTopic","displayName","profileColor"];
  const out = {};
  for (const id of ids) {
    const el = $("#" + id);
    if (el) out[id] = String(el.value || "");
  }
  return out;
}

function doneSteps() {
  return [...document.querySelectorAll("[data-stepchip]")]
    .filter((el) => el.classList.contains("done"))
    .map((el) => Number(el.dataset.stepchip))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 10);
}

function readStored(did) {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(did)) || "null");
    if (!v || v.did !== did || hasSensitiveMaterial(v)) return null;
    return v;
  } catch { return null; }
}

function renderDone(done) {
  const set = new Set(done || []);
  for (let i = 1; i <= 10; i++) {
    const yes = set.has(i);
    const st = $("#s" + i);
    if (st && yes) { st.textContent = "Tamam"; st.classList.add("done"); }
    if (yes) document.querySelector(`[data-stepchip="${i}"]`)?.classList.add("done");
  }
  const count = [...set].filter((n) => n >= 1 && n <= 10).length;
  const pct = Math.round(count / 10 * 100);
  const ring = $("#progressRing");
  if (ring) {
    ring.style.setProperty("--pct", `${pct}%`);
    const strong = ring.querySelector("strong");
    if (strong) strong.textContent = `${pct}%`;
  }
}

function restoreStored(did) {
  const s = readStored(did);
  if (!s) return;
  for (const [id, value] of Object.entries(s.form || {})) {
    const el = $("#" + id);
    if (el && !el.value) el.value = value;
  }
  if (s.proof) {
    const box = $("#proofText");
    if (box) box.value = JSON.stringify(s.proof, null, 2);
    const r = s.proof?.contribution?.record;
    if (r?.seq) {
      if ($("#vaultContrib")) $("#vaultContrib").textContent = String(r.seq);
      if ($("#contribOut")) $("#contribOut").textContent = `Restored signed contribution · ${r.room || "technocore"} · seq ${r.seq}`;
      for (const id of ["copyProof","downloadProof","xShare"]) if ($("#" + id)) $("#" + id).disabled = false;
    }
  }
  renderDone(s.done || []);
}

function persistCurrent(did) {
  const previous = readStored(did);
  const proof = mergeProof(previous?.proof || null, parseProof());
  const done = [...new Set([...(previous?.done || []), ...doneSteps()])].sort((a,b)=>a-b);
  const payload = { version: 1, did, updatedAt: new Date().toISOString(), done, form: { ...(previous?.form || {}), ...publicForm() }, proof };
  if (hasSensitiveMaterial(payload)) return;
  const serialized = JSON.stringify(payload);
  if (serialized === lastSaved) return;
  localStorage.setItem(keyFor(did), serialized);
  lastSaved = serialized;
}

function parseSeq(text) {
  const m = String(text || "").match(/(?:seq|sequence|#)\s*[:=]?\s*(\d+)/i) || String(text || "").match(/\b(\d{3,})\b/);
  return m ? m[1] : "";
}

function installFetchReceiptCapture() {
  if (window.__rdFetchCaptureInstalled) return;
  window.__rdFetchCaptureInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    let signed = null;
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const init = args[1] || {};
      if (url.includes("/api/relay") && typeof init.body === "string") {
        const body = JSON.parse(init.body);
        if (body?.action === "signedPost" && String(body.text || "").startsWith("Contribution |")) signed = body;
      }
    } catch {}
    const response = await nativeFetch(...args);
    if (signed && response.ok) {
      try {
        const copy = response.clone();
        const text = await copy.text();
        const seq = parseSeq(text);
        if (seq) setTimeout(() => {
          const did = currentDid();
          if (!did || did !== signed.did) return;
          const box = $("#proofText");
          if (!box) return;
          let p;
          try { p = JSON.parse(box.value || "{}"); } catch { p = {}; }
          p.contribution = p.contribution || {};
          p.contribution.record = {
            ...(p.contribution.record || {}),
            room: signed.room || "technocore",
            seq: String(seq),
            did: signed.did,
            sig: signed.sig,
            nonce: String(signed.nonce),
            text: signed.text,
            signedReceipt: true
          };
          box.value = JSON.stringify(p, null, 2);
          renderDone([...new Set([...doneSteps(), 9, 10])]);
          persistCurrent(did);
        }, 250);
      } catch {}
    }
    return response;
  };
}

installFetchReceiptCapture();

window.addEventListener("load", () => {
  setInterval(() => {
    const did = currentDid();
    if (!did) return;
    if (restoredDid !== did) {
      restoredDid = did;
      lastSaved = "";
      restoreStored(did);
    }
    persistCurrent(did);
    const stored = readStored(did);
    if (stored) renderDone(stored.done || []);
  }, 800);
});
