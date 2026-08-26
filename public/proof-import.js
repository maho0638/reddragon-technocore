const $ = (s) => document.querySelector(s);
const SESSION_KEY = "reddragon-imported-public-proof";
const PENDING_KEY = "reddragon-pending-public-proof";
const PROGRESS_KEY = "reddragon-progress";
const MAX_PROOF_BYTES = 256 * 1024;

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 5200);
}

function activeDid() {
  const did = $("#vaultDid")?.textContent?.trim() || "";
  return did === "—" ? "" : did;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  try { return JSON.parse(text); }
  catch { throw new Error("Technocore doğrulama yanıtı JSON değildi."); }
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
  const required = [c.url, c.title, c.summary]
    .map(cleanText)
    .filter(Boolean);
  if (!text.startsWith("Contribution |")) return false;
  if (!text.includes(`DID ${proof.did}`)) return false;
  return required.every((part) => text.includes(part));
}

function upgradedProof(original, record, matchedSeq, matchedText = "") {
  const proof = JSON.parse(JSON.stringify(original));
  proof.contribution = proof.contribution || {};
  proof.contribution.record = {
    ...record,
    seq: String(matchedSeq),
    text: matchedText || record.text,
    recoveredFromSeq: String(record.seq),
    verifiedAt: new Date().toISOString()
  };
  proof.generatedAt = new Date().toISOString();
  return proof;
}

async function verifyContribution({ proof, record, room, seq }) {
  const aroundOld = messagesFrom(await readRoom(room, Math.max(0, seq - 1)));
  const exact = aroundOld.find((m) => messageSeq(m) === seq);
  if (exact) {
    if (!verifyMessage(exact, proof, record)) throw new Error("Contribution kaydı var ama DID/metin bu proof ile eşleşmiyor.");
    return { proof, seq, recovered: false };
  }

  const recent = messagesFrom(await readRoom(room));
  const matches = recent
    .filter((m) => verifyMessage(m, proof, record) || verifyContributionFields(m, proof))
    .map((m) => ({ message: m, seq: messageSeq(m) }))
    .filter((x) => x.seq > 0)
    .sort((a, b) => b.seq - a.seq);

  if (!matches.length) {
    throw new Error(`Eski contribution #${seq} artık görünmüyor. Yeni sequence'i biliyorsan alttaki alana yazıp doğrudan doğrula.`);
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
  const rows = messagesFrom(await readRoom(validated.room, Math.max(0, seq - 1)));
  const hit = rows.find((m) => messageSeq(m) === seq);
  if (!hit) throw new Error(`Contribution #${seq} Technocore yanıtında bulunamadı.`);
  if (!(verifyMessage(hit, validated.proof, validated.record) || verifyContributionFields(hit, validated.proof))) {
    throw new Error(`Contribution #${seq} bulundu ama DID/katkı bilgileri bu proof ile eşleşmiyor.`);
  }
  return upgradedProof(validated.proof, validated.record, seq, messageText(hit));
}

function readDone() {
  try {
    const arr = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter(Number.isInteger) : []);
  } catch {
    return new Set();
  }
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

function applyProof(proof, { persist = true } = {}) {
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
  if ($("#contribOut")) $("#contribOut").textContent = `Imported + verified contribution · ${r.room || "technocore"} · seq ${r.seq}`;

  const done = readDone();
  addProofProgress(done, proof);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
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

    toast("Proof Technocore üzerinde doğrulanıyor...");
    const verified = await verifyContribution(validated);
    applyProof(verified.proof);
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    if (verified.recovered) {
      toast(`Eski proof güncellendi · #${verified.oldSeq} yerine doğrulanmış #${verified.seq} bulundu · 09/10 geri yüklendi`);
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
    applyProof(upgraded);
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    toast(`Contribution #${seq} doğrulandı · 09/10 geri yüklendi`);
  } catch (error) {
    console.error(error);
    toast(error?.message || "Sequence doğrulanamadı.");
  }
}

function installUi() {
  const card = document.querySelector('[data-step="10"]');
  if (!card || $("#rdProofImport")) return;

  const box = document.createElement("div");
  box.id = "rdProofImport";
  box.className = "rd-security-note";

  const title = document.createElement("b");
  title.textContent = "Eski public proof'u geri yükle";
  const desc = document.createElement("span");
  desc.textContent = " Public proof eski bir sequence içeriyorsa site aynı DID ve katkı bilgilerini Technocore'da doğrular. Private key/key yedeği kabul edilmez.";
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
  seqInput.placeholder = "Bilinen contribution seq (örn. 391880)";
  seqInput.style.cssText = "min-width:260px;flex:1";
  const seqButton = document.createElement("button");
  seqButton.type = "button";
  seqButton.textContent = "Seq ile doğrula";
  seqButton.addEventListener("click", verifyManualSeq);
  manual.append(seqInput, seqButton);

  box.append(title, desc, document.createElement("br"), button, input, manual);
  card.appendChild(box);
}

function trySessionRestore() {
  if (!activeDid()) return;
  let proof;
  try { proof = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return; }
  if (!proof || proof.did !== activeDid()) return;
  try {
    validateProof(proof);
    applyProof(proof, { persist: false });
  } catch {}
}

window.addEventListener("load", () => {
  installUi();
  let attempts = 0;
  const timer = setInterval(() => {
    installUi();
    trySessionRestore();
    if (++attempts > 120) clearInterval(timer);
  }, 1000);
});
