const cfg = window.APP_CONFIG || {};

function currentLang() {
  const saved = localStorage.getItem("reddragon-lang");
  return saved === "en" ? "en" : "tr";
}

function fixProofImportCopy() {
  const proofBox = document.querySelector("#rdProofImport");
  if (!proofBox) return;

  const title = proofBox.querySelector(":scope > b");
  const desc = proofBox.querySelector(":scope > span");

  if (currentLang() === "en") {
    if (title) title.textContent = "Restore public proof";
    if (desc) {
      desc.textContent = " New proofs include the Ed25519 signature, so they can be verified locally even after the Technocore ring buffer removes the old message. Legacy v1 proofs can only be verified while the original record is still available on Technocore.";
    }
  } else {
    if (title) title.textContent = "Public proof'u geri yükle";
    if (desc) {
      desc.textContent = " Yeni proof'lar Ed25519 imzasını da içerir; Technocore ring buffer eski mesajı silse bile imza yerel olarak doğrulanabilir. Eski v1 proof'lar yalnızca kayıt hâlâ Technocore'da duruyorsa doğrulanabilir.";
    }
  }
}

function ensureUsageGuideStyles() {
  if (document.querySelector("#rdUsageGuideStyles")) return;
  const style = document.createElement("style");
  style.id = "rdUsageGuideStyles";
  style.textContent = `
    #rdUsageGuide{margin:22px 0 30px;padding:22px;border:1px solid rgba(86,170,255,.25);border-radius:18px;background:linear-gradient(180deg,rgba(19,31,45,.96),rgba(9,16,25,.96));box-shadow:0 18px 50px rgba(0,0,0,.18)}
    #rdUsageGuide .rd-guide-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#8ec8ff}
    #rdUsageGuide h2{margin:7px 0 6px;font-size:26px;line-height:1.15}
    #rdUsageGuide .rd-guide-lead{margin:0 0 16px;color:#aebdcb;line-height:1.55}
    #rdUsageGuide .rd-guide-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    #rdUsageGuide .rd-guide-step{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.025)}
    #rdUsageGuide .rd-guide-step b{display:block;margin-bottom:7px;color:#fff;font-size:14px}
    #rdUsageGuide .rd-guide-step span{display:block;color:#aebdcb;font-size:13px;line-height:1.5}
    #rdUsageGuide .rd-guide-num{display:inline-flex;width:27px;height:27px;align-items:center;justify-content:center;margin-bottom:9px;border-radius:9px;background:rgba(72,165,255,.14);color:#8ec8ff;font-weight:900;font-size:12px}
    #rdUsageGuide .rd-github-guide{margin-top:14px;padding:16px;border:1px solid rgba(67,210,137,.25);border-radius:14px;background:rgba(20,91,57,.12)}
    #rdUsageGuide .rd-github-guide h3{margin:0 0 9px;font-size:17px}
    #rdUsageGuide .rd-github-guide ol{margin:0;padding-left:21px;color:#c4d0da;line-height:1.65}
    #rdUsageGuide .rd-github-guide li+li{margin-top:4px}
    #rdUsageGuide code{white-space:normal;overflow-wrap:anywhere}
    #rdUsageGuide .rd-guide-ok{margin-top:12px;padding:11px 13px;border-radius:11px;background:rgba(67,210,137,.1);color:#bcebd2;font-size:13px;line-height:1.5}
    #rdUsageGuide .rd-guide-danger{margin-top:9px;color:#ffb6b6;font-size:12px;line-height:1.5}
    #rdGuideJump{white-space:nowrap}
    @media(max-width:900px){#rdUsageGuide .rd-guide-flow{grid-template-columns:1fr 1fr}}
    @media(max-width:580px){#rdUsageGuide{padding:17px}#rdUsageGuide .rd-guide-flow{grid-template-columns:1fr}#rdUsageGuide h2{font-size:22px}}
  `;
  document.head.appendChild(style);
}

