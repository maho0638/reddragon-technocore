const $ = (s) => document.querySelector(s);
const SESSION_KEY = "reddragon-imported-public-proof";
const PENDING_KEY = "reddragon-pending-public-proof";
const PROGRESS_KEY = "reddragon-progress";
const DID_PROGRESS_PREFIX = "reddragon-public-progress:";
const RECEIPT_PREFIX = "reddragon-signed-contribution:";
const MAX_PROOF_BYTES = 256 * 1024;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const te = new TextEncoder();

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 6000);
}

function activeDid() {
  const did = $("#vaultDid")?.textContent?.trim() || "";
  return did === "—" ? "" : did;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
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
    if (n < 0) throw new Error("DID base58 değeri geçersiz.");
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
  if (!String(did).startsWith(prefix)) throw new Error("Geçerli did:key değil.");
  const decoded = base58Decode(String(did).slice(prefix.length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("Ed25519 did:key bekleniyordu.");
  }
  return decoded.slice(2);
}

async function verifySignedRecord(record, did) {
  if (!record?.sig || !record?.nonce || !record?.room || !record?.text) return false;
  if (record.did && record.did !== did) return false;
  try {
    const raw = rawPublicKeyFromDid(did);
    const key = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    const payload = te.encode(`${record.room}|${record.nonce}|${cleanText(record.text)}`);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, b64uToBytes(record.sig), payload);
  } catch (e) {
    console.error(e);
    return false;
  }
}

function hasSensitiveMaterial(value, key = "") {
  const canonical = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  const sensitiveKeys = new Set([
    "privatekey", "privatekeypkcs8", "privatekeyraw", "pkcs8",
    "seed", "seedphrase", "walletseed", "mnemonic",
    "secret", "secretkey", "ciphertext", "ciphertextb64u", "saltb64u", "ivb64u"
  ]);
  if (sensitiveKeys.has(canonical)) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => hasSensitiveMaterial(v));
  return Object.entries(value).some(([childKey, childValue]) => hasSensitiveMaterial(childValue, childKey));
}

function validateProof(proof) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) throw new Error("Geçerli bir public proof JSON değil.");
  if (proof.format === "reddragon-technocore-identity" || proof.ciphertextB64u) {
    throw new Error("Bu kimlik/key yedeği. Public proof dosyasını seç.");
  }
  if (hasSensitiveMaterial(proof)) throw new Error("Dosyada gizli anahtar benzeri alan bulundu; güvenlik için içe aktarılmadı.");
  if (!/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/.test(String(proof.did || ""))) throw new Error("Proof içinde geçerli Ed25519 DID yok.");

  const record = proof?.contribution?.record;
  const room = String(record?.room || "technocore");
  const seq = Number(record?.seq);
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(room) || !Number.isSafeInteger(seq) || seq <= 0) {
    throw new Error("Proof içinde doğrulanabilir contribution record bulunamadı.");
  }
  if (!cleanText(record?.text)) throw new Error("Proof contribution metni eksik; güvenli doğrulama yapılamıyor.");
  return { proof, record, room, seq };
}

function messagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function messageSeq(m) {
  const n = Number(m?.seq ?? m?.sequence ?? m?.id);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

function messageDid(m) {
  return String(m?.did || m?.from || m?.author || "");
}

function messageText(m) {
  return cleanText(m?.text ?? m?.message ?? m?.body ?? "");
}

async function readRoom(room, since) {
  const body = { action: "read", room };
  if (since != null) body.since = String(since);
  const response = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Technocore doğrulaması başarısız (${response.status}).`);
  const parsed = safeJsonParse(text);
  if (!parsed) throw new Error("Technocore doğrulama yanıtı JSON değildi.");
  return parsed;
}

function verifyMessage(message, proof, record) {
  if (!message) return false;
  if (messageDid(message) !== proof.did) return false;
  return messageText(message) === cleanText(record.text);
}

function verifyContributionFields(message, proof) {
  if (!message || messageDid(message) !== proof.did) return false;
  const text = messageText(message);
  const c = proof?.contribution || {};
  const required = [c.url, c.title, c.summary].map(cleanText).filter(Boolean);
  if (!text.startsWith("Contribution |")) return false;
  if (!text.includes(`DID ${proof.did}`)) return false;
  return required.every((part) => text.includes(part));
}

function upgradedProof(original, record, matchedSeq, matchedText = "", verification = "technocore-live") {
  const proof = JSON.parse(JSON.stringify(original));
  proof.proofFormat = "reddragon-public-proof-v2";
  proof.contribution = proof.contribution || {};
  proof.contribution.record = {
    ...record,
    seq: String(matchedSeq),
    text: matchedText || record.text,
    verification,
    verifiedAt: new Date().toISOString()
  };
  proof.generatedAt = new Date().toISOString();
  return proof;
}

async function verifyContribution({ proof, record, room, seq }) {
  const aroundOldData = await readRoom(room, Math.max(0, seq - 1));
  const aroundOld = messagesFrom(aroundOldData);
  const exact = aroundOld.find((m) => messageSeq(m) === seq);
  if (exact) {
    if (!verifyMessage(exact, proof, record)) throw new Error("Contribution kaydı var ama DID/metin bu proof ile eşleşmiyor.");
    return { proof: upgradedProof(proof, record, seq, messageText(exact)), seq, recovered: false };
  }

  if (await verifySignedRecord(record, proof.did)) {
    return {
      proof: upgradedProof(proof, record, seq, record.text, "offline-ed25519-signature"),
      seq,
      recovered: true,
      oldSeq: seq,
      offline: true
    };
  }

  const recentData = await readRoom(room);
  const recent = messagesFrom(recentData);
  const matches = recent
    .filter((m) => verifyMessage(m, proof, record) || verifyContributionFields(m, proof))
    .map((m) => ({ message: m, seq: messageSeq(m) }))
    .filter((x) => x.seq > 0)
    .sort((a, b) => b.seq - a.seq);

  if (!matches.length) {
    const first = Number(aroundOldData?.first_seq || recentData?.first_seq || 0);
    if (first && first > seq) {
      throw new Error(`Technocore ring buffer bu kaydı artık tutmuyor (aranan #${seq}, eldeki en eski #${first}). Eski proof'ta imza olmadığı için geriye dönük kriptografik doğrulama mümkün değil.`);
    }
    throw new Error(`Contribution #${seq} şu an Technocore yanıtında yok. Eski proof'ta imza olmadığı için güvenli biçimde Tamam işaretlenmedi.`);
  }

  const latest = matches[0];
  return {
    proof: upgradedProof(proof, record, latest.seq, messageText(latest.message)),
    seq: latest.seq,
    recovered: true,
    oldSeq: seq
  };
}

async function verifyKnownSeq(proof, targetSeq) {
  const validated = validateProof(proof);
  const seq = Number(targetSeq);
  if (!Number.isSafeInteger(seq) || seq <= 0) throw new Error("Geçerli bir contribution sequence gir.");
  const data = await readRoom(validated.room, Math.max(0, seq - 1));
  const rows = messagesFrom(data);
  const hit = rows.find((m) => messageSeq(m) === seq);
  if (!hit) {
    const first = Number(data?.first_seq || 0);
    if (first && first > seq) throw new Error(`#${seq} Technocore ring buffer'dan düşmüş; en eski mevcut kayıt #${first}.`);
    throw new Error(`Contribution #${seq} Technocore yanıtında bulunamadı.`);
  }
  if (!(verifyMessage(hit, validated.proof, validated.record) || verifyContributionFields(hit, validated.proof))) {
    throw new Error(`Contribution #${seq} bulundu ama DID/katkı bilgileri bu proof ile eşleşmiyor.`);
  }
  return upgradedProof(validated.proof, validated.record, seq, messageText(hit));
}

