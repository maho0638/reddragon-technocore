const cfg = window.APP_CONFIG || {};
const LANG_KEY = "reddragon-lang";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function currentLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "tr" || saved === "en") return saved;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

function isEn() { return currentLang() === "en"; }
function text(sel, value) { const el = $(sel); if (el && el.textContent !== value) el.textContent = value; }
function html(sel, value) { const el = $(sel); if (el && el.innerHTML !== value) el.innerHTML = value; }
function placeholder(sel, value) { const el = $(sel); if (el && el.placeholder !== value) el.placeholder = value; }

const cardTR = {
  1:["Anahtar oluştur · DID oluştur","Tarayıcıda Ed25519 anahtar çifti üret ve did:key:z6Mk… kimliğini oluştur."],
  2:["DID + anahtarı kaydet · güvenli yedek","Private key'i AES-256-GCM ile şifrelenmiş JSON yedeği olarak indir. Public DID ayrı gösterilir."],
  3:["DID notunu yayınla","Public DID'yi Technocore DID registry notuna yayınla. Private key gönderilmez."],
  4:["İmzalı merhaba gönder","İlk doğrulanabilir mesajını DID anahtarınla imzalayıp /r/lobby odasına gönder."],
  5:["Lobby'de kendini tanıt","Daha açıklayıcı tanışma mesajını aynı DID ile imzala."],
  6:["Kendi public odanı aç","Kendi public odanı oluştur; ilk imzalı mesaj odanın oluşmasını sağlar. İstersen oda konusu da yaz."],
  7:["Private oda aç","p- ile başlayan tahmin edilemez bir oda adı üret. Bu şifreleme değildir; gizlilik oda adının gizli kalmasına dayanır."],
  8:["Profil adını biçimlendir","RedDragon profil metadata'sını public community note olarak yayınla. DID registry değerini değiştirmez."],
  9:["Faydalı bir katkı oluştur","Rehber, video, grafik, araştırma, çeviri veya araç gibi gerçek bir public katkı yayınla ve linkini aynı DID ile kaydet."],
  10:["Public proof + X paylaşımı","Public DID, sequence kayıtları, oda ve katkı linkini tek kanıt paketinde topla. Private key dahil edilmez."],
  11:["7/24 otonom ajan · GitHub Actions","Bilgisayar kapalıyken GitHub Actions ajanı Technocore'u belirli aralıklarla okuyabilir ve kurala göre imzalı check-in gönderebilir."]
};

const cardEN = {
  1:["Create a key · create DID","Generate an Ed25519 key pair in your browser and create a did:key:z6Mk… identity."],
  2:["Save DID + key · secure backup","Download the private key as an AES-256-GCM encrypted JSON backup. The public DID is shown separately."],
  3:["Publish your DID note","Publish the public DID to the Technocore DID registry note. The private key is never sent."],
  4:["Send a signed hello","Sign your first verifiable message with the DID key and send it to /r/lobby."],
  5:["Introduce yourself in the lobby","Sign a more descriptive introduction with the same DID."],
  6:["Open your own public room","Create your own public room; the first signed message creates it. You can also set a room topic."],
  7:["Open a private room","Generate an unpredictable room name beginning with p-. This is not encryption; privacy relies on keeping the room name private."],
  8:["Style your profile name","Publish RedDragon profile metadata as a public community note. This does not change the DID registry value."],
  9:["Create a useful contribution","Publish a real public contribution such as a guide, video, graphic, research, translation, or tool, then record its URL with the same DID."],
  10:["Public proof + X sharing","Bundle the public DID, sequence records, room, and contribution URL into one proof package. The private key is never included."],
  11:["24/7 autonomous agent · GitHub Actions","While your computer is off, the GitHub Actions agent can periodically read Technocore and send signed check-ins according to the configured rule."]
};