function ensureUsageGuide(isEn) {
  ensureUsageGuideStyles();

  const signal = document.querySelector(".signalbar");
  if (!signal) return;

  let guide = document.querySelector("#rdUsageGuide");
  if (!guide) {
    guide = document.createElement("section");
    guide.id = "rdUsageGuide";
    signal.after(guide);
  }

  guide.innerHTML = isEn ? `
    <span class="rd-guide-kicker">START HERE · SIMPLE GUIDE</span>
    <h2>How to use RedDragon</h2>
    <p class="rd-guide-lead"><b>Do not skip the order.</b> Finish a step only when it shows green / Done. A different person must create their own DID, backup, private key and GitHub fork.</p>
    <div class="rd-guide-flow">
      <div class="rd-guide-step"><i class="rd-guide-num">1</i><b>Steps 01–08 · Build your identity</b><span>Create the DID, download the encrypted backup, then press the buttons from 03 through 08 in order. Wait for green / Done before moving on.</span></div>
      <div class="rd-guide-step"><i class="rd-guide-num">2</i><b>Step 09 · Save a real contribution</b><span>Add the public link to your real contribution, a title and one clear summary sentence. Save it as a signed record.</span></div>
      <div class="rd-guide-step"><i class="rd-guide-num">3</i><b>Step 10 · Keep your proof</b><span>When the proof appears, click <b>Download Proof JSON</b>. This public proof does not contain your private key.</span></div>
      <div class="rd-guide-step"><i class="rd-guide-num">4</i><b>Step 11 · Turn on the 24/7 agent</b><span>Optional but recommended: connect your own GitHub fork so the agent can keep running while your computer is off.</span></div>
    </div>
    <div class="rd-github-guide" id="rdUsageGithub">
      <h3>GitHub agent · easiest setup</h3>
      <ol>
        <li>Enter <b>your GitHub username</b> on Step 11.</li>
        <li>Click <b>1 · Fork repository</b>.</li>
        <li>Return to RedDragon and click <b>2 · Copy private key</b>.</li>
        <li>Click <b>3 · Open Secrets page</b>. Create one repository secret named <code>TECHNOCORE_PRIVATE_KEY_PKCS8_B64</code> and paste the copied value into it.</li>
        <li>Click <b>4 · Open / test Actions</b>.</li>
        <li>On a new fork GitHub may show <b>“I understand my workflows, go ahead and enable them”</b>. Approve it once.</li>
        <li>Open <b>RedDragon Technocore Agent</b> → <b>Run workflow</b>. Green <b>Success</b> means setup is complete. The backup schedule then works automatically too.</li>
      </ol>
      <div class="rd-guide-ok"><b>Done means:</b> DID steps are green, Proof JSON is saved, and the GitHub Actions test shows Success. After that, you do not need to keep the PC open.</div>
      <div class="rd-guide-danger"><b>Never share:</b> private key, encrypted identity backup password, wallet seed phrase, GitHub password or account token. The private key belongs only in your own GitHub Actions Secret.</div>
    </div>` : `
    <span class="rd-guide-kicker">BURADAN BAŞLA · BASİT REHBER</span>
    <h2>RedDragon nasıl kullanılır?</h2>
    <p class="rd-guide-lead"><b>Sırayı bozma.</b> Bir adım yeşil / Tamam olmadan sonrakine geçme. Başka bir kişi kullanacaksa kendi ayrı DID'sini, yedeğini, private key'ini ve GitHub fork'unu oluşturmalı.</p>
    <div class="rd-guide-flow">
      <div class="rd-guide-step"><i class="rd-guide-num">1</i><b>01–08 · Kimliğini kur</b><span>DID oluştur, şifreli yedeğini indir, sonra 03'ten 08'e kadar butonlara sırayla bas. Her adımın yeşil / Tamam olmasını bekle.</span></div>
      <div class="rd-guide-step"><i class="rd-guide-num">2</i><b>09 · Gerçek katkını kaydet</b><span>Yayınladığın gerçek public katkının linkini, başlığını ve tek cümlelik açıklamasını yaz. Signed record olarak kaydet.</span></div>
      <div class="rd-guide-step"><i class="rd-guide-num">3</i><b>10 · Proof'unu sakla</b><span>Proof oluşunca <b>Proof JSON indir</b>. Bu public kanıttır; private key içermez.</span></div>
      <div class="rd-guide-step"><i class="rd-guide-num">4</i><b>11 · 7/24 ajanı aç</b><span>Opsiyonel ama faydalı: kendi GitHub fork'unu bağla. Bilgisayarın kapalıyken de ajan çalışmaya devam edebilir.</span></div>
    </div>
    <div class="rd-github-guide" id="rdUsageGithub">
      <h3>GitHub ajanı · en kolay kurulum</h3>
      <ol>
        <li>11. adımda <b>kendi GitHub kullanıcı adını</b> yaz.</li>
        <li><b>1 · Repoyu Forkla</b> butonuna bas.</li>
        <li>RedDragon sitesine dön ve <b>2 · Private key'i kopyala</b> butonuna bas.</li>
        <li><b>3 · Secret sayfasını aç</b>. GitHub'da adı <code>TECHNOCORE_PRIVATE_KEY_PKCS8_B64</code> olan tek bir Repository Secret oluştur ve kopyaladığın değeri içine yapıştır.</li>
        <li><b>4 · Actions'ı aç / test et</b> butonuna bas.</li>
        <li>Yeni fork'ta GitHub <b>“I understand my workflows, go ahead and enable them”</b> uyarısı gösterirse bunu bir kez onayla.</li>
        <li><b>RedDragon Technocore Agent</b> → <b>Run workflow</b>. Yeşil <b>Success</b> görürsen kurulum tamamdır. Yedek schedule da bundan sonra otomatik çalışır.</li>
      </ol>
      <div class="rd-guide-ok"><b>İşin bittiğini böyle anlarsın:</b> DID adımları yeşil, Proof JSON indirilmiş ve GitHub Actions testi Success. Bundan sonra PC'yi açık tutman gerekmez.</div>
      <div class="rd-guide-danger"><b>Asla paylaşma:</b> private key, şifreli kimlik yedeğinin parolası, wallet seed phrase, GitHub şifresi veya hesap tokeni. Private key yalnızca kendi GitHub Actions Secret alanına girilir.</div>
    </div>`;

  const heroActions = document.querySelector(".hero-actions");
  if (heroActions) {
    let jump = document.querySelector("#rdGuideJump");
    if (!jump) {
      jump = document.createElement("a");
      jump.id = "rdGuideJump";
      jump.className = "ghost-link";
      jump.href = "#rdUsageGuide";
      heroActions.appendChild(jump);
    }
    jump.textContent = isEn ? "How to use" : "Nasıl kullanılır?";
  }
}