function parseResponseSeq(text, reqBody) {
  const parsed = safeJsonParse(text);
  if (parsed) {
    const msgs = messagesFrom(parsed);
    const exact = msgs.filter((m) => messageDid(m) === reqBody.did && String(m?.nonce ?? "") === String(reqBody.nonce)).pop();
    if (exact && messageSeq(exact)) return String(messageSeq(exact));
    if (Number.isSafeInteger(Number(parsed.last_seq)) && Number(parsed.last_seq) > 0) return String(parsed.last_seq);
  }
  const s = String(text || "");
  const matches = [...s.matchAll(/(?:seq|sequence|#)\s*[:=]?\s*(\d+)/gi)];
  if (matches.length) return matches[matches.length - 1][1];
  return "";
}

function receiptKey(did) {
  return RECEIPT_PREFIX + did;
}

function progressKey(did) {
  return DID_PROGRESS_PREFIX + did;
}

function saveReceipt(receipt) {
  try { localStorage.setItem(receiptKey(receipt.did), JSON.stringify(receipt)); } catch {}
}

function loadReceipt(did) {
  try { return safeJsonParse(localStorage.getItem(receiptKey(did)) || ""); } catch { return null; }
}

function readDone() {
  try {
    const arr = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter(Number.isInteger) : []);
  } catch {
    return new Set();
  }
}

function readDidDone(did) {
  try {
    const arr = JSON.parse(localStorage.getItem(progressKey(did)) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter(Number.isInteger) : []);
  } catch { return new Set(); }
}

function saveDidDone(did, done) {
  if (!did) return;
  try { localStorage.setItem(progressKey(did), JSON.stringify([...done].filter(Number.isInteger))); } catch {}
}

function addProofProgress(done, proof) {
  if (proof.didNote) done.add(3);
  if (proof.lobbyHello) done.add(4);
  if (proof.lobbyIntro) done.add(5);
  if (proof.publicRoom) done.add(6);
  if (proof.privateRoomCreated) done.add(7);
  if (proof.profileStyle) done.add(8);
  done.add(9);
  done.add(10);
}

function renderProgress(done) {
  for (let i = 1; i <= 10; i++) {
    const isDone = done.has(i);
    const status = $("#s" + i);
    if (status) {
      status.textContent = isDone ? "Tamam" : "Bekliyor";
      status.classList.toggle("done", isDone);
    }
    document.querySelector(`[data-stepchip="${i}"]`)?.classList.toggle("done", isDone);
  }
  const count = [...done].filter((n) => n >= 1 && n <= 10).length;
  const pct = Math.round((count / 10) * 100);
  const ring = $("#progressRing");
  if (ring) ring.style.setProperty("--pct", pct + "%");
  const strong = $("#progressRing strong");
  if (strong) strong.textContent = pct + "%";
}

function persistVisibleProgress() {
  const did = activeDid();
  if (!did) return;
  const done = readDidDone(did);
  for (let i = 1; i <= 10; i++) {
    if ($("#s" + i)?.textContent?.trim() === "Tamam") done.add(i);
  }
  saveDidDone(did, done);
}

function restoreDidProgress() {
  const did = activeDid();
  if (!did) return;
  const saved = readDidDone(did);
  if (!saved.size) return;
  const done = readDone();
  for (const n of saved) done.add(n);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
  renderProgress(done);
}

function proofFromReceipt(receipt, baseProof = null) {
  const proof = baseProof && typeof baseProof === "object" ? JSON.parse(JSON.stringify(baseProof)) : {};
  proof.proofFormat = "reddragon-public-proof-v2";
  proof.tool = proof.tool || "RedDragon Technocore Agent Lab";
  proof.owner = proof.owner || window.APP_CONFIG?.xHandle || "";
  proof.notice = proof.notice || "Portable signed contribution proof. Private key is never included.";
  proof.generatedAt = new Date().toISOString();
  proof.did = receipt.did;
  proof.fingerprint = proof.fingerprint || $("#vaultFp")?.textContent?.trim() || null;
  proof.contribution = {
    ...(proof.contribution || {}),
    url: receipt.url || proof?.contribution?.url || null,
    title: receipt.title || proof?.contribution?.title || null,
    type: receipt.type || proof?.contribution?.type || "Tool / Code",
    summary: receipt.summary || proof?.contribution?.summary || null,
    record: {
      room: receipt.room,
      seq: receipt.seq,
      did: receipt.did,
      sig: receipt.sig,
      nonce: receipt.nonce,
      text: receipt.text,
      capturedAt: receipt.capturedAt,
      verification: "offline-ed25519-signature"
    }
  };
  return proof;
}

function currentBaseProof() {
  const raw = $("#proofText")?.value || "";
  const parsed = safeJsonParse(raw);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function applyProof(proof, { persist = true, statusLabel = "Imported + verified contribution" } = {}) {
  const currentDid = activeDid();
  if (!currentDid) throw new Error("Önce DID oluştur veya şifreli kimlik yedeğini geri yükle.");
  if (currentDid !== proof.did) throw new Error("Bu proof başka bir DID'e ait; mevcut kimlikle eşleşmiyor.");

  const c = proof.contribution || {};
  const r = c.record || {};
  if ($("#clink") && c.url) $("#clink").value = c.url;
  if ($("#ctitle") && c.title) $("#ctitle").value = c.title;
  if ($("#csummary") && c.summary) $("#csummary").value = c.summary;
  if ($("#ctype") && c.type) $("#ctype").value = c.type;
  if ($("#proofText")) $("#proofText").value = JSON.stringify(proof, null, 2);
  if ($("#vaultContrib")) $("#vaultContrib").textContent = String(r.seq || "—");
  if ($("#contribOut")) $("#contribOut").textContent = `${statusLabel} · ${r.room || "technocore"} · seq ${r.seq || "signed"}`;

  const done = readDone();
  addProofProgress(done, proof);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
  saveDidDone(currentDid, done);
  renderProgress(done);

  ["copyProof", "downloadProof", "xShare"].forEach((id) => {
    const el = $("#" + id);
    if (el) el.disabled = false;
  });

  if (persist) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(proof)); } catch {}
  }
}

