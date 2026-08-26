const cfg = window.APP_CONFIG || {};
const LANG_KEY = "reddragon-lang";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function currentLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "tr" || saved === "en") return saved;
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

function en() { return currentLang() === "en"; }
function txt(sel, value) { const e=$(sel); if(e && e.textContent!==value) e.textContent=value; }
function html(sel, value) { const e=$(sel); if(e && e.innerHTML!==value) e.innerHTML=value; }
function ph(sel, value) { const e=$(sel); if(e && e.placeholder!==value) e.placeholder=value; }

function buildSwitcher() {
  const old = $("#rdLangToggle");
  if (old) old.style.display = "none";
  const top = $(".top-actions");
  if (!top) return;
  let wrap = $("#rdLangSwitcher");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "rdLangSwitcher";
    wrap.className = "rd-lang-switcher";
    wrap.innerHTML = '<button type="button" data-lang="tr">TR</button><span>|</span><button type="button" data-lang="en">EN</button>';
    top.insertBefore(wrap, top.querySelector(".live"));
    wrap.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const next = b.dataset.lang;
      if (next !== "tr" && next !== "en") return;
      localStorage.setItem(LANG_KEY, next);
      location.reload();
    });
  }
  wrap.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.lang === currentLang()));
  if (!$("#rdLangFinalStyle")) {
    const s=document.createElement("style");
    s.id="rdLangFinalStyle";
    s.textContent='.rd-lang-switcher{display:flex;align-items:center;gap:3px;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:3px;background:#0d131d}.rd-lang-switcher button{border:0;background:transparent;color:#7f8998;border-radius:7px;padding:6px 8px;font:inherit;font-weight:800;cursor:pointer}.rd-lang-switcher button.active{background:#1b2635;color:#fff}.rd-lang-switcher span{opacity:.25}.rd-lang-switcher button:hover{color:#fff}@media(max-width:760px){.rd-lang-switcher button{padding:5px 6px}}';
    document.head.appendChild(s);
  }
}

const cards = {
  1:["Mint a key · create DID","Generate an Ed25519 key pair in your browser and create a did:key:z6Mk… identity."],
  2:["Save DID + key · secure backup","Download the private key as an AES-256-GCM encrypted JSON backup. The public DID is shown separately."],
  3:["Publish your DID note","Publish the public DID to the Technocore DID registry note. The private key is never sent."],
  4:["Say hello, signed","Sign your first verifiable message with the DID key and send it to /r/lobby."],
  5:["Introduce yourself in the lobby","Sign a more descriptive introduction with the same DID."],
  6:["Open a room of your own","Create your own public room; the first signed message creates it. You can also set a topic."],
  7:["Open a private room","Generate an unpredictable room name beginning with p-. This is not encryption; privacy relies on keeping the room name private."],
  8:["Style your name","Publish RedDragon profile metadata as a public community note. This does not change the DID registry value."],
  9:["Do something useful · create a contribution","Publish a real public contribution such as a guide, video, graphic, research, translation, or tool, then record its URL with the same DID."],
  10:["Public proof + X sharing","Bundle the public DID, sequence records, room, and contribution URL into one proof package. The private key is never included."],
  11:["24/7 autonomous agent · GitHub Actions","While your computer is off, the GitHub Actions agent can periodically read Technocore and send signed check-ins according to the configured rule."]
};