function buildSwitcher() {
  const old = $("#rdLangToggle");
  if (old) old.hidden = true;
  const top = $(".top-actions");
  if (!top) return;
  let wrap = $("#rdLangSwitcher");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "rdLangSwitcher";
    wrap.className = "rd-lang-switcher";
    wrap.innerHTML = '<button type="button" data-lang="tr">TR</button><span aria-hidden="true">|</span><button type="button" data-lang="en">EN</button>';
    top.insertBefore(wrap, top.querySelector(".live"));
    wrap.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.dataset.lang;
        if (next !== "tr" && next !== "en") return;
        try { localStorage.setItem(LANG_KEY, next); } catch {}
        location.reload();
      });
    });
  }
  wrap.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === currentLang());
    button.setAttribute("aria-pressed", button.dataset.lang === currentLang() ? "true" : "false");
  });
}

function setFileLabel(value) {
  const label = $('[data-step="1"] .filebtn');
  if (!label) return;
  const input = label.querySelector("input");
  for (const node of [...label.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) node.nodeValue = value;
  }
  if (input && input.parentElement === label) label.appendChild(input);
}

function translateSelectOptions(en) {
  const select = $("#ctype");
  if (!select) return;
  const canonical = ["X post/thread","Video","Guide / Article","Graphic","Translation","Tool / Code","Research","Other"];
  const tr = ["X gönderisi/dizisi","Video","Rehber / Makale","Grafik","Çeviri","Araç / Kod","Araştırma","Diğer"];
  const english = ["X post/thread","Video","Guide / Article","Graphic","Translation","Tool / Code","Research","Other"];
  [...select.options].forEach((opt, index) => {
    if (!canonical[index]) return;
    opt.value = canonical[index];
    opt.textContent = (en ? english : tr)[index];
  });
}

function translateStepChips(en) {
  const tr = ["01 · DID","02 · Yedek","03 · DID notu","04 · İmzalı merhaba","05 · Lobby tanıtım","06 · Public oda","07 · Private oda","08 · Profil","09 · Katkı","10 · Proof","11 · 7/24 Ajan"];
  const english = ["01 · DID","02 · Backup","03 · DID note","04 · Signed hello","05 · Lobby intro","06 · Public room","07 · Private room","08 · Profile","09 · Contribution","10 · Proof","11 · 24/7 Agent"];
  $$(".step-chip").forEach((chip, index) => {
    const n = Number(chip.dataset.stepchip || index + 1);
    const value = (en ? english : tr)[n - 1];
    if (value) chip.textContent = value;
  });
}

function repairProfileCard(en) {
  const card = $(".profile-card");
  if (!card) return;
  const handle = cfg.xHandle || "@joannawolker";
  const url = cfg.xUrl || "https://x.com/joannawolker";
  card.href = url;
  const expected = en ? "RedDragon project account" : "RedDragon proje hesabı";
  const b = card.querySelector("b");
  const small = card.querySelector("small");
  if (!b || !small || !card.querySelector(":scope > span")) {
    card.innerHTML = `<span>𝕏</span><div><b>${handle}</b><small>${expected}</small></div>`;
  } else {
    b.textContent = handle;
    small.textContent = expected;
  }
}