async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_PROOF_BYTES) return toast("Proof dosyası beklenenden büyük; güvenlik için reddedildi.");
  try {
    const parsed = JSON.parse(await file.text());
    const validated = validateProof(parsed);
    if (!activeDid()) throw new Error("Önce DID oluştur veya yedeği geri yükle, sonra proof'u içe aktar.");
    if (activeDid() !== validated.proof.did) throw new Error("Seçtiğin proof mevcut DID ile eşleşmiyor.");
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(validated.proof)); } catch {}

    toast("Proof doğrulanıyor...");
    const verified = await verifyContribution(validated);
    applyProof(verified.proof, {
      statusLabel: verified.offline ? "İmza yerel olarak doğrulandı" : "Technocore üzerinde doğrulandı"
    });
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    if (verified.offline) {
      toast(`Technocore eski kaydı silmiş olabilir; Ed25519 imzası doğrulandı · 09/10 geri yüklendi`);
    } else if (verified.recovered) {
      toast(`Eski proof güncellendi · #${verified.oldSeq} yerine #${verified.seq} bulundu · 09/10 geri yüklendi`);
    } else {
      toast(`Public proof doğrulandı · contribution #${verified.seq} · 09/10 geri yüklendi`);
    }
  } catch (error) {
    console.error(error);
    toast(error?.message || "Proof içe aktarılamadı.");
  }
}

async function verifyManualSeq() {
  try {
    const seq = $("#rdKnownSeq")?.value?.trim();
    let proof;
    try { proof = JSON.parse(sessionStorage.getItem(PENDING_KEY) || sessionStorage.getItem(SESSION_KEY) || "null"); } catch {}
    if (!proof) throw new Error("Önce yukarıdaki butondan eski Public Proof JSON dosyanı seç.");
    if (proof.did !== activeDid()) throw new Error("Proof DID'i açık kimlikle eşleşmiyor.");
    toast(`#${seq} Technocore üzerinde doğrulanıyor...`);
    const upgraded = await verifyKnownSeq(proof, seq);
    applyProof(upgraded, { statusLabel: "Technocore üzerinde doğrulandı" });
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    toast(`Contribution #${seq} doğrulandı · 09/10 geri yüklendi`);
  } catch (error) {
    console.error(error);
    toast(error?.message || "Sequence doğrulanamadı.");
  }
}

function installFetchCapture() {
  if (window.__rdFetchCaptureInstalled) return;
  window.__rdFetchCaptureInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    let relayBody = null;
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      const options = args[1] || {};
      if (String(url || "").includes("/api/relay") && typeof options.body === "string") {
        relayBody = safeJsonParse(options.body);
      }
    } catch {}

    const response = await originalFetch(...args);

    try {
      if (response.ok && relayBody?.action === "signedPost" && cleanText(relayBody.text).startsWith("Contribution |")) {
        const cloned = response.clone();
        const responseText = await cloned.text();
        const seq = parseResponseSeq(responseText, relayBody);
        const receipt = {
          format: "reddragon-signed-contribution-receipt",
          version: 1,
          capturedAt: new Date().toISOString(),
          did: String(relayBody.did || ""),
          room: String(relayBody.room || "technocore"),
          seq,
          sig: String(relayBody.sig || ""),
          nonce: String(relayBody.nonce || ""),
          text: cleanText(relayBody.text),
          url: $("#clink")?.value?.trim() || null,
          title: $("#ctitle")?.value?.trim() || null,
          type: $("#ctype")?.value || null,
          summary: cleanText($("#csummary")?.value) || null
        };
        if (receipt.did && receipt.sig && receipt.nonce && receipt.text) {
          saveReceipt(receipt);
          const done = readDidDone(receipt.did);
          done.add(9); done.add(10);
          saveDidDone(receipt.did, done);
          setTimeout(async () => {
            const ok = await verifySignedRecord(receipt, receipt.did);
            if (!ok) return;
            const proof = proofFromReceipt(receipt, currentBaseProof());
            try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(proof)); } catch {}
            if (activeDid() === receipt.did) applyProof(proof, { statusLabel: "Kalıcı Ed25519 imzalı contribution" });
          }, 50);
        }
      }
    } catch (e) {
      console.error("RedDragon proof capture", e);
    }

    return response;
  };
}

