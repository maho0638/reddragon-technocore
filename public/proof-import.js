const $ = (s) => document.querySelector(s);
const SESSION_KEY = "reddragon-imported-public-proof";
const PROGRESS_KEY = "reddragon-progress";
const MAX_PROOF_BYTES = 256 * 1024;

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 3200);
}

function activeDid() {
  const did = $("#vaultDid")?.textContent?.trim() || "";
  return did === "—" ? "" : did;
}

function hasSensitiveMaterial(value, key = "") {
  const k = String(key).toLowerCase();
  if (/private|pkcs8|seed|secret|ciphertext|saltb64u|ivb64u/.test(k)) return true;
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
  return { proof, record, room, seq };
}

function messagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function verifyContribution({ proof, record, room, seq }) {
  const response = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "read", room, since: String(Math.max(0, seq - 1)) })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Technocore doğrulaması başarısız (${response.status}).`);

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("Technocore doğrulama yanıtı JSON değildi."); }

  const message = messagesFrom(data).find((m) => Number(m?.seq) === seq);
  if (!message) throw new Error(`Contribution #${seq} Technocore yanıtında bulunamadı.`);

  const messageDid = String(message?.did || message?.from || "");
  if (messageDid !== proof.did) throw new Error("Contribution DID'i bu proof DID'i ile eşleşmiyor.");

  if (record?.text && message?.text && String(record.text).trim() !== String(message.text).trim()) {
    throw new Error("Contribution metni public proof ile eşleşmiyor.");
  }
  return true;
}

function readDone() {
  try {
    const arr = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter(Number.isInteger) : []);
  } catch {
    return new Set();
  }
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
  done.add(9);
  done.add(10);
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

    toast("Proof Technocore üzerinde doğrulanıyor...");
    await verifyContribution(validated);
    applyProof(validated.proof);
    toast(`Public proof doğrulandı · contribution #${validated.seq} · 09/10 geri yüklendi`);
  } catch (error) {
    console.error(error);
    toast(error?.message || "Proof içe aktarılamadı.");
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
  desc.textContent = " Yalnızca public proof JSON kabul edilir. DID eşleşir ve contribution Technocore'da doğrulanırsa 09 + 10 yeniden Tamam olur. Private key/key yedeği kabul edilmez.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Public Proof JSON içe aktar";
  button.style.marginTop = "12px";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  input.addEventListener("change", () => importFile(input.files?.[0]));
  button.addEventListener("click", () => input.click());

  box.append(title, desc, document.createElement("br"), button, input);
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