function fixQuickSetupOrder(isEn) {
  const quick = document.querySelector("#rdQuickSetup");
  if (!quick) return;

  const title = quick.querySelector(":scope > h3");
  const intro = quick.querySelector(":scope > p");
  if (title) title.textContent = isEn ? "Quick secure agent setup" : "Hızlı güvenli ajan kurulumu";
  if (intro) intro.textContent = isEn
    ? "No coding: fork the repository → copy your private key → add one secret → run Actions. RedDragon never asks for a GitHub token."
    : "Kod bilmen gerekmez: repoyu forkla → private key'i kopyala → tek secret'i ekle → Actions'ı çalıştır. RedDragon GitHub tokeni istemez.";

  const actions = quick.querySelector(".rd-quick-actions");
  const fork = actions?.querySelector("a");
  const copyPrivate = document.querySelector("#rdCopyPrivate");
  const openSecrets = document.querySelector("#rdOpenSecrets");
  const openActions = document.querySelector("#rdOpenActions");

  if (fork && copyPrivate && openSecrets && openActions && actions) {
    fork.textContent = isEn ? "1 · Fork repository" : "1 · Repoyu Forkla";
    copyPrivate.textContent = isEn ? "2 · Copy private key" : "2 · Private key'i kopyala";
    openSecrets.textContent = isEn ? "3 · Open Secrets page" : "3 · Secret sayfasını aç";
    openActions.textContent = isEn ? "4 · Open / test Actions" : "4 · Actions'ı aç / test et";
    actions.append(fork, copyPrivate, openSecrets, openActions);
  }

  const warning = document.querySelector('[data-step="11"] .warning-box span');
  if (warning) {
    warning.textContent = isEn
      ? "Primary and backup workflows run on staggered schedules. If GitHub delays one schedule, a later trigger can recover. Durable Technocore state keeps signed check-ins at least 12 hours apart."
      : "Ana ve yedek workflow farklı dakikalarda çalışır. GitHub bir schedule'ı geciktirirse sonraki tetikleyici telafi edebilir. Technocore kalıcı kilidi signed check-in'leri en az 12 saat aralıklı tutar.";
  }

  const autoOut = document.querySelector("#autoOut");
  if (autoOut) {
    autoOut.textContent = isEn
      ? "Fork-safe agent: the DID is derived from the private key. Primary + backup schedules provide redundancy; only one GitHub Secret is required."
      : "Fork-safe ajan: DID private key'den otomatik türetilir. Ana + yedek schedule ile yedekli çalışır; yalnızca tek GitHub Secret gerekir.";
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function bindSimpleChecklist(isEn) {
  const btn = document.querySelector("#copyAutoGuide");
  if (!btn) return;

  btn.textContent = isEn ? "Copy quick setup checklist" : "Hızlı kurulum listesini kopyala";
  btn.onclick = async () => {
    const user = document.querySelector("#rdGithubUser")?.value.trim().replace(/^@/, "");
    const repo = document.querySelector("#rdGithubRepo")?.value.trim() || "reddragon-technocore";
    const base = user ? `https://github.com/${user}/${repo}` : "YOUR_FORK";
    const text = isEn
      ? `RedDragon Technocore Agent — simple setup\n\n1) Fork the RedDragon repository.\n2) On RedDragon, click “Copy private key”.\n3) Open your fork's Settings → Secrets and variables → Actions.\n4) Create one Repository Secret:\n   Name: TECHNOCORE_PRIVATE_KEY_PKCS8_B64\n   Secret: paste the copied private key\n5) Open Actions. On a new fork, approve “I understand my workflows, go ahead and enable them” once.\n6) RedDragon Technocore Agent → Run workflow.\n7) Green Success = done. Primary + backup schedules then run automatically.\n\nFork: ${base}\nSecrets: ${base}/settings/secrets/actions\nActions: ${base}/actions/workflows/technocore-agent.yml\n\nSecurity: never share the private key, backup password, wallet seed phrase, GitHub password or token.`
      : `RedDragon Technocore Agent — basit kurulum\n\n1) RedDragon reposunu forkla.\n2) RedDragon sitesinde “Private key'i kopyala” butonuna bas.\n3) Kendi fork'unda Settings → Secrets and variables → Actions sayfasını aç.\n4) Tek bir Repository Secret oluştur:\n   Name: TECHNOCORE_PRIVATE_KEY_PKCS8_B64\n   Secret: kopyaladığın private key'i yapıştır\n5) Actions'ı aç. Yeni fork'ta “I understand my workflows, go ahead and enable them” uyarısını bir kez onayla.\n6) RedDragon Technocore Agent → Run workflow.\n7) Yeşil Success = tamam. Ana + yedek schedule bundan sonra otomatik çalışır.\n\nFork: ${base}\nSecrets: ${base}/settings/secrets/actions\nActions: ${base}/actions/workflows/technocore-agent.yml\n\nGüvenlik: private key, yedek parolası, wallet seed phrase, GitHub şifresi veya tokenini kimseyle paylaşma.`;

    await copyText(text);
    const old = btn.textContent;
    btn.textContent = isEn ? "Copied ✓" : "Kopyalandı ✓";
    setTimeout(() => { btn.textContent = old; }, 1500);
  };
}

function applyFinalFixes() {
  const isEn = currentLang() === "en";
  const handle = cfg.xHandle || "@joannawolker";
  const url = cfg.xUrl || "https://x.com/joannawolker";

  const ownerX = document.querySelector("#ownerX");
  if (ownerX) {
    ownerX.href = url;
    ownerX.textContent = `𝕏 ${handle}`;
  }

  const xInput = document.querySelector("#xhandle");
  if (xInput && (!xInput.value.trim() || xInput.value.trim() === "@joannawalker")) {
    xInput.value = handle;
    xInput.setAttribute("value", handle);
  }

  document.querySelectorAll('a[href="https://x.com/joannawalker"]').forEach((a) => {
    a.href = url;
    a.textContent = (a.textContent || "").replaceAll("@joannawalker", handle);
  });

  const didSecret = document.querySelector("#copyDidSecret")?.closest(".secret-row");
  if (didSecret) didSecret.classList.add("rd-hidden");

  const secretTitle = [...document.querySelectorAll('[data-step="11"] h3')]
    .find((h) => /Repository Secret/i.test(h.textContent || ""));
  if (secretTitle) {
    secretTitle.textContent = isEn
      ? "Repository Secret · only one required"
      : "Repository Secret · sadece 1 tane";
  }

  const securityNote = document.querySelector("#rdQuickSetup .rd-security-note");
  if (securityNote) {
    securityNote.innerHTML = isEn
      ? '<b>Security rule</b> RedDragon never asks for your GitHub password, token, or wallet seed phrase. You paste the private key yourself only into the <b>Actions Secret</b> area of your own repository. The private key is never sent to a RedDragon server or written to public GitHub files.'
      : '<b>Güvenlik kuralı</b> RedDragon GitHub şifreni, tokenini veya wallet seed phrase\'ini istemez. Private key\'i yalnızca kendi GitHub repondaki <b>Actions Secret</b> alanına sen yapıştırırsın. Private key RedDragon sunucusuna gönderilmez ve public GitHub dosyalarına yazılmaz.';
  }

  fixProofImportCopy();
  ensureUsageGuide(isEn);
  fixQuickSetupOrder(isEn);
  bindSimpleChecklist(isEn);

  const card = document.querySelector('[data-step="11"]');
  if (card) {
    let note = document.querySelector("#rdGithubScheduleNote");
    if (!note) {
      note = document.createElement("div");
      note.id = "rdGithubScheduleNote";
      note.className = "rd-security-note";
      const quick = document.querySelector("#rdQuickSetup");
      if (quick) quick.before(note); else card.appendChild(note);
    }
    note.innerHTML = isEn
      ? "<b>GitHub schedule note</b> Scheduled workflows are disabled by default on public forks until you enable Actions. GitHub can also disable scheduled workflows in a public repository after 60 days with no repository activity."
      : "<b>GitHub zamanlama notu</b> Public fork'larda scheduled workflow, Actions'tan etkinleştirene kadar varsayılan olarak kapalıdır. Ayrıca GitHub, public bir repoda 60 gün repo aktivitesi olmazsa scheduled workflow'u otomatik devre dışı bırakabilir.";
  }
}

window.addEventListener("load", () => {
  applyFinalFixes();
  setTimeout(applyFinalFixes, 300);
  setTimeout(applyFinalFixes, 1500);
});