function downloadJson(name, obj) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function installDurableProofButtons() {
  const did = activeDid();
  if (!did) return;
  const receipt = loadReceipt(did);
  if (!receipt) return;

  const downloadBtn = $("#downloadProof");
  if (downloadBtn && !downloadBtn.dataset.rdDurable) {
    downloadBtn.dataset.rdDurable = "1";
    downloadBtn.onclick = async () => {
      if (!(await verifySignedRecord(receipt, did))) return toast("Yerel signed receipt doğrulanamadı.");
      const proof = proofFromReceipt(receipt, currentBaseProof());
      downloadJson(`reddragon-proof-${($("#vaultFp")?.textContent || "proof").trim()}.json`, proof);
      toast("Kalıcı imzalı Public Proof indirildi");
    };
  }

  const copyBtn = $("#copyProof");
  if (copyBtn && !copyBtn.dataset.rdDurable) {
    copyBtn.dataset.rdDurable = "1";
    copyBtn.onclick = async () => {
      if (!(await verifySignedRecord(receipt, did))) return toast("Yerel signed receipt doğrulanamadı.");
      const proof = proofFromReceipt(receipt, currentBaseProof());
      await navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
      toast("Kalıcı imzalı proof kopyalandı");
    };
  }
}

async function restoreDurableReceipt() {
  const did = activeDid();
  if (!did) return;
  const receipt = loadReceipt(did);
  if (!receipt || receipt.__restored) return;
  if (!(await verifySignedRecord(receipt, did))) return;
  receipt.__restored = true;
  saveReceipt(receipt);
  const proof = proofFromReceipt(receipt, currentBaseProof());
  applyProof(proof, { statusLabel: "Yerel Ed25519 imzasından geri yüklendi" });
}

function installUi() {
  const card = document.querySelector('[data-step="10"]');
  if (!card || $("#rdProofImport")) return;

  const box = document.createElement("div");
  box.id = "rdProofImport";
  box.className = "rd-security-note";

  const title = document.createElement("b");
  title.textContent = "Public proof'u geri yükle";
  const desc = document.createElement("span");
  desc.textContent = " Yeni proof'lar Ed25519 imzasını da içerir; Technocore ring buffer eski mesajı silse bile imza yerel olarak doğrulanabilir. Eski v1 proof'lar yalnızca kayıt hâlâ Technocore'da duruyorsa doğrulanabilir.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Public Proof JSON içe aktar";
  button.style.marginTop = "12px";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  input.addEventListener("change", () => importFile(input.files?.[0]));
  button.addEventListener("click", () => {
    input.value = "";
    input.click();
  });

  const manual = document.createElement("div");
  manual.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px";
  const seqInput = document.createElement("input");
  seqInput.id = "rdKnownSeq";
  seqInput.type = "text";
  seqInput.inputMode = "numeric";
  seqInput.autocomplete = "off";
  seqInput.placeholder = "Eski proof için bilinen seq";
  seqInput.style.cssText = "min-width:260px;flex:1";
  const seqButton = document.createElement("button");
  seqButton.type = "button";
  seqButton.textContent = "Seq ile kontrol et";
  seqButton.addEventListener("click", verifyManualSeq);
  manual.append(seqInput, seqButton);

  const note = document.createElement("div");
  note.style.cssText = "margin-top:10px;font-size:12px;opacity:.78";
  note.textContent = "Not: Technocore odaları kalıcı arşiv değildir. Yeni sürüm bu yüzden signed receipt'i tarayıcıda yalnızca public veri olarak saklar; private key hiçbir zaman localStorage'a yazılmaz.";

  box.append(title, desc, document.createElement("br"), button, input, manual, note);
  card.appendChild(box);
}

function trySessionRestore() {
  if (!activeDid()) return;
  let proof;
  try { proof = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return; }
  if (!proof || proof.did !== activeDid()) return;
  try { applyProof(proof, { persist: false }); } catch {}
}

installFetchCapture();

window.addEventListener("load", () => {
  installUi();
  let attempts = 0;
  const timer = setInterval(async () => {
    installUi();
    trySessionRestore();
    restoreDidProgress();
    persistVisibleProgress();
    await restoreDurableReceipt();
    installDurableProofButtons();
    if (++attempts > 600) clearInterval(timer);
  }, 1000);
});