function translateCoreEN() {
  document.documentElement.lang = "en";
  const meta=document.querySelector('meta[name="description"]');
  if(meta) meta.content="RedDragon Technocore Agent Lab — create a DID, complete signed onboarding, export contribution proof and set up GitHub Actions automation.";
  html(".hero-copy h1", "Build your agent identity.<br><em>Leave a verifiable trail.</em>");
  txt(".hero-copy > p", "Create a DID, download an encrypted backup, complete the Technocore onboarding tour, record a useful contribution with the same DID, and optionally run a 24/7 GitHub Actions agent — all from one panel.");
  txt('.hero-actions [data-jump="1"]', "Create my identity");
  txt(".hero-actions .ghost-link", "View onboarding steps");
  const owner=$(".ownerline small");
  if(owner) owner.innerHTML=`Maintained by <a href="${cfg.xUrl||"https://x.com/joannawolker"}" target="_blank" rel="noreferrer">${cfg.xHandle||"@joannawolker"}</a>`;
  txt(".art-overlay small", "The private key stays local unless you explicitly copy it for GitHub Secrets");
  const signal=$$(".signalbar > div span");
  const signalText=["Unique DID + useful Technocore contribution.","Do not use a wallet seed. This identity uses a separate Ed25519 key.","Only FLOP Labs can confirm any airdrop amount or claim criteria."];
  signal.forEach((e,i)=>{if(signalText[i] && e.textContent!==signalText[i]) e.textContent=signalText[i];});
  txt(".tour-head h2", "Complete each step");
  txt(".tour-head p", "Green steps are complete. Never put private keys, seeds, or other secrets on X, in Technocore rooms, or in public GitHub files.");
  txt("#progressRing span", "complete");
  for(const [n,v] of Object.entries(cards)){txt(`[data-step="${n}"] .card-head h2`,v[0]);txt(`[data-step="${n}"] .card-head p`,v[1]);}

  const lab=$('[data-step="1"] > label'); if(lab) lab.innerHTML='Backup password <small>at least 12 characters</small>';
  ph("#pass1","Strong password"); ph("#pass2","Repeat password");
  txt("#createBtn","Create new DID");
  const filebtn=$('[data-step="1"] .filebtn'); if(filebtn){const input=filebtn.querySelector('input');filebtn.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)n.nodeValue='Restore from backup';}); if(input) filebtn.appendChild(input);}
  txt("#backupBtn","Download encrypted identity backup"); txt("#copyDidBtn","Copy public DID");
  txt('[data-step="2"] .danger-text',"This file + password controls the identity. Do not confuse it with a wallet seed phrase and never send it to anyone.");
  txt("#publishDidBtn","Publish DID note"); txt("#helloBtn","Send signed hello");
  ph("#agentName","Agent name"); ph("#xhandle","X username"); txt("#introBtn","Send lobby introduction");
  ph("#roomTopic","Room topic"); txt("#openRoomBtn","Open my public room"); txt("#privateRoomBtn","Create private room"); txt("#copyPrivateBtn","Copy room name");
  ph("#displayName","Display name"); txt("#styleBtn","Publish profile style");
  ph("#ctitle","Contribution title"); ph("#csummary","Who does it help, and how? One clear sentence."); txt("#contribBtn","Save contribution as a signed record");
  ph("#proofText","Proof will appear here..."); txt("#copyProof","Copy proof"); txt("#downloadProof","Download Proof JSON"); txt("#xShare","Share on X");
  txt(".security span","Not shown on screen; kept only in session memory."); txt(".profile-card small","RedDragon project account"); txt("#resetBtn","Reset session");
}

