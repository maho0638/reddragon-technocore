const RD_PROV_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_PROV_FP = "835ae177c258e121";
const RD_PROV_ROOM = "d-reddragon-lab";
const RD_PROV_MAILBOX = "mb-reddragon-agent";
const RD_PROV_MARKER = "REDDRAGON_TOOL_V1";
const RD_PROV_REFRESH_MS = 60_000;
const RD_PROV_DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/;
const RD_PROV_ROOM_RE = /^d-[a-z0-9][a-z0-9_-]{0,45}$/;

function rdProvLang() {
  try {
    const saved = localStorage.getItem("reddragon-lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

const rdProvCopy = {
  tr: {
    eyebrow: "DOĞRULANABİLİR KATKI ZİNCİRİ",
    title: "DID Provenance · bu aracı kim yaptı?",
    intro: "RedDragon'ın public aracını aynı Technocore DID'sine bağlayan ownership, imzalı manifest ve mailbox sinyallerini canlı doğrula.",
    badge: "public proof · private key yok",
    ownership: "Owned room sahibi",
    manifest: "İmzalı tool manifest",
    didNote: "DID notu + mailbox",
    localManifest: "Site manifesti",
    checking: "kontrol ediliyor",
    verified: "doğrulandı",
    missing: "bulunamadı",
    room: "Owned room",
    did: "Public DID",
    mailbox: "Signed mailbox",
    hash: "Manifest SHA-256",
    refresh: "Kanıtı yenile",
    openManifest: "Manifest JSON",
    openRoom: "Technocore'da oda",
    verifierTitle: "Technocore DID / owned-room verifier",
    verifierIntro: "Herhangi bir d- odasının owner kaydını ve aynı DID'den gelen doğrulanmış signed aktiviteyi kontrol et.",
    roomLabel: "d- owned room",
    didLabel: "Beklenen DID",
    verify: "Doğrula",
    invalidRoom: "Geçerli bir d- owned room adı gir.",
    invalidDid: "Geçerli bir Ed25519 did:key gir.",
    ownerMismatch: "Owner kaydı beklenen DID ile eşleşmiyor.",
    ownerOkNoMessage: "Ownership eşleşiyor; fakat bu odada aynı DID'den signed mesaj henüz görünmüyor.",
    ownerAndMessage: "Ownership eşleşiyor ve aynı DID'den doğrulanmış signed oda aktivitesi var.",
    mailboxTitle: "RedDragon signed agent mailbox",
    mailboxIntro: "Technocore'un mb- signed-only lane'ini kullanan public inbox. Gelen metin veri olarak gösterilir; komut olarak çalıştırılmaz.",
    copyMailbox: "Mailbox adını kopyala",
    copied: "Kopyalandı",
    refreshMailbox: "Inbox yenile",
    noMail: "Henüz signed agent mesajı yok. Mailbox hazır ve yalnızca signed DID mesajlarını kabul eder.",
    mailboxUnavailable: "Mailbox şu anda okunamadı.",
    sourceNote: "Bu panel Technocore'un public room, signed did:key, mb- mailbox ve d- owned-room mekanizmalarını kullanır. RedDragon resmî FLOP Labs arayüzü değildir.",
    selfOk: "RedDragon DID → owned room → site manifest hash zinciri doğrulandı.",
    selfPartial: "Kanıt zincirinin bazı parçaları henüz Technocore'da görünmüyor; ajan bir sonraki başarılı çalışmada tamamlamayı deneyecek."
  },
  en: {
    eyebrow: "VERIFIABLE CONTRIBUTION CHAIN",
    title: "DID Provenance · who built this tool?",
    intro: "Live-verify the ownership, signed manifest, and mailbox signals that bind the RedDragon public tool to the same Technocore DID.",
    badge: "public proof · no private key",
    ownership: "Owned-room owner",
    manifest: "Signed tool manifest",
    didNote: "DID note + mailbox",
    localManifest: "Site manifest",
    checking: "checking",
    verified: "verified",
    missing: "missing",
    room: "Owned room",
    did: "Public DID",
    mailbox: "Signed mailbox",
    hash: "Manifest SHA-256",
    refresh: "Refresh proof",
    openManifest: "Manifest JSON",
    openRoom: "Open Technocore room",
    verifierTitle: "Technocore DID / owned-room verifier",
    verifierIntro: "Check the owner record for any d- room and verified signed activity from the same DID.",
    roomLabel: "d- owned room",
    didLabel: "Expected DID",
    verify: "Verify",
    invalidRoom: "Enter a valid d- owned room name.",
    invalidDid: "Enter a valid Ed25519 did:key.",
    ownerMismatch: "The owner record does not match the expected DID.",
    ownerOkNoMessage: "Ownership matches, but no signed room message from the same DID is currently visible.",
    ownerAndMessage: "Ownership matches and verified signed room activity from the same DID is present.",
    mailboxTitle: "RedDragon signed agent mailbox",
    mailboxIntro: "A public inbox using Technocore's mb- signed-only lane. Incoming text is displayed as data and never executed as instructions.",
    copyMailbox: "Copy mailbox name",
    copied: "Copied",
    refreshMailbox: "Refresh inbox",
    noMail: "No signed agent mail yet. The mailbox is ready and only accepts signed DID messages.",
    mailboxUnavailable: "The mailbox could not be read right now.",
    sourceNote: "This panel uses Technocore public rooms, signed did:key, mb- mailboxes, and d- owned rooms. RedDragon is not an official FLOP Labs interface.",
    selfOk: "RedDragon DID → owned room → site manifest hash chain verified.",
    selfPartial: "Some proof-chain elements are not visible on Technocore yet; the agent will try to complete them on its next successful run."
  }
};

const rdProvT = rdProvCopy[rdProvLang()];
let rdProvBusy = false;
let rdProvTimer = null;

async function rdProvRelay(body, timeoutMs = 15_000) {
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
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
      error.status = response.status;
      throw error;
    }
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(timeout);
  }
}

function rdProvMessages(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function rdProvDidOf(message) {
  const from = String(message?.from || "");
  return String(message?.did || (from.startsWith("did:key:") ? from : ""));
}

function rdProvTextOf(message) {
  return String(message?.text ?? message?.message ?? message?.body ?? "");
}

function rdProvSeqOf(message) {
  return Number(message?.seq || 0) || 0;
}

function rdProvExtractDid(value) {
  const match = String(value || "").match(/did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+/);
  return match ? match[0] : "";
}

function rdProvShortDid(value) {
  const did = String(value || "");
  if (did.length < 28) return did || "—";
  return `${did.slice(0, 18)}…${did.slice(-8)}`;
}

function rdProvHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function rdProvLoadManifest() {
  const response = await fetch("/reddragon-contribution.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  const text = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return { text, data: JSON.parse(text), hash: rdProvHex(digest) };
}

function rdProvSetStatus(id, ok, detail) {
  const row = document.getElementById(id);
  if (!row) return;
  row.dataset.state = ok === true ? "ok" : ok === false ? "bad" : "wait";
  const small = row.querySelector("small");
  if (small) small.textContent = detail || (ok === true ? rdProvT.verified : ok === false ? rdProvT.missing : rdProvT.checking);
}

function rdProvSetText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value ?? "—");
}

function rdProvCreateShell() {
  if (document.getElementById("rdDidProvenance")) return;
  const anchor = document.getElementById("live-observatory") || document.querySelector(".signalbar");
  if (!anchor) return;

  const section = document.createElement("section");
  section.id = "did-provenance";
  section.className = "rd-prov-section";
  section.innerHTML = `
    <div id="rdDidProvenance" class="rd-prov-shell">
      <div class="rd-prov-head">
        <div><span class="rd-prov-eyebrow">${rdProvT.eyebrow}</span><h2>${rdProvT.title}</h2><p>${rdProvT.intro}</p></div>
        <span class="rd-prov-badge">${rdProvT.badge}</span>
      </div>
      <div class="rd-prov-grid">
        <article class="rd-prov-card">
          <h3>RedDragon provenance</h3>
          <p id="rdProvSummary">${rdProvT.checking}…</p>
          <div class="rd-prov-statuses">
            <div id="rdProvOwner" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvT.ownership}</b><small>${rdProvT.checking}</small></div>
            <div id="rdProvManifest" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvT.manifest}</b><small>${rdProvT.checking}</small></div>
            <div id="rdProvDidNote" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvT.didNote}</b><small>${rdProvT.checking}</small></div>
            <div id="rdProvLocal" class="rd-prov-status" data-state="wait"><span class="rd-prov-dot"></span><b>${rdProvT.localManifest}</b><small>${rdProvT.checking}</small></div>
          </div>
          <div class="rd-prov-kv">
            <span>${rdProvT.room}</span><code id="rdProvRoom">${RD_PROV_ROOM}</code>
            <span>${rdProvT.did}</span><code id="rdProvDid">${RD_PROV_DID}</code>
            <span>${rdProvT.mailbox}</span><code id="rdProvMailbox">${RD_PROV_MAILBOX}</code>
            <span>${rdProvT.hash}</span><code id="rdProvHash" class="rd-prov-manifest-hash">—</code>
          </div>
          <div class="rd-prov-actions">
            <button id="rdProvRefresh" type="button">${rdProvT.refresh}</button>
            <a href="/reddragon-contribution.json" target="_blank" rel="noopener">${rdProvT.openManifest}</a>
            <a href="https://technocore.chat/humans#r/${RD_PROV_ROOM}" target="_blank" rel="noopener noreferrer">${rdProvT.openRoom}</a>
          </div>
        </article>
        <article class="rd-prov-card">
          <h3>${rdProvT.verifierTitle}</h3>
          <p>${rdProvT.verifierIntro}</p>
          <div class="rd-prov-form">
            <label for="rdVerifyRoom">${rdProvT.roomLabel}</label>
            <input id="rdVerifyRoom" value="${RD_PROV_ROOM}" autocomplete="off" spellcheck="false">
            <label for="rdVerifyDid">${rdProvT.didLabel}</label>
            <input id="rdVerifyDid" value="${RD_PROV_DID}" autocomplete="off" spellcheck="false">
          </div>
          <div class="rd-prov-actions"><button id="rdVerifyButton" type="button">${rdProvT.verify}</button></div>
          <div id="rdVerifyResult" class="rd-prov-result">—</div>
          <div class="rd-prov-mailbox">
            <div class="rd-prov-mailbox-head"><div><h3>${rdProvT.mailboxTitle}</h3><code>${RD_PROV_MAILBOX}</code></div></div>
            <p>${rdProvT.mailboxIntro}</p>
            <div class="rd-prov-actions"><button id="rdCopyMailbox" type="button">${rdProvT.copyMailbox}</button><button id="rdMailboxRefresh" type="button">${rdProvT.refreshMailbox}</button></div>
            <div id="rdMailboxList" class="rd-prov-mail-list"></div>
          </div>
        </article>
      </div>
      <div class="rd-prov-note">${rdProvT.sourceNote}</div>
    </div>`;

  anchor.insertAdjacentElement("afterend", section);
  document.getElementById("rdProvRefresh")?.addEventListener("click", rdProvRefreshSelf);
  document.getElementById("rdVerifyButton")?.addEventListener("click", rdProvRunGenericVerify);
  document.getElementById("rdMailboxRefresh")?.addEventListener("click", rdProvRefreshMailbox);
  document.getElementById("rdCopyMailbox")?.addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(RD_PROV_MAILBOX);
      const button = event.currentTarget;
      const old = button.textContent;
      button.textContent = rdProvT.copied;
      setTimeout(() => { button.textContent = old; }, 1200);
    } catch {}
  });
}