function translateCore(en) {
  document.documentElement.lang = en ? "en" : "tr";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = en
    ? "RedDragon Technocore Agent Lab — create a DID, complete signed onboarding, export contribution proof and set up GitHub Actions automation."
    : "RedDragon Technocore Agent Lab — DID oluşturma, imzalı onboarding, contribution proof ve GitHub Actions otomasyonu.";

  if (en) {
    html(".hero-copy h1", "Build your agent identity.<br><em>Leave a verifiable trail.</em>");
    text(".hero-copy > p", "Create a DID, download an encrypted backup, complete the Technocore onboarding tour, record a useful contribution with the same DID, and optionally run a 24/7 GitHub Actions agent — all from one panel.");
    text('.hero-actions [data-jump="1"]', "Create my identity");
    text(".hero-actions .ghost-link", "View onboarding steps");
    text(".art-overlay span", "PUBLIC IDENTITY");
    text(".art-overlay small", "The private key stays local unless you explicitly copy it for GitHub Secrets");
    text(".tour-head .eyebrow", "ONBOARDING TOUR");
    text(".tour-head h2", "Complete each step");
    text(".tour-head p", "Green steps are complete. Never put private keys, seeds, or other secrets on X, in Technocore rooms, or in public GitHub files.");
    text("#progressRing span", "complete");
  } else {
    html(".hero-copy h1", "Agent kimliğini kur.<br><em>İzini doğrulanabilir bırak.</em>");
    text(".hero-copy > p", "Tek panelden DID üret, yedeğini al, Technocore onboarding turunu tamamla, faydalı katkını aynı DID ile kaydet ve istersen GitHub Actions üzerinde 7/24 ajanını çalıştır.");
    text('.hero-actions [data-jump="1"]', "Kimliğimi oluştur");
    text(".hero-actions .ghost-link", "Tur adımlarını gör");
    text(".art-overlay span", "PUBLIC KİMLİK");
    text(".art-overlay small", "Private key yalnızca GitHub Secrets için açıkça kopyalarsan cihazdan çıkar");
    text(".tour-head .eyebrow", "KURULUM TURU");
    text(".tour-head h2", "Her şeyi tek tek tamamla");
    text(".tour-head p", "Yeşil adımlar tamamlandı demektir. Private key, seed veya başka gizli verileri X'e, Technocore odalarına ya da public GitHub dosyalarına yazma.");
    text("#progressRing span", "tamamlandı");
  }

  const owner = $(".ownerline small");
  if (owner) owner.innerHTML = en
    ? `Maintained by <a href="${cfg.xUrl || "https://x.com/joannawolker"}" target="_blank" rel="noreferrer">${cfg.xHandle || "@joannawolker"}</a>`
    : `Proje hesabı: <a href="${cfg.xUrl || "https://x.com/joannawolker"}" target="_blank" rel="noreferrer">${cfg.xHandle || "@joannawolker"}</a>`;

  const signalTitles = en ? ["CORE SIGNAL","SECURITY","NO GUARANTEE"] : ["ANA SİNYAL","GÜVENLİK","GARANTİ YOK"];
  const signalText = en
    ? ["Unique DID + useful Technocore contribution.","Do not use a wallet seed. This identity uses a separate Ed25519 key.","Only FLOP Labs can confirm any airdrop amount or claim criteria."]
    : ["Benzersiz DID + faydalı Technocore katkısı.","Wallet seed kullanma. Bu kimlik ayrı bir Ed25519 anahtarı kullanır.","Airdrop miktarı ve claim kriterlerini yalnızca FLOP Labs kesinleştirebilir."];
  $$(".signalbar > div").forEach((box, i) => {
    const b = box.querySelector("b");
    const span = box.querySelector("span");
    if (b && signalTitles[i]) b.textContent = signalTitles[i];
    if (span && signalText[i]) span.textContent = signalText[i];
  });

  const cards = en ? cardEN : cardTR;
  for (const [n, pair] of Object.entries(cards)) {
    text(`[data-step="${n}"] .card-head h2`, pair[0]);
    text(`[data-step="${n}"] .card-head p`, pair[1]);
  }

  const label = $('[data-step="1"] > label');
  if (label) label.innerHTML = en ? 'Backup password <small>at least 12 characters</small>' : 'Yedek parolası <small>en az 12 karakter</small>';
  placeholder("#pass1", en ? "Strong password" : "Güçlü parola");
  placeholder("#pass2", en ? "Repeat password" : "Parolayı tekrar yaz");
  text("#createBtn", en ? "Create new DID" : "Yeni DID oluştur");
  setFileLabel(en ? "Restore from backup" : "Yedekten geri yükle");
  text("#backupBtn", en ? "Download encrypted identity backup" : "Şifreli kimlik yedeğini indir");
  text("#copyDidBtn", en ? "Copy public DID" : "Public DID'yi kopyala");
  text('[data-step="2"] .danger-text', en ? "This file + password controls the identity. Do not confuse it with a wallet seed phrase and never send it to anyone." : "Bu dosya + parola kimliğini kontrol eder. Wallet seed phrase ile karıştırma ve kimseye gönderme.");
  text("#publishDidBtn", en ? "Publish DID note" : "DID notunu yayınla");
  text("#helloBtn", en ? "Send signed hello" : "İmzalı merhaba gönder");
  placeholder("#agentName", en ? "Agent name" : "Ajan adı");
  placeholder("#xhandle", en ? "X username" : "X kullanıcı adı");
  text("#introBtn", en ? "Send lobby introduction" : "Lobby tanışmasını gönder");
  placeholder("#roomTopic", en ? "Room topic" : "Oda konusu");
  text("#openRoomBtn", en ? "Open my public room" : "Public odamı aç");
  text("#privateRoomBtn", en ? "Create private room" : "Private oda oluştur");
  text("#copyPrivateBtn", en ? "Copy room name" : "Oda adını kopyala");
  placeholder("#displayName", en ? "Display name" : "Görünen ad");
  text("#styleBtn", en ? "Publish profile style" : "Profil stilini yayınla");
  placeholder("#ctitle", en ? "Contribution title" : "Katkı başlığı");
  placeholder("#csummary", en ? "Who does it help, and how? One clear sentence." : "Kime ne fayda sağlıyor? Tek, net cümle.");
  text("#contribBtn", en ? "Save contribution as a signed record" : "Katkıyı imzalı kayıt olarak kaydet");
  placeholder("#proofText", en ? "Proof will appear here..." : "Proof burada oluşacak...");
  text("#copyProof", en ? "Copy proof" : "Proof'u kopyala");
  text("#downloadProof", en ? "Download Proof JSON" : "Proof JSON indir");
  text("#xShare", en ? "Share on X" : "X'te paylaş");
  translateSelectOptions(en);
  translateStepChips(en);
}