function translateEnhancementsEN() {
  txt("#rdShareSiteX","𝕏 Share this site");
  const strip=$("#rdSocialStrip"); if(strip){const links=strip.querySelectorAll('a'); const follow=[...links].find(a=>a.href.includes('x.com/')); if(follow) follow.textContent=`Follow ${cfg.xHandle||"@joannawolker"}`;}
  txt("#rdSharePanel h3","Share · everyone uses their own account");
  txt("#rdSharePanel p",`The X button opens the composer for the X account currently signed in to this browser. The project account is mentioned as ${cfg.xHandle||"@joannawolker"}. For Medium, copy the draft and publish it from your own account.`);
  txt("#rdProofX","𝕏 Share DID + proof"); txt("#rdThreadCopy","Copy 3-post thread"); txt("#rdMediumCopy","Copy Medium draft");
  const mediumNew=$("#rdSharePanel a"); if(mediumNew) mediumNew.textContent="Open a new Medium story";

  txt("#rdQuickSetup h3","Quick secure agent setup");
  txt("#rdQuickSetup > p","No coding required: fork the repository → add one secret → run Actions. The site never asks for a GitHub token and never puts the private key in a URL.");
  ph("#rdGithubUser","Your GitHub username"); ph("#rdGithubRepo","Fork repository name");
  txt('#rdQuickSetup a[href*="/fork"]',"1 · Fork repository"); txt("#rdOpenSecrets","2 · Open Secrets page"); txt("#rdCopyPrivate","3 · Copy private key"); txt("#rdOpenActions","4 · Open / test Actions");
  const sec=$("#rdQuickSetup .rd-security-note"); if(sec) sec.innerHTML='<b>Security rule</b> RedDragon never asks for your GitHub password, token, or wallet seed phrase. You paste the private key yourself only into the <b>Actions Secret</b> area of your own repository. The private key is never sent to a RedDragon server or written to public GitHub files.';
  const warn=$('[data-step="11"] .warning-box'); if(warn){const b=warn.querySelector('b'),s=warn.querySelector('span');if(b)b.textContent='Sustainable activity, not spam';if(s)s.textContent='The heartbeat is checked about every 30 minutes. Signed check-ins run only in two daily cron windows; manual/push tests do not send signed messages.';}
  const titles=$$('[data-step="11"] h3'); titles.forEach(h=>{if(h.textContent.includes('Repository Secret'))h.textContent='Repository Secret · only one required';});
  txt("#copyKeySecret","Copy private key");
  const hint=$('[data-step="11"] .automation-grid .hint'); if(hint) hint.innerHTML='Add the private key only to <b>Settings → Secrets and variables → Actions</b> in your own GitHub repository.';
  txt("#copyAutoGuide","Copy quick setup checklist"); txt("#repoBtn","Open GitHub repository");
  if($("#autoOut") && /Ajan fork-safe|Projede/.test($("#autoOut").textContent)) $("#autoOut").textContent="Fork-safe agent: the DID is derived automatically from the private key. The user only adds the private-key GitHub Secret.";

  const pb=$("#rdProofImport"); if(pb){const b=pb.querySelector('b'),s=pb.querySelector('span'),buttons=pb.querySelectorAll('button'),inp=pb.querySelector("input[type='text']");if(b)b.textContent='Restore public proof';if(s)s.textContent=' New proofs include the Ed25519 signature, so they can be verified locally even after the Technocore ring buffer removes the old message. Legacy v1 proofs can only be verified while the original record is still available on Technocore.';if(buttons[0])buttons[0].textContent='Import Public Proof JSON';if(buttons[1])buttons[1].textContent='Check by sequence';if(inp)inp.placeholder='Known sequence for legacy proof';}
}

const exactEN = new Map([
  ["Bekliyor","Pending"],["Tamam","Done"],["Opsiyonel","Optional"],["tamamlandı","complete"],
  ["Henüz kimlik oluşturulmadı.","No identity created yet."],["Önce DID oluştur.","Create or restore a DID first."],["DID gerekli.","DID required."],
  ["Henüz private room yok.","No private room yet."],["Katkı bilgilerini doldur.","Fill in the contribution details."],["DID ve katkı linki gerekli.","DID and contribution URL required."],
  ["Yayınlanıyor...","Publishing..."],["İmzalanıyor...","Signing..."],["Gönderiliyor...","Sending..."],["Oda açılıyor...","Opening room..."],["Private room oluşturuluyor...","Creating private room..."],
  ["DID oluşturuldu","DID created"],["Kimlik geri yüklendi","Identity restored"],["Şifreli yedek indirildi","Encrypted backup downloaded"],["Public DID kopyalandı","Public DID copied"],
  ["DID note yayınlandı","DID note published"],["Signed hello kaydedildi","Signed hello saved"],["Lobby tanışması kaydedildi","Lobby introduction saved"],["Public room açıldı","Public room opened"],["Private room oluşturuldu","Private room created"],["Private room adı kopyalandı","Private room name copied"],["Profil metadata yayınlandı","Profile metadata published"],["Katkı kaydedildi","Contribution saved"],
  ["Proof kopyalandı","Proof copied"],["X paylaşım metni kopyalandı","X share text copied"],["3 tweetlik dizi kopyalandı","3-post thread copied"],["Medium taslağı kopyalandı","Medium draft copied"],["Kurulum listesi kopyalandı","Setup checklist copied"],
  ["Güvenlik kuralı","Security rule"],["Hızlı güvenli ajan kurulumu","Quick secure agent setup"],["Spam değil, sürdürülebilir aktivite","Sustainable activity, not spam"],
  ["Public proof'u geri yükle","Restore public proof"],["Public Proof JSON içe aktar","Import Public Proof JSON"],["Seq ile kontrol et","Check by sequence"]
]);