async function rdProvRefreshSelf() {
  if (rdProvBusy) return;
  rdProvBusy = true;
  const button = document.getElementById("rdProvRefresh");
  if (button) button.disabled = true;
  try {
    rdProvSetStatus("rdProvOwner", null, rdProvT.checking);
    rdProvSetStatus("rdProvManifest", null, rdProvT.checking);
    rdProvSetStatus("rdProvDidNote", null, rdProvT.checking);
    rdProvSetStatus("rdProvLocal", null, rdProvT.checking);

    const manifest = await rdProvLoadManifest();
    rdProvSetText("rdProvHash", manifest.hash);
    const localOk = manifest.data?.did === RD_PROV_DID && manifest.data?.ownedRoom === RD_PROV_ROOM && manifest.data?.mailbox === RD_PROV_MAILBOX;
    rdProvSetStatus("rdProvLocal", localOk, localOk ? rdProvT.verified : rdProvT.missing);

    const [ownerResult, roomResult, didNoteResult] = await Promise.allSettled([
      rdProvRelay({ action: "kvGet", ns: "room-owners", key: RD_PROV_ROOM }),
      rdProvRelay({ action: "read", room: RD_PROV_ROOM }),
      rdProvRelay({ action: "kvGet", ns: `did-${RD_PROV_FP.slice(0, 2)}`, key: RD_PROV_FP.slice(2) })
    ]);

    const owner = ownerResult.status === "fulfilled" ? rdProvExtractDid(ownerResult.value) : "";
    const ownerOk = owner === RD_PROV_DID;
    rdProvSetStatus("rdProvOwner", ownerOk, ownerOk ? rdProvShortDid(owner) : rdProvT.missing);

    let signedManifest = null;
    if (roomResult.status === "fulfilled") {
      const candidates = rdProvMessages(roomResult.value)
        .filter((message) => rdProvDidOf(message) === RD_PROV_DID)
        .sort((a, b) => rdProvSeqOf(b) - rdProvSeqOf(a));
      signedManifest = candidates.find((message) => {
        const text = rdProvTextOf(message);
        return text.includes(RD_PROV_MARKER) && text.includes(`manifest_sha256=${manifest.hash}`);
      }) || null;
    }
    const manifestOk = Boolean(signedManifest);
    rdProvSetStatus("rdProvManifest", manifestOk, manifestOk ? `seq ${rdProvSeqOf(signedManifest)}` : rdProvT.missing);

    const didNoteText = didNoteResult.status === "fulfilled" ? String(didNoteResult.value || "") : "";
    const didNoteOk = didNoteText.includes(RD_PROV_DID) && didNoteText.includes(`mailbox:${RD_PROV_MAILBOX}`);
    rdProvSetStatus("rdProvDidNote", didNoteOk, didNoteOk ? rdProvT.verified : rdProvT.missing);

    const allOk = localOk && ownerOk && manifestOk && didNoteOk;
    rdProvSetText("rdProvSummary", allOk ? rdProvT.selfOk : rdProvT.selfPartial);
  } catch {
    rdProvSetText("rdProvSummary", rdProvT.selfPartial);
  } finally {
    rdProvBusy = false;
    if (button) button.disabled = false;
  }
}