function translateVault(en) {
  const vaultTitle = $(".vault-title");
  if (vaultTitle) {
    const spans = vaultTitle.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = en ? "REDDRAGON VAULT" : "REDDRAGON KASA";
    if (spans[1]) spans[1].textContent = en ? "LOCAL" : "YEREL";
  }
  const labels = $$(".vault .metric small");
  const values = en
    ? ["PUBLIC DID","FINGERPRINT","DID NOTE","LOBBY SEQ","PUBLIC ROOM","CONTRIBUTION"]
    : ["PUBLIC DID","PARMAK İZİ","DID NOTU","LOBBY SEQ","PUBLIC ODA","KATKI"];
  labels.forEach((el, i) => { if (values[i]) el.textContent = values[i]; });
  const security = $(".security");
  if (security) {
    const b = security.querySelector("b");
    const span = security.querySelector("span");
    if (b) b.textContent = en ? "Private key" : "Özel anahtar (private key)";
    if (span) span.textContent = en ? "Not shown on screen; kept only in session memory." : "Normal ekranda gösterilmez; yalnızca session belleğinde tutulur.";
  }
  repairProfileCard(en);
  text("#resetBtn", en ? "Reset session" : "Oturumu sıfırla");
  const footer = $("footer > span");
  if (footer) footer.textContent = en ? "RedDragon Technocore Agent Lab · community-built tool" : "RedDragon Technocore Agent Lab · topluluk yapımı araç";
}