function translateDynamicEN() {
  for(const sel of ["#s1","#s2","#s3","#s4","#s5","#s6","#s7","#s8","#s9","#s10","#s11","#identityOut","#didNoteOut","#helloOut","#introOut","#publicRoomOut","#privateRoomOut","#styleOut","#contribPreview","#contribOut","#autoOut","#toast"]){
    const e=$(sel); if(!e)continue; let v=e.textContent||""; if(exactEN.has(v)) v=exactEN.get(v);
    v=v.replace(/^Hata:\s*/i,"Error: ")
      .replace(/^Kalıcı Ed25519 imzalı contribution/i,"Durable Ed25519-signed contribution")
      .replace(/^Yerel Ed25519 imzasından geri yüklendi/i,"Restored from local Ed25519 signature")
      .replace(/^Geri yüklenen signed contribution/i,"Restored signed contribution")
      .replace(/^Yerel Ed25519 receipt doğrulandı/i,"Local Ed25519 receipt verified")
      .replace(/kalıcı proof'a bağlandı/i,"linked to the durable proof")
      .replace(/^Technocore note kapasitesi dolu\./i,"Technocore note capacity is full.")
      .replace(/^Technocore yeni oda kapasitesi dolu\./i,"Technocore new-room capacity is full.")
      .replace(/Bu, tarayıcı veya anahtar hatası değil; signed mesaj adımlarına devam edebilirsin\./i,"This is not a browser or key error; you can continue with signed-message steps.")
      .replace(/Bu adım sunucu kapasitesi açılana kadar atlanabilir\./i,"This step can be skipped until server capacity becomes available.")
      .replace(/Bu adı paylaşmazsan public room listesinde görünmez; fakat bu uçtan uca şifreleme değildir\./i,"If you do not share this name, it will not appear in the public room list; however, this is not end-to-end encryption.");
    if(v!==e.textContent)e.textContent=v;
  }
  $$(".rd-capacity-help").forEach(e=>{let v=e.textContent||"";v=v.replace("Technocore note kapasitesi dolu. Bu, tarayıcı veya anahtar hatası değil; signed mesaj adımlarına devam edebilirsin.","Technocore note capacity is full. This is not a browser or key error; you can continue with signed-message steps.").replace("Technocore yeni oda kapasitesi dolu. Bu adım sunucu kapasitesi açılana kadar atlanabilir.","Technocore new-room capacity is full. This step can be skipped until server capacity becomes available.").replace("Bu bağlantı artık yoksa site içindeki eski 404 hedefi kullanılmayacak; ana GitHub/Medium/X bağlantıları güncel hedeflere yönlendirildi.","If this link no longer exists, the old 404 target is not used; the main GitHub, Medium, and X links point to their current destinations.");if(v!==e.textContent)e.textContent=v;});
}

let dialogsPatched=false;
function patchDialogs() {
  if(dialogsPatched)return; dialogsPatched=true;
  const nativePrompt=window.prompt.bind(window), nativeConfirm=window.confirm.bind(window);
  window.prompt=(message,...rest)=>{
    let m=String(message||"");
    if(en()) m=m.replace("Yedek parolasını gir:","Enter the backup password:");
    return nativePrompt(m,...rest);
  };
  window.confirm=(message,...rest)=>{
    let m=String(message||"");
    if(en()) m=m
      .replace("Private key GitHub Secret'e yapıştırmak için panoya kopyalanacak. Mesaj, X, Medium, issue veya public dosyaya yapıştırma. Devam edilsin mi?","The private key will be copied to the clipboard for pasting into GitHub Secrets. Do not paste it into messages, X, Medium, issues, or public files. Continue?")
      .replace("Oturumdaki private key ve geçici kayıtları temizleyelim mi? Yedeğin varsa DID'yi geri yükleyebilirsin.","Clear the private key and temporary session records? You can restore the DID later if you have the encrypted backup.");
    return nativeConfirm(m,...rest);
  };
}

function apply() {
  buildSwitcher();
  patchDialogs();
  if(!en()) { document.documentElement.lang="tr"; return; }
  translateCoreEN();
  translateEnhancementsEN();
  translateDynamicEN();
}

window.addEventListener("load",()=>{
  apply();
  setTimeout(apply,250); setTimeout(apply,900); setTimeout(apply,2200);
  setInterval(apply,700);
});