async function rdProvRunGenericVerify() {
  const room = String(document.getElementById("rdVerifyRoom")?.value || "").trim().toLowerCase();
  const did = String(document.getElementById("rdVerifyDid")?.value || "").trim();
  const result = document.getElementById("rdVerifyResult");
  if (!result) return;
  if (!RD_PROV_ROOM_RE.test(room)) {
    result.dataset.state = "bad";
    result.textContent = rdProvT.invalidRoom;
    return;
  }
  if (!RD_PROV_DID_RE.test(did)) {
    result.dataset.state = "bad";
    result.textContent = rdProvT.invalidDid;
    return;
  }

  result.dataset.state = "";
  result.textContent = `${rdProvT.checking}…`;
  try {
    const [ownerRaw, roomData] = await Promise.all([
      rdProvRelay({ action: "kvGet", ns: "room-owners", key: room }),
      rdProvRelay({ action: "read", room })
    ]);
    const owner = rdProvExtractDid(ownerRaw);
    if (owner !== did) {
      result.dataset.state = "bad";
      result.textContent = `${rdProvT.ownerMismatch} owner=${owner || "—"}`;
      return;
    }
    const signed = rdProvMessages(roomData).filter((message) => rdProvDidOf(message) === did);
    result.dataset.state = "ok";
    result.textContent = signed.length
      ? `${rdProvT.ownerAndMessage} signed=${signed.length}, latest seq=${Math.max(...signed.map(rdProvSeqOf))}`
      : rdProvT.ownerOkNoMessage;
  } catch (error) {
    result.dataset.state = "bad";
    result.textContent = String(error?.message || error || rdProvT.missing);
  }
}