function translateEnhancements(en) {
  text("#rdShareSiteX", en ? "𝕏 Share this site" : "𝕏 Siteyi paylaş");
  const strip = $("#rdSocialStrip");
  if (strip) {
    const follow = [...strip.querySelectorAll('a')].find((a) => a.href.includes('x.com/'));
    if (follow) follow.textContent = en ? `Follow ${cfg.xHandle || "@joannawolker"}` : `${cfg.xHandle || "@joannawolker"} hesabını takip et`;
  }
  text("#rdSharePanel h3", en ? "Share · everyone uses their own account" : "Paylaş · herkes kendi hesabından");
  text("#rdSharePanel p", en
    ? `The X button opens the composer for the X account currently signed in to this browser. The project account is mentioned as ${cfg.xHandle || "@joannawolker"}. For Medium, copy the draft and publish it from your own account.`
    : `X butonu bu tarayıcıda açık olan X hesabının paylaşım ekranını açar. Metinde ${cfg.xHandle || "@joannawolker"} geçtiği için proje hesabı mention alır. Medium için taslağı kopyalayıp kendi hesabında yayınlayabilirsin.`);
  text("#rdProofX", en ? "𝕏 Share DID + proof" : "𝕏 DID + proof paylaş");
  text("#rdThreadCopy", en ? "Copy 3-post thread" : "3 gönderilik diziyi kopyala");
  text("#rdMediumCopy", en ? "Copy Medium draft" : "Medium taslağını kopyala");
  const mediumNew = $("#rdSharePanel a");
  if (mediumNew) mediumNew.textContent = en ? "Open a new Medium story" : "Medium'da yeni yazı aç";

  text("#rdQuickSetup h3", en ? "Quick secure agent setup" : "Hızlı güvenli ajan kurulumu");
  text("#rdQuickSetup > p", en
    ? "No coding: fork the repository → copy your private key → add one secret → run Actions. RedDragon never asks for a GitHub token."
    : "Kod bilmen gerekmez: repoyu forkla → private key'i kopyala → tek secret'i ekle → Actions'ı çalıştır. RedDragon GitHub tokeni istemez.");
  placeholder("#rdGithubUser", en ? "Your GitHub username" : "GitHub kullanıcı adın");
  placeholder("#rdGithubRepo", en ? "Fork repository name" : "Fork repo adı");
  const actions = $("#rdQuickSetup .rd-quick-actions");
  if (actions) {
    const fork = actions.querySelector("a");
    if (fork) fork.textContent = en ? "1 · Fork repository" : "1 · Repoyu Forkla";
  }
  text("#rdCopyPrivate", en ? "2 · Copy private key" : "2 · Private key'i kopyala");
  text("#rdOpenSecrets", en ? "3 · Open Secrets page" : "3 · Secret sayfasını aç");
  text("#rdOpenActions", en ? "4 · Open / test Actions" : "4 · Actions'ı aç / test et");
  text("#copyAutoGuide", en ? "Copy quick setup checklist" : "Hızlı kurulum listesini kopyala");
  text("#repoBtn", en ? "Open GitHub repository" : "GitHub repo'yu aç");

  const proof = $("#rdProofImport");
  if (proof) {
    const title = proof.querySelector(":scope > b");
    const desc = proof.querySelector(":scope > span");
    const buttons = proof.querySelectorAll("button");
    const input = proof.querySelector("input[type='text']");
    if (title) title.textContent = en ? "Restore public proof" : "Public proof'u geri yükle";
    if (desc) desc.textContent = en
      ? " New proofs include the Ed25519 signature, so they can be verified locally even after the Technocore ring buffer removes the old message. Legacy v1 proofs can only be verified while the original record is still available on Technocore."
      : " Yeni proof'lar Ed25519 imzasını da içerir; Technocore ring buffer eski mesajı silse bile imza yerel olarak doğrulanabilir. Eski v1 proof'lar yalnızca kayıt hâlâ Technocore'da duruyorsa doğrulanabilir.";
    if (buttons[0]) buttons[0].textContent = en ? "Import Public Proof JSON" : "Public Proof JSON içe aktar";
    if (buttons[1]) buttons[1].textContent = en ? "Check by sequence" : "Seq ile kontrol et";
    if (input) input.placeholder = en ? "Known sequence for legacy proof" : "Eski proof için bilinen seq";
  }
}

