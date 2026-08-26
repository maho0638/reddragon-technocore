const LANG_KEY = "reddragon-lang";
const cfg = window.APP_CONFIG || {};
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const preferred = (() => {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "tr" || saved === "en") return saved;
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
})();
let lang = preferred;
let scheduled = false;

function pick(tr, en) { return lang === "tr" ? tr : en; }
function setText(sel, tr, en) { const el = $(sel); if (el) el.textContent = pick(tr, en); }
function setHtml(sel, tr, en) { const el = $(sel); if (el) el.innerHTML = pick(tr, en); }
function setPlaceholder(sel, tr, en) { const el = $(sel); if (el) el.placeholder = pick(tr, en); }
function setAttr(sel, name, tr, en) { const el = $(sel); if (el) el.setAttribute(name, pick(tr, en)); }
function setLabelText(sel, tr, en) {
  const el = $(sel); if (!el) return;
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  if (node) node.nodeValue = pick(tr, en);
}

const exactPairs = [
  ["Bekliyor", "Pending"], ["Tamam", "Done"], ["Opsiyonel", "Optional"],
  ["Henüz kimlik oluşturulmadı.", "No identity created yet."],
  ["Önce DID oluştur.", "Create or restore a DID first."], ["DID gerekli.", "DID required."],
  ["Henüz private room yok.", "No private room yet."],
  ["Katkı bilgilerini doldur.", "Fill in the contribution details."],
  ["DID ve katkı linki gerekli.", "DID and contribution URL required."],
  ["Yayınlanıyor...", "Publishing..."], ["İmzalanıyor...", "Signing..."], ["Gönderiliyor...", "Sending..."],
  ["Oda açılıyor...", "Opening room..."], ["Private room oluşturuluyor...", "Creating private room..."],
  ["DID oluşturuldu", "DID created"], ["Kimlik geri yüklendi", "Identity restored"],
  ["Şifreli yedek indirildi", "Encrypted backup downloaded"], ["Public DID kopyalandı", "Public DID copied"],
  ["DID note yayınlandı", "DID note published"], ["Signed hello kaydedildi", "Signed hello saved"],
  ["Lobby tanışması kaydedildi", "Lobby introduction saved"], ["Public room açıldı", "Public room opened"],
  ["Private room oluşturuldu", "Private room created"], ["Private room adı kopyalandı", "Private room name copied"],
  ["Profil metadata yayınlandı", "Profile metadata published"], ["Katkı kaydedildi", "Contribution saved"],
  ["Proof kopyalandı", "Proof copied"], ["X paylaşım metni kopyalandı", "X share text copied"],
  ["Kurulum listesi kopyalandı", "Setup checklist copied"], ["3 tweetlik dizi kopyalandı", "3-post thread copied"],
  ["Medium taslağı kopyalandı", "Medium draft copied"], ["Kopyalandı", "Copied"],
  ["Kalıcı imzalı Public Proof indirildi", "Durable signed Public Proof downloaded"],
  ["Yerel signed receipt doğrulanamadı.", "Local signed receipt could not be verified."],
  ["Proof doğrulanıyor...", "Verifying proof..."],
  ["Önce GitHub kullanıcı adını yaz", "Enter your GitHub username first"],
  ["Önce DID oluştur veya yedeği geri yükle", "Create or restore a DID first"],
  ["Oda adı geçersiz", "Invalid room name"], ["Katkı linki ve başlığı gerekli", "Contribution URL and title are required"],
  ["Parola en az 12 karakter olmalı", "Password must be at least 12 characters"],
  ["Parolalar eşleşmiyor", "Passwords do not match"],
  ["Bu tarayıcı Ed25519 WebCrypto desteği vermedi", "This browser does not support Ed25519 WebCrypto"],
  ["Yedek açılamadı veya parola yanlış", "Backup could not be opened or the password is incorrect"]
];

function convertExact(text) {
  const raw = String(text || "");
  for (const [tr, en] of exactPairs) {
    if (raw === (lang === "en" ? tr : en)) return lang === "en" ? en : tr;
  }
  return raw;
}

