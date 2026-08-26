const cfg = window.APP_CONFIG || {};
const SITE_URL = cfg.siteUrl || location.origin;
const X_HANDLE = cfg.xHandle || "@joannawalker";
const X_USER = X_HANDLE.replace(/^@/, "");
const REPO_URL = cfg.githubRepoUrl || "https://github.com/maho0638/reddragon-technocore";
const MEDIUM_URL = cfg.mediumUrl || "https://medium.com/@ayazunal450";
const MEDIUM_WRITE_URL = cfg.mediumWriteUrl || "https://medium.com/new-story";

const $ = (s) => document.querySelector(s);

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2800);
}

async function copy(value, msg = "Kopyalandı") {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(msg);
}

function openExternal(url) {
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (w) w.opener = null;
}

function xIntent(text) {
  openExternal(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
}

function currentProof() {
  try { return JSON.parse($("#proofText")?.value || "{}"); } catch { return {}; }
}

function currentDid() {
  const proofDid = currentProof()?.did;
  const domDid = $("#vaultDid")?.textContent?.trim();
  return proofDid || (domDid && domDid !== "—" ? domDid : "");
}

function currentContribution() {
  const p = currentProof();
  return p?.contribution || {};
}

function recordText() {
  const r = currentProof()?.contribution?.record;
  if (!r?.seq) return "";
  return `${r.room || "technocore"} #${r.seq}`;
}

function siteShareText() {
  return `I’m exploring Technocore with RedDragon Agent Lab 🐉\n\nCreate a browser-local DID, sign public records and set up a 7/24 GitHub Actions agent.\n\n${SITE_URL}\n\n${X_HANDLE} @flop_labs #Technocore #FLOP`;
}

function proofShareText() {
  const did = currentDid();
  const record = recordText();
  if (!did) return siteShareText();
  return `Built my Technocore identity with RedDragon Agent Lab 🐉\n\nDID: ${did}${record ? `\nSigned record: ${record}` : ""}\n\n${SITE_URL}\n\n${X_HANDLE} @flop_labs #Technocore`;
}

function threadText() {
  const did = currentDid() || "YOUR_DID";
  const c = currentContribution();
  const record = recordText() || "pending";
  const t1 = `1/3 Built my Technocore identity with RedDragon Agent Lab 🐉\n\nBrowser-local DID + signed activity + secure GitHub Actions setup.\n\n${SITE_URL}\n\n${X_HANDLE} @flop_labs #Technocore`;
  const t2 = `2/3 My public Technocore DID:\n\n${did}\n\nThe private key stays local and is never included in public proof.`;
  const t3 = `3/3 Signed record: ${record}${c?.title ? `\nContribution: ${c.title}` : ""}${c?.url ? `\n${c.url}` : ""}\n\nBuilt with RedDragon Agent Lab · ${X_HANDLE}`;
  return [t1, t2, t3].join("\n\n---\n\n");
}

function mediumDraft() {
  const did = currentDid() || "YOUR_DID";
  const c = currentContribution();
  const record = recordText() || "pending";
  return `RedDragon Technocore Agent Lab — my signed agent identity\n\nI used RedDragon Technocore Agent Lab to create a separate Ed25519 did:key identity in the browser, keep an encrypted local backup, and publish signed Technocore activity.\n\nPublic DID\n${did}\n\nSigned record\n${record}\n\n${c?.title ? `Contribution\n${c.title}\n` : ""}${c?.url ? `${c.url}\n\n` : ""}Tool\n${SITE_URL}\n\nSource code\n${REPO_URL}\n\nProject account\n${X_HANDLE}\n\nSecurity note: the wallet seed phrase is never required. The Technocore private key is not included in this article or in public proof.`;
}

function addTopLinks() {
  const top = $(".top-actions");
  if (!top) return;
  if (!$("#githubLink")) {
    const a = document.createElement("a");
    a.id = "githubLink";
    a.href = REPO_URL;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = "GitHub";
    top.insertBefore(a, top.querySelector(".live"));
  }
  if (!$("#mediumLink")) {
    const a = document.createElement("a");
    a.id = "mediumLink";
    a.href = MEDIUM_URL;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = "Medium";
    top.insertBefore(a, top.querySelector(".live"));
  }
}

function addHeroSocial() {
  const host = $(".hero-actions");
  if (!host || $("#rdSocialStrip")) return;
  const strip = document.createElement("div");
  strip.id = "rdSocialStrip";
  strip.className = "rd-social-strip";
  strip.innerHTML = `
    <button type="button" id="rdShareSiteX">𝕏 Siteden paylaş</button>
    <a href="${REPO_URL}" target="_blank" rel="noreferrer">★ GitHub</a>
    <a href="${REPO_URL}/fork" target="_blank" rel="noreferrer">⑂ Fork</a>
    <a href="${MEDIUM_URL}" target="_blank" rel="noreferrer">M Medium</a>
    <a href="https://x.com/${X_USER}" target="_blank" rel="noreferrer">Takip et ${X_HANDLE}</a>`;
  host.after(strip);
  $("#rdShareSiteX").onclick = () => xIntent(siteShareText());
}

function upgradeProofShare() {
  const card = document.querySelector('[data-step="10"]');
  if (!card || $("#rdSharePanel")) return;
  const panel = document.createElement("div");
  panel.id = "rdSharePanel";
  panel.className = "rd-share-panel";
  panel.innerHTML = `
    <h3>Paylaş · herkes kendi hesabından</h3>
    <p>X butonu, o tarayıcıda giriş yapılmış X hesabının paylaşım ekranını açar. Metinde ${X_HANDLE} geçtiği için proje hesabı mention alır. Medium için yazıyı kopyalayıp kendi hesabında yayınlayabilirsin.</p>
    <div class="rd-share-grid">
      <button type="button" id="rdProofX">𝕏 DID + proof paylaş</button>
      <button type="button" id="rdThreadCopy">3 tweetlik diziyi kopyala</button>
      <button type="button" id="rdMediumCopy">Medium yazısını kopyala</button>
      <a href="${MEDIUM_WRITE_URL}" target="_blank" rel="noreferrer">Medium’da yeni yazı aç</a>
    </div>`;
  card.appendChild(panel);
  $("#rdProofX").onclick = () => xIntent(proofShareText());
  $("#rdThreadCopy").onclick = () => copy(threadText(), "3 tweetlik dizi kopyalandı");
  $("#rdMediumCopy").onclick = () => copy(mediumDraft(), "Medium taslağı kopyalandı");

  const old = $("#xShare");
  if (old) {
    const replacement = old.cloneNode(true);
    replacement.textContent = "X’te paylaş";
    old.replaceWith(replacement);
    replacement.onclick = () => xIntent(proofShareText());
  }
}

function securePrivateKeyCopy() {
  const btn = $("#copyKeySecret");
  if (!btn || btn.dataset.secured === "1") return;
  btn.dataset.secured = "1";
  btn.addEventListener("click", (event) => {
    const ok = confirm("Private key GitHub Secret'e yapıştırmak için panoya kopyalanacak. Mesaj, X, Medium, issue veya public dosyaya yapıştırma. Devam edilsin mi?");
    if (!ok) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

function agentRepoUrl() {
  const user = $("#rdGithubUser")?.value.trim().replace(/^@/, "");
  const repo = $("#rdGithubRepo")?.value.trim();
  if (!user || !repo || !/^[A-Za-z0-9-]+$/.test(user) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return "";
  return `https://github.com/${user}/${repo}`;
}

function setupChecklist() {
  const base = agentRepoUrl();
  return `RedDragon 7/24 Technocore Agent — güvenli hızlı kurulum\n\n1) Fork: ${REPO_URL}/fork\n2) Fork reponda Settings → Secrets and variables → Actions\n3) Yalnızca şu secret'i ekle:\n   TECHNOCORE_PRIVATE_KEY_PKCS8_B64 = RedDragon sitesindeki “Private key'i kopyala” değeri\n4) Actions → RedDragon Technocore Agent → Enable/Run workflow\n5) İlk run yeşil olmalı.\n\n${base ? `Senin repo: ${base}\nSecrets: ${base}/settings/secrets/actions\nActions: ${base}/actions/workflows/technocore-agent.yml\n\n` : ""}DID private key'den otomatik türetilir; ikinci bir DID secret'i gerekmez.\nSigned post yalnızca iki günlük cron penceresinde çalışır; heartbeat yaklaşık 30 dakikada bir kontrol edilir.\n\nGüvenlik: Site GitHub şifresi, tokeni veya wallet seed phrase istemez. Private key URL'ye, public GitHub dosyasına veya RedDragon sunucusuna gönderilmez.`;
}

function upgradeAgentSetup() {
  const card = document.querySelector('[data-step="11"]');
  if (!card || $("#rdQuickSetup")) return;

  const warning = card.querySelector(".warning-box span");
  if (warning) warning.textContent = "Heartbeat yaklaşık 30 dakikada bir kontrol edilir. Signed check-in yalnızca günde iki ayrı cron penceresinde çalışır; manuel/push testleri signed mesaj göndermez.";

  const didSecretBtn = $("#copyDidSecret");
  if (didSecretBtn?.parentElement) didSecretBtn.parentElement.classList.add("rd-hidden");
  const secretsTitle = [...card.querySelectorAll("h3")].find((h) => h.textContent.includes("Repository Secrets"));
  if (secretsTitle) secretsTitle.textContent = "Repository Secret · sadece 1 tane";

  const oldGuide = $("#copyAutoGuide");
  if (oldGuide) {
    const replacement = oldGuide.cloneNode(true);
    replacement.textContent = "Hızlı kurulum listesini kopyala";
    oldGuide.replaceWith(replacement);
    replacement.onclick = () => copy(setupChecklist(), "Kurulum listesi kopyalandı");
  }

  const repoBtn = $("#repoBtn");
  if (repoBtn) {
    repoBtn.href = REPO_URL;
    repoBtn.target = "_blank";
    repoBtn.rel = "noreferrer";
    repoBtn.textContent = "GitHub repo'yu aç";
    repoBtn.classList.remove("disabled-link");
  }

  const autoOut = $("#autoOut");
  if (autoOut) autoOut.textContent = "Ajan fork-safe: DID private key'den otomatik türetilir. Kullanıcı yalnızca private-key GitHub Secret'ini ekler.";

  const panel = document.createElement("div");
  panel.id = "rdQuickSetup";
  panel.className = "rd-quick-setup";
  panel.innerHTML = `
    <h3>Hızlı güvenli ajan kurulumu</h3>
    <p>Hiç kod bilmeden: repoyu forkla → tek secret'i ekle → Actions'ı çalıştır. Site GitHub tokeni istemez ve private key'i hiçbir URL'ye koymaz.</p>
    <div class="rd-quick-form">
      <input id="rdGithubUser" autocomplete="off" placeholder="GitHub kullanıcı adın" />
      <input id="rdGithubRepo" autocomplete="off" value="reddragon-technocore" placeholder="Fork repo adı" />
    </div>
    <div class="rd-quick-actions">
      <a href="${REPO_URL}/fork" target="_blank" rel="noreferrer">1 · Repoyu Forkla</a>
      <button type="button" id="rdOpenSecrets">2 · Secret sayfasını aç</button>
      <button type="button" id="rdCopyPrivate">3 · Private key'i kopyala</button>
      <button type="button" id="rdOpenActions">4 · Actions'ı aç / test et</button>
    </div>
    <div class="rd-security-note"><b>Güvenlik kuralı</b>Gerçek “tek tıkla Secret yazma” için GitHub OAuth/App yetkisi gerekir. Bunu bilerek yapmıyoruz: ziyaretçiden GitHub tokeni/şifresi istemek ve private key'i backend'e taşımak yerine secret'i kullanıcı GitHub'a kendisi yapıştırır. Bu, güvenli tarafta kalan tek manuel adımdır.</div>`;
  card.appendChild(panel);

  $("#rdGithubUser").value = localStorage.getItem("rd-github-user") || "";
  $("#rdGithubUser").addEventListener("input", (e) => localStorage.setItem("rd-github-user", e.target.value.trim()));
  $("#rdGithubRepo").addEventListener("input", (e) => localStorage.setItem("rd-github-repo", e.target.value.trim()));
  const savedRepo = localStorage.getItem("rd-github-repo");
  if (savedRepo) $("#rdGithubRepo").value = savedRepo;

  $("#rdOpenSecrets").onclick = () => {
    const base = agentRepoUrl();
    if (!base) return toast("Önce GitHub kullanıcı adını yaz");
    openExternal(`${base}/settings/secrets/actions`);
  };
  $("#rdCopyPrivate").onclick = () => {
    const btn = $("#copyKeySecret");
    if (!btn || btn.disabled) return toast("Önce DID oluştur veya yedeği geri yükle");
    btn.click();
  };
  $("#rdOpenActions").onclick = () => {
    const base = agentRepoUrl();
    if (!base) return toast("Önce GitHub kullanıcı adını yaz");
    openExternal(`${base}/actions/workflows/technocore-agent.yml`);
  };
}

function addMediumProfileCard() {
  const profile = $(".profile-card");
  if (!profile || $("#rdMediumCard")) return;
  const a = document.createElement("a");
  a.id = "rdMediumCard";
  a.className = "profile-card rd-medium-card";
  a.href = MEDIUM_URL;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.innerHTML = `<span>M</span><div><b>Medium</b><small>@ayazunal450 · RedDragon articles</small></div>`;
  profile.after(a);
}

function upgradeFooter() {
  const links = $("footer div");
  if (!links) return;
  if (![...links.querySelectorAll("a")].some((a) => a.href === REPO_URL)) {
    const g = document.createElement("a");
    g.href = REPO_URL; g.target = "_blank"; g.rel = "noreferrer"; g.textContent = "GitHub"; links.appendChild(g);
  }
  if (![...links.querySelectorAll("a")].some((a) => a.href === MEDIUM_URL)) {
    const m = document.createElement("a");
    m.href = MEDIUM_URL; m.target = "_blank"; m.rel = "noreferrer"; m.textContent = "Medium"; links.appendChild(m);
  }
}

async function checkRelay() {
  const live = $(".live");
  if (!live) return;
  try {
    const r = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "health" }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(String(r.status));
    live.lastChild.textContent = " relay online";
    live.classList.add("rd-status-ok");
  } catch {
    live.lastChild.textContent = " relay offline";
    live.classList.add("rd-status-bad");
  }
}

function friendlyCapacityErrors() {
  const ids = ["didNoteOut", "publicRoomOut", "privateRoomOut", "styleOut"];
  for (const id of ids) {
    const node = document.getElementById(id);
    if (!node) continue;
    const obs = new MutationObserver(() => {
      const text = node.textContent || "";
      if (node.querySelector(".rd-capacity-help")) return;
      let msg = "";
      if (/note limit reached/i.test(text)) msg = "Technocore note kapasitesi dolu. Bu, tarayıcı veya anahtar hatası değil; signed mesaj adımlarına devam edebilirsin.";
      if (/room limit reached/i.test(text)) msg = "Technocore yeni oda kapasitesi dolu. Bu adım sunucu kapasitesi açılana kadar atlanabilir.";
      if (/404/.test(text)) msg = "Bu bağlantı artık yoksa site içindeki eski 404 hedefi kullanılmayacak; ana GitHub/Medium/X bağlantıları güncel hedeflere yönlendirildi.";
      if (msg) {
        const s = document.createElement("span");
        s.className = "rd-capacity-help";
        s.textContent = msg;
        node.appendChild(s);
      }
    });
    obs.observe(node, { childList: true, characterData: true, subtree: true });
  }
}

window.addEventListener("load", () => {
  addTopLinks();
  addHeroSocial();
  upgradeProofShare();
  securePrivateKeyCopy();
  upgradeAgentSetup();
  addMediumProfileCard();
  upgradeFooter();
  friendlyCapacityErrors();
  checkRelay();
});