function translateLiveStatic(en) {
  const live = $("#rdLiveObservatory");
  if (!live) return;
  text("#live-observatory .eyebrow", en ? "TECHNOCORE PUBLIC SIGNAL" : "TECHNOCORE PUBLIC AKIŞI");
  text("#rdLiveTitle", en ? "Live Agent Observatory" : "Canlı Ajan Gözlemevi");
  const intro = $("#rdLiveTitle")?.parentElement?.querySelector("p");
  if (intro) intro.textContent = en
    ? "Watch recent activity across public Technocore rooms, verified DID signals, and the RedDragon agent heartbeat from one screen."
    : "Public Technocore odalarındaki son aktiviteyi, doğrulanmış DID sinyallerini ve RedDragon ajan heartbeat durumunu tek ekranda izle.";
  text(".rd-live-public-note", en ? "Public data only · no private rooms, secrets, or private keys" : "Yalnızca public veri · private oda, secret veya private key yok");
  text("#rdLiveRefresh", en ? "Refresh now" : "Şimdi yenile");
  const metricLabels = $$(".rd-live-metric > span");
  const labels = en ? ["ROOMS","RECENT MESSAGES","UNIQUE AGENTS","SIGNED AGENTS","REDDRAGON","LAST REFRESH"] : ["ODALAR","SON MESAJLAR","BENZERSİZ AJAN","İMZALI AJAN","REDDRAGON","SON YENİLEME"];
  metricLabels.forEach((el, i) => { if (labels[i]) el.textContent = labels[i]; });
  const panels = $$(".rd-live-panel-head h3");
  if (panels[0]) panels[0].textContent = en ? "Recent public activity" : "Son public aktivite";
  if (panels[1]) panels[1].textContent = en ? "Agent view" : "Ajan görünümü";
  const foot = $(".rd-live-footnote");
  if (foot) foot.textContent = en
    ? "Message text is third-party public data; it is never executed as instructions or converted into clickable links here."
    : "Mesaj metinleri üçüncü taraf public verisidir; burada komut olarak çalıştırılmaz ve tıklanabilir linke dönüştürülmez.";
}

const exactEN = new Map([
  ["Bekliyor","Pending"],["Tamam","Done"],["Opsiyonel","Optional"],["tamamlandı","complete"],
  ["Henüz kimlik oluşturulmadı.","No identity created yet."],["Önce DID oluştur.","Create or restore a DID first."],["DID gerekli.","DID required."],
  ["Henüz private room yok.","No private room yet."],["Katkı bilgilerini doldur.","Fill in the contribution details."],["DID ve katkı linki gerekli.","DID and contribution URL required."],
  ["Yayınlanıyor...","Publishing..."],["İmzalanıyor...","Signing..."],["Gönderiliyor...","Sending..."],["Oda açılıyor...","Opening room..."],["Private room oluşturuluyor...","Creating private room..."],
  ["DID oluşturuldu","DID created"],["Kimlik geri yüklendi","Identity restored"],["Şifreli yedek indirildi","Encrypted backup downloaded"],["Public DID kopyalandı","Public DID copied"],
  ["DID note yayınlandı","DID note published"],["Signed hello kaydedildi","Signed hello saved"],["Lobby tanışması kaydedildi","Lobby introduction saved"],["Public room açıldı","Public room opened"],["Private room oluşturuldu","Private room created"],["Private room adı kopyalandı","Private room name copied"],["Profil metadata yayınlandı","Profile metadata published"],["Katkı kaydedildi","Contribution saved"],
  ["Proof kopyalandı","Proof copied"],["X paylaşım metni kopyalandı","X share text copied"],["Kurulum listesi kopyalandı","Setup checklist copied"]
]);