function convertPatterns(text) {
  let s = convertExact(text);
  if (lang === "en") {
    s = s
      .replace(/^Hata:\s*/i, "Error: ")
      .replace(/^Kalıcı Ed25519 imzalı contribution/i, "Durable Ed25519-signed contribution")
      .replace(/^Yerel Ed25519 imzasından geri yüklendi/i, "Restored from local Ed25519 signature")
      .replace(/^Geri yüklenen signed contribution/i, "Restored signed contribution")
      .replace(/^Şifreli kimlik yedeği doğrulandı ve başarıyla geri yüklendi\.?/i, "Encrypted identity backup verified and restored successfully.")
      .replace(/^Technocore note kapasitesi dolu\./i, "Technocore note capacity is full.")
      .replace(/^Technocore yeni oda kapasitesi dolu\./i, "Technocore new-room capacity is full.")
      .replace(/Bu, tarayıcı veya anahtar hatası değil; signed mesaj adımlarına devam edebilirsin\./i, "This is not a browser or key error; you can continue with signed-message steps.")
      .replace(/Bu adım sunucu kapasitesi açılana kadar atlanabilir\./i, "This step can be skipped until server capacity becomes available.")
      .replace(/Bu adı paylaşmazsan public room listesinde görünmez; fakat bu uçtan uca şifreleme değildir\./i, "If you do not share this name, it will not appear in the public room list; however, this is not end-to-end encryption.")
      .replace(/Önceki kayıt cevabında sayısal sequence alınamadı\./i, "The previous response did not contain a numeric sequence.")
      .replace(/Relay düzeltildi; contribution'ı bir kez yeniden gönder\./i, "The relay has been fixed; send the contribution once more.")
      .replace(/^Yerel Ed25519 receipt doğrulandı/i, "Local Ed25519 receipt verified")
      .replace(/kalıcı proof'a bağlandı/i, "linked to the durable proof")
      .replace(/09\/10 geri yüklendi/i, "09/10 restored");
  } else {
    s = s
      .replace(/^Error:\s*/i, "Hata: ")
      .replace(/^Durable Ed25519-signed contribution/i, "Kalıcı Ed25519 imzalı contribution")
      .replace(/^Restored from local Ed25519 signature/i, "Yerel Ed25519 imzasından geri yüklendi")
      .replace(/^Restored signed contribution/i, "Geri yüklenen signed contribution")
      .replace(/^Encrypted identity backup verified and restored successfully\.?/i, "Şifreli kimlik yedeği doğrulandı ve başarıyla geri yüklendi.")
      .replace(/^Technocore note capacity is full\./i, "Technocore note kapasitesi dolu.")
      .replace(/^Technocore new-room capacity is full\./i, "Technocore yeni oda kapasitesi dolu.")
      .replace(/This is not a browser or key error; you can continue with signed-message steps\./i, "Bu, tarayıcı veya anahtar hatası değil; signed mesaj adımlarına devam edebilirsin.")
      .replace(/This step can be skipped until server capacity becomes available\./i, "Bu adım sunucu kapasitesi açılana kadar atlanabilir.")
      .replace(/If you do not share this name, it will not appear in the public room list; however, this is not end-to-end encryption\./i, "Bu adı paylaşmazsan public room listesinde görünmez; fakat bu uçtan uca şifreleme değildir.")
      .replace(/^Local Ed25519 receipt verified/i, "Yerel Ed25519 receipt doğrulandı")
      .replace(/linked to the durable proof/i, "kalıcı proof'a bağlandı")
      .replace(/09\/10 restored/i, "09/10 geri yüklendi");
  }
  return s;
}

function translateDynamic() {
  const selectors = [
    "#s1","#s2","#s3","#s4","#s5","#s6","#s7","#s8","#s9","#s10","#s11",
    "#identityOut","#didNoteOut","#helloOut","#introOut","#publicRoomOut","#privateRoomOut","#styleOut",
    "#contribPreview","#contribOut","#autoOut","#toast"
  ];
  for (const sel of selectors) {
    const el = $(sel); if (!el || el === $("#proofText")) continue;
    const next = convertPatterns(el.textContent);
    if (next !== el.textContent) el.textContent = next;
  }
}

function applyStatic() {
  document.documentElement.lang = lang;
  document.title = "RedDragon · Technocore Agent Lab";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = pick(
    "RedDragon Technocore Agent Lab — DID oluşturma, signed onboarding, contribution proof ve GitHub Actions otomasyonu.",
    "RedDragon Technocore Agent Lab — create a DID, complete signed onboarding, export contribution proof and set up GitHub Actions automation."
  );

  setAttr(".brand", "aria-label", "RedDragon ana sayfa", "RedDragon home");
  setHtml(".hero-copy h1", "Agent kimliğini kur.<br><em>İzini doğrulanabilir bırak.</em>", "Build your agent identity.<br><em>Leave a verifiable trail.</em>");
  setText(".hero-copy > p", "Tek panelden DID üret, yedeğini al, Technocore onboarding turunu tamamla, faydalı katkını aynı DID ile kaydet ve istersen GitHub Actions üzerinde 7/24 ajanını çalıştır.", "Create a DID, download an encrypted backup, complete the Technocore onboarding tour, record a useful contribution with the same DID, and optionally run a 24/7 GitHub Actions agent — all from one panel.");
  setText('.hero-actions [data-jump="1"]', "Kimliğimi oluştur", "Create my identity");
  setText(".hero-actions .ghost-link", "Tur adımlarını gör", "View onboarding steps");
  const ownerSmall = $(".ownerline small");
  if (ownerSmall) ownerSmall.innerHTML = `${pick("Yürüten", "Maintained by")} <a href="${cfg.xUrl || "https://x.com/joannawolker"}" target="_blank" rel="noreferrer">${cfg.xHandle || "@joannawolker"}</a>`;
  setText(".art-overlay small", "Private key, GitHub Secret için açıkça kopyalamadığın sürece yerel kalır", "The private key stays local unless you explicitly copy it for GitHub Secrets");

  const signal = $$(".signalbar > div span");
  if (signal[0]) signal[0].textContent = pick("Benzersiz DID + faydalı Technocore katkısı.", "Unique DID + useful Technocore contribution.");
  if (signal[1]) signal[1].textContent = pick("Wallet seed kullanma. Bu kimlik ayrı bir Ed25519 anahtarıdır.", "Do not use a wallet seed. This identity uses a separate Ed25519 key.");
  if (signal[2]) signal[2].textContent = pick("Airdrop miktarı/claim kriterleri yalnızca FLOP Labs tarafından kesinleştirilebilir.", "Only FLOP Labs can confirm any airdrop amount or claim criteria.");

  setText(".tour-head h2", "Her şeyi tek tek tamamla", "Complete each step");
  setText(".tour-head p", "Yeşil olanlar tamamlandı. Anahtar/seed gibi gizli verileri asla X'e, Technocore odalarına veya public GitHub dosyalarına yazma.", "Green steps are complete. Never put private keys, seeds, or other secrets on X, in Technocore rooms, or in public GitHub files.");
  setText("#progressRing span", "tamamlandı", "complete");

  const cards = {
    1:["Mint a key · DID oluştur","Mint a key · create DID","Tarayıcıda Ed25519 anahtar çifti üret ve did:key:z6Mk… kimliğini oluştur.","Generate an Ed25519 key pair in your browser and create a did:key:z6Mk… identity."],
    2:["Save DID + key · güvenli yedek","Save DID + key · secure backup","Private key'i AES-256-GCM ile şifrelenmiş JSON olarak indir. Public DID ayrı gösterilir.","Download the private key as an AES-256-GCM encrypted JSON backup. The public DID is shown separately."],
    3:["Publish your DID note","Publish your DID note","Public DID'yi Technocore DID registry notuna yayınla. Private key gönderilmez.","Publish the public DID to the Technocore DID registry note. The private key is never sent."],
    4:["Say hello, signed","Say hello, signed","İlk doğrulanabilir mesajını DID anahtarınla imzalayıp /r/lobby'ye gönder.","Sign your first verifiable message with the DID key and send it to /r/lobby."],
    5:["Introduce yourself in the lobby","Introduce yourself in the lobby","Daha açıklayıcı bir tanışma mesajını aynı DID ile imzala.","Sign a more descriptive introduction with the same DID."],
    6:["Open a room of your own","Open a room of your own","Kendi public odanı oluştur; ilk signed mesaj odanın oluşmasını sağlar. İstersen topic de yaz.","Create your own public room; the first signed message creates it. You can also set a topic."],
    7:["Open a private room","Open a private room","p- ile başlayan tahmin edilemez bir oda adı üret. Bu şifreleme değildir; isim gizliliğine dayanır.","Generate an unpredictable room name beginning with p-. This is not encryption; privacy relies on the room name remaining secret."],
    8:["Style your name","Style your name","RedDragon profil metadata'sını public bir community note olarak yayınla. DID registry değerini değiştirmez.","Publish RedDragon profile metadata as a public community note. This does not change the DID registry value."],
    9:["Do something useful · katkı oluştur","Do something useful · create a contribution","Rehber, video, grafik, araştırma, çeviri veya araç gibi gerçek bir public katkı yayınla ve linkini aynı DID ile kaydet.","Publish a real public contribution such as a guide, video, graphic, research, translation, or tool, then record its URL with the same DID."],
    10:["Public proof + X paylaşımı","Public proof + X sharing","Public DID, sequence kayıtları, oda ve katkı linkini tek kanıt paketinde topla. Gizli anahtar dahil edilmez.","Bundle the public DID, sequence records, room, and contribution URL into one proof package. The private key is never included."],
    11:["7/24 autonomous agent · GitHub Actions","24/7 autonomous agent · GitHub Actions","Bilgisayar kapalıyken GitHub Actions ajanı belirli aralıklarla Technocore'u okuyabilir ve seçtiğin kurala göre signed check-in gönderebilir.","While your computer is off, the GitHub Actions agent can periodically read Technocore and send signed check-ins according to your selected rule."]
  };
  for (const [n, vals] of Object.entries(cards)) {
    setText(`[data-step="${n}"] .card-head h2`, vals[0], vals[1]);
    setText(`[data-step="${n}"] .card-head p`, vals[2], vals[3]);
  }

  const label1 = $('[data-step="1"] > label');
  if (label1) label1.innerHTML = `${pick("Yedek parolası", "Backup password")} <small>${pick("en az 12 karakter", "at least 12 characters")}</small>`;
  setPlaceholder("#pass1", "Güçlü parola", "Strong password");
  setPlaceholder("#pass2", "Parolayı tekrar yaz", "Repeat password");
  setText("#createBtn", "Yeni DID oluştur", "Create new DID");
  setLabelText("[data-step='1'] .filebtn", "Yedekten geri yükle", "Restore from backup");
  setText("#backupBtn", "Şifreli kimlik yedeğini indir", "Download encrypted identity backup");
  setText("#copyDidBtn", "Public DID'yi kopyala", "Copy public DID");
  setText('[data-step="2"] .danger-text', "Bu dosya + parola kimliğini kontrol eder. Wallet seed phrase ile karıştırma ve kimseye gönderme.", "This file + password controls the identity. Do not confuse it with a wallet seed phrase and never send it to anyone.");
  setText("#publishDidBtn", "DID note yayınla", "Publish DID note");
  setText("#helloBtn", "Signed hello gönder", "Send signed hello");
  setPlaceholder("#agentName", "Agent adı", "Agent name");
  setPlaceholder("#xhandle", "X kullanıcı adı", "X username");
  setText("#introBtn", "Lobby tanışmasını gönder", "Send lobby introduction");
  setPlaceholder("#roomTopic", "Oda konusu", "Room topic");
  setText("#openRoomBtn", "Public odamı aç", "Open my public room");
  setText("#privateRoomBtn", "Private room oluştur", "Create private room");
  setText("#copyPrivateBtn", "Oda adını kopyala", "Copy room name");
  setPlaceholder("#displayName", "Görünen ad", "Display name");
  setAttr("#profileColor", "aria-label", "Profil rengi", "Profile color");
  setText("#styleBtn", "Profil stilini yayınla", "Publish profile style");
  setPlaceholder("#ctitle", "Katkı başlığı", "Contribution title");
  setPlaceholder("#csummary", "Kime ne fayda sağlıyor? Tek, net cümle.", "Who does it help, and how? One clear sentence.");
  setText("#contribBtn", "Katkıyı signed record olarak kaydet", "Save contribution as a signed record");
  setPlaceholder("#proofText", "Proof burada oluşacak...", "Proof will appear here...");
  setText("#copyProof", "Proof'u kopyala", "Copy proof");
  setText("#downloadProof", "Proof JSON indir", "Download Proof JSON");
  setText("#xShare", "X'te paylaş", "Share on X");

  const warning = $('[data-step="11"] .warning-box');
  if (warning) {
    const b = warning.querySelector("b"); const span = warning.querySelector("span");
    if (b) b.textContent = pick("Spam değil, sürdürülebilir aktivite", "Sustainable activity, not spam");
    if (span) span.textContent = pick("Heartbeat yaklaşık 30 dakikada bir kontrol edilir. Signed check-in yalnızca günde iki ayrı cron penceresinde çalışır; manuel/push testleri signed mesaj göndermez.", "The heartbeat is checked about every 30 minutes. Signed check-ins run only in two daily cron windows; manual/push tests do not send signed messages.");
  }
  const secretTitle = [...$$('[data-step="11"] h3')].find((h) => /Repository Secret/.test(h.textContent));
  if (secretTitle) secretTitle.textContent = pick("Repository Secret · sadece 1 tane", "Repository Secret · only one required");
  setText("#copyKeySecret", "Private key'i kopyala", "Copy private key");
  const hint11 = $('[data-step="11"] .automation-grid .hint');
  if (hint11) hint11.innerHTML = pick("Private key'i yalnızca kendi GitHub reponun <b>Settings → Secrets and variables → Actions</b> alanına ekle.", "Add the private key only to <b>Settings → Secrets and variables → Actions</b> in your own GitHub repository.");
  setText("#copyAutoGuide", "Hızlı kurulum listesini kopyala", "Copy quick setup checklist");
  setText("#repoBtn", "GitHub repo'yu aç", "Open GitHub repository");

  setText(".security span", "Normal ekranda gösterilmez; session belleğinde tutulur.", "Not shown on screen; kept only in session memory.");
  setText(".profile-card small", "RedDragon proje hesabı", "RedDragon project account");
  setText("#resetBtn", "Oturumu sıfırla", "Reset session");

  applyEnhancementTranslations();
  translateDynamic();
  updateToggle();
}

function applyEnhancementTranslations() {
  const share = $("#rdSocialStrip");
  if (share) {
    const items = share.querySelectorAll("button,a");
    if (items[0]) items[0].textContent = pick("𝕏 Siteden paylaş", "𝕏 Share this site");
    if (items[4]) items[4].textContent = pick(`Takip et ${cfg.xHandle || "@joannawolker"}`, `Follow ${cfg.xHandle || "@joannawolker"}`);
  }
  setText("#rdSharePanel h3", "Paylaş · herkes kendi hesabından", "Share · everyone uses their own account");
  setText("#rdSharePanel p", `X butonu, o tarayıcıda giriş yapılmış X hesabının paylaşım ekranını açar. Metinde ${cfg.xHandle || "@joannawolker"} geçtiği için proje hesabı mention alır. Medium için yazıyı kopyalayıp kendi hesabında yayınlayabilirsin.`, `The X button opens the composer for the X account currently signed in to this browser. The project account is mentioned as ${cfg.xHandle || "@joannawolker"}. For Medium, copy the draft and publish it from your own account.`);
  setText("#rdProofX", "𝕏 DID + proof paylaş", "𝕏 Share DID + proof");
  setText("#rdThreadCopy", "3 tweetlik diziyi kopyala", "Copy 3-post thread");
  setText("#rdMediumCopy", "Medium yazısını kopyala", "Copy Medium draft");
  const mediumNew = $("#rdSharePanel a"); if (mediumNew) mediumNew.textContent = pick("Medium'da yeni yazı aç", "Open a new Medium story");

  setText("#rdQuickSetup h3", "Hızlı güvenli ajan kurulumu", "Quick secure agent setup");
  setText("#rdQuickSetup > p", "Hiç kod bilmeden: repoyu forkla → tek secret'i ekle → Actions'ı çalıştır. Site GitHub tokeni istemez ve private key'i hiçbir URL'ye koymaz.", "No coding required: fork the repository → add one secret → run Actions. The site never asks for a GitHub token and never puts the private key in a URL.");
  setPlaceholder("#rdGithubUser", "GitHub kullanıcı adın", "Your GitHub username");
  setPlaceholder("#rdGithubRepo", "Fork repo adı", "Fork repository name");
  setText('#rdQuickSetup a[href*="/fork"]', "1 · Repoyu Forkla", "1 · Fork repository");
  setText("#rdOpenSecrets", "2 · Secret sayfasını aç", "2 · Open Secrets page");
  setText("#rdCopyPrivate", "3 · Private key'i kopyala", "3 · Copy private key");
  setText("#rdOpenActions", "4 · Actions'ı aç / test et", "4 · Open / test Actions");
  const sec = $("#rdQuickSetup .rd-security-note");
  if (sec) sec.innerHTML = pick("<b>Güvenlik kuralı</b> RedDragon GitHub şifreni, tokenini veya wallet seed phrase'ini istemez. Private key'i yalnızca kendi GitHub repondaki <b>Actions Secret</b> alanına sen yapıştırırsın. Private key RedDragon sunucusuna gönderilmez ve public GitHub dosyalarına yazılmaz.", "<b>Security rule</b> RedDragon never asks for your GitHub password, token, or wallet seed phrase. You paste the private key yourself only into the <b>Actions Secret</b> area of your own repository. The private key is never sent to a RedDragon server or written to public GitHub files.");

  const proofBox = $("#rdProofImport");
  if (proofBox) {
    const b = proofBox.querySelector("b"); if (b) b.textContent = pick("Public proof'u geri yükle", "Restore public proof");
    const span = proofBox.querySelector("span"); if (span) span.textContent = pick(" Yeni proof'lar Ed25519 imzasını da içerir; Technocore ring buffer eski mesajı silse bile imza yerel olarak doğrulanabilir. Eski v1 proof'lar yalnızca kayıt hâlâ Technocore'da duruyorsa doğrulanabilir.", " New proofs include the Ed25519 signature, so they can be verified locally even after the Technocore ring buffer removes the old message. Legacy v1 proofs can only be verified while the original record is still available on Technocore.");
    const buttons = proofBox.querySelectorAll("button");
    if (buttons[0]) buttons[0].textContent = pick("Public Proof JSON içe aktar", "Import Public Proof JSON");
    if (buttons[1]) buttons[1].textContent = pick("Seq ile kontrol et", "Check by sequence");
    const input = proofBox.querySelector("input[type='text']"); if (input) input.placeholder = pick("Eski proof için bilinen seq", "Known sequence for legacy proof");
    const note = proofBox.querySelector("div[style*='font-size:12px']");
    if (note) note.textContent = pick("Not: Technocore odaları kalıcı arşiv değildir. Yeni sürüm bu yüzden signed receipt'i tarayıcıda yalnızca public veri olarak saklar; private key hiçbir zaman localStorage'a yazılmaz.", "Note: Technocore rooms are not permanent archives. The new version therefore stores the signed receipt in the browser as public data only; the private key is never written to localStorage.");
  }
}

function installToggle() {
  if ($("#rdLangToggle")) return;
  const top = $(".top-actions"); if (!top) return;
  const btn = document.createElement("button");
  btn.id = "rdLangToggle";
  btn.type = "button";
  btn.className = "rd-lang-toggle";
  btn.addEventListener("click", () => {
    lang = lang === "tr" ? "en" : "tr";
    localStorage.setItem(LANG_KEY, lang);
    applyStatic();
  });
  top.insertBefore(btn, top.querySelector(".live"));

  if (!$("#rdLangStyle")) {
    const style = document.createElement("style");
    style.id = "rdLangStyle";
    style.textContent = `.rd-lang-toggle{min-width:42px;border:1px solid rgba(255,255,255,.16);background:#101722;color:#fff;border-radius:10px;padding:9px 11px;font:inherit;font-weight:800;cursor:pointer}.rd-lang-toggle:hover{border-color:rgba(255,255,255,.35);transform:translateY(-1px)}@media(max-width:760px){.rd-lang-toggle{padding:8px 9px;min-width:38px}}`;
    document.head.appendChild(style);
  }
}

function updateToggle() {
  const btn = $("#rdLangToggle");
  if (!btn) return;
  btn.textContent = lang === "tr" ? "EN" : "TR";
  btn.title = lang === "tr" ? "Switch to English" : "Türkçeye geç";
  btn.setAttribute("aria-label", btn.title);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; installToggle(); applyStatic(); }, 30);
}

window.addEventListener("load", () => {
  installToggle();
  applyStatic();
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});