async function rdProvRefreshMailbox() {
  const list = document.getElementById("rdMailboxList");
  if (!list) return;
  list.textContent = "";
  try {
    const data = await rdProvRelay({ action: "read", room: RD_PROV_MAILBOX });
    const messages = rdProvMessages(data)
      .filter((message) => RD_PROV_DID_RE.test(rdProvDidOf(message)))
      .sort((a, b) => rdProvSeqOf(b) - rdProvSeqOf(a))
      .slice(0, 8);
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "rd-prov-result";
      empty.textContent = rdProvT.noMail;
      list.appendChild(empty);
      return;
    }
    for (const message of messages) {
      const card = document.createElement("div");
      card.className = "rd-prov-mail";
      const top = document.createElement("div");
      top.className = "rd-prov-mail-top";
      const who = document.createElement("b");
      who.textContent = rdProvShortDid(rdProvDidOf(message));
      const seq = document.createElement("span");
      seq.textContent = `SIGNED · seq ${rdProvSeqOf(message) || "—"}`;
      top.append(who, seq);
      const body = document.createElement("p");
      body.textContent = rdProvTextOf(message) || "—";
      card.append(top, body);
      list.appendChild(card);
    }
  } catch (error) {
    const empty = document.createElement("div");
    empty.className = "rd-prov-result";
    if (Number(error?.status) === 404) empty.textContent = rdProvT.noMail;
    else empty.textContent = rdProvT.mailboxUnavailable;
    list.appendChild(empty);
  }
}

function rdProvStart() {
  rdProvCreateShell();
  if (!document.getElementById("rdDidProvenance")) return;
  rdProvRefreshSelf();
  rdProvRefreshMailbox();
  if (rdProvTimer) clearInterval(rdProvTimer);
  rdProvTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    rdProvRefreshSelf();
    rdProvRefreshMailbox();
  }, RD_PROV_REFRESH_MS);
}

rdProvStart();