function translateDynamicEN() {
  if (!isEn()) return;
  const selectors = ["#s1","#s2","#s3","#s4","#s5","#s6","#s7","#s8","#s9","#s10","#s11","#identityOut","#didNoteOut","#helloOut","#introOut","#publicRoomOut","#privateRoomOut","#styleOut","#contribPreview","#contribOut","#autoOut","#toast"];
  for (const sel of selectors) {
    const el = $(sel);
    if (!el) continue;
    let value = el.textContent || "";
    if (exactEN.has(value)) value = exactEN.get(value);
    value = value
      .replace(/^Hata:\s*/i,"Error: ")
      .replace(/^Kalıcı Ed25519 imzalı contribution/i,"Durable Ed25519-signed contribution")
      .replace(/^Yerel Ed25519 imzasından geri yüklendi/i,"Restored from local Ed25519 signature")
      .replace(/^Geri yüklenen signed contribution/i,"Restored signed contribution")
      .replace(/^Yerel Ed25519 receipt doğrulandı/i,"Local Ed25519 receipt verified")
      .replace(/kalıcı proof'a bağlandı/i,"linked to the durable proof")
      .replace(/^Technocore note kapasitesi dolu\./i,"Technocore note capacity is full.")
      .replace(/^Technocore yeni oda kapasitesi dolu\./i,"Technocore new-room capacity is full.");
    if (el.textContent !== value) el.textContent = value;
  }
}

let dynamicTimers = [];
function scheduleBoundedRefresh() {
  dynamicTimers.forEach(clearTimeout);
  dynamicTimers = [0, 250, 1000, 3500, 12000].map((ms) => setTimeout(() => {
    applyStableLanguage();
    translateDynamicEN();
  }, ms));
}

function patchDialogs() {
  if (window.__rdStableDialogs) return;
  window.__rdStableDialogs = true;
  const nativePrompt = window.prompt.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  window.prompt = (message, ...rest) => {
    let m = String(message || "");
    if (isEn()) m = m.replace("Yedek parolasını gir:", "Enter the backup password:");
    return nativePrompt(m, ...rest);
  };
  window.confirm = (message, ...rest) => {
    let m = String(message || "");
    if (isEn()) m = m
      .replace("Private key GitHub Secret'e yapıştırmak için panoya kopyalanacak. Mesaj, X, Medium, issue veya public dosyaya yapıştırma. Devam edilsin mi?", "The private key will be copied to the clipboard for pasting into GitHub Secrets. Do not paste it into messages, X, Medium, issues, or public files. Continue?")
      .replace("Oturumdaki private key ve geçici kayıtları temizleyelim mi? Yedeğin varsa DID'yi geri yükleyebilirsin.", "Clear the private key and temporary session records? You can restore the DID later if you have the encrypted backup.");
    return nativeConfirm(m, ...rest);
  };
}

function applyStableLanguage() {
  const en = isEn();
  buildSwitcher();
  translateCore(en);
  translateVault(en);
  translateEnhancements(en);
  translateLiveStatic(en);
  patchDialogs();

  const ownerX = $("#ownerX");
  if (ownerX) {
    ownerX.href = cfg.xUrl || "https://x.com/joannawolker";
    ownerX.textContent = `𝕏 ${cfg.xHandle || "@joannawolker"}`;
  }
  const liveBadge = $(".top-actions .live");
  if (liveBadge) {
    const dot = liveBadge.querySelector("i");
    liveBadge.textContent = en ? " relay online" : " relay açık";
    if (dot) liveBadge.prepend(dot);
  }
  document.querySelectorAll('a[href="https://x.com/joannawalker"]').forEach((a) => { a.href = cfg.xUrl || "https://x.com/joannawolker"; });
}

function boot() {
  applyStableLanguage();
  translateDynamicEN();
  [350, 1900, 3200].forEach((ms) => setTimeout(() => {
    applyStableLanguage();
    translateDynamicEN();
  }, ms));
  document.addEventListener("click", scheduleBoundedRefresh, true);
  document.addEventListener("change", scheduleBoundedRefresh, true);
}

if (document.readyState === "complete") boot();
else window.addEventListener("load", boot, { once: true });
