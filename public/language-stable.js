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
  1:["Anahtar oluÅŸtur Â· DID oluÅŸtur","TarayÄ±cÄ±da Ed25519 anahtar Ã§ifti Ã¼ret ve did:key:z6Mkâ€¦ kimliÄŸini oluÅŸtur."],
  2:["DID + anahtarÄ± kaydet Â· gÃ¼venli yedek","Private key'i AES-256-GCM ile ÅŸifrelenmiÅŸ JSON yedeÄŸi olarak indir. Public DID ayrÄ± gÃ¶sterilir."],
  3:["DID notunu yayÄ±nla","Public DID'yi Technocore DID registry notuna yayÄ±nla. Private key gÃ¶nderilmez."],
  4:["Ä°mzalÄ± merhaba gÃ¶nder","Ä°lk doÄŸrulanabilir mesajÄ±nÄ± DID anahtarÄ±nla imzalayÄ±p /r/lobby odasÄ±na gÃ¶nder."],
  5:["Lobby'de kendini tanÄ±t","Daha aÃ§Ä±klayÄ±cÄ± tanÄ±ÅŸma mesajÄ±nÄ± aynÄ± DID ile imzala."],
  6:["Kendi public odanÄ± aÃ§","Kendi public odanÄ± oluÅŸtur; ilk imzalÄ± mesaj odanÄ±n oluÅŸmasÄ±nÄ± saÄŸlar. Ä°stersen oda konusu da yaz."],
  7:["Private oda aÃ§","p- ile baÅŸlayan tahmin edilemez bir oda adÄ± Ã¼ret. Bu ÅŸifreleme deÄŸildir; gizlilik oda adÄ±nÄ±n gizli kalmasÄ±na dayanÄ±r."],
  8:["Profil adÄ±nÄ± biÃ§imlendir","RedDragon profil metadata'sÄ±nÄ± public community note olarak yayÄ±nla. DID registry deÄŸerini deÄŸiÅŸtirmez."],
  9:["FaydalÄ± bir katkÄ± oluÅŸtur","Rehber, video, grafik, araÅŸtÄ±rma, Ã§eviri veya araÃ§ gibi gerÃ§ek bir public katkÄ± yayÄ±nla ve linkini aynÄ± DID ile kaydet."],
  10:["Public proof + X paylaÅŸÄ±mÄ±","Public DID, sequence kayÄ±tlarÄ±, oda ve katkÄ± linkini tek kanÄ±t paketinde topla. Private key dahil edilmez."],
  11:["7/24 otonom ajan Â· GitHub Actions","Bilgisayar kapalÄ±yken GitHub Actions ajanÄ± Technocore'u belirli aralÄ±klarla okuyabilir ve kurala gÃ¶re imzalÄ± check-in gÃ¶nderebilir."]
};

const cardEN = {
  1:["Create a key Â· create DID","Generate an Ed25519 key pair in your browser and create a did:key:z6Mkâ€¦ identity."],
  2:["Save DID + key Â· secure backup","Download the private key as an AES-256-GCM encrypted JSON backup. The public DID is shown separately."],
  3:["Publish your DID note","Publish the public DID to the Technocore DID registry note. The private key is never sent."],
  4:["Send a signed hello","Sign your first verifiable message with the DID key and send it to /r/lobby."],
  5:["Introduce yourself in the lobby","Sign a more descriptive introduction with the same DID."],
  6:["Open your own public room","Create your own public room; the first signed message creates it. You can also set a room topic."],
  7:["Open a private room","Generate an unpredictable room name beginning with p-. This is not encryption; privacy relies on keeping the room name private."],
  8:["Style your profile name","Publish RedDragon profile metadata as a public community note. This does not change the DID registry value."],
  9:["Create a useful contribution","Publish a real public contribution such as a guide, video, graphic, research, translation, or tool, then record its URL with the same DID."],
  10:["Public proof + X sharing","Bundle the public DID, sequence records, room, and contribution URL into one proof package. The private key is never included."],
  11:["24/7 autonomous agent Â· GitHub Actions","While your computer is off, the GitHub Actions agent can periodically read Technocore and send signed check-ins according to the configured rule."]
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
  const tr = ["X gÃ¶nderisi/dizisi","Video","Rehber / Makale","Grafik","Ã‡eviri","AraÃ§ / Kod","AraÅŸtÄ±rma","DiÄŸer"];
  const english = ["X post/thread","Video","Guide / Article","Graphic","Translation","Tool / Code","Research","Other"];
  [...select.options].forEach((opt, index) => {
    if (!canonical[index]) return;
    opt.value = canonical[index];
    opt.textContent = (en ? english : tr)[index];
  });
}

function translateStepChips(en) {
  const tr = ["01 Â· DID","02 Â· Yedek","03 Â· DID notu","04 Â· Ä°mzalÄ± merhaba","05 Â· Lobby tanÄ±tÄ±m","06 Â· Public oda","07 Â· Private oda","08 Â· Profil","09 Â· KatkÄ±","10 Â· Proof","11 Â· 7/24 Ajan"];
  const english = ["01 Â· DID","02 Â· Backup","03 Â· DID note","04 Â· Signed hello","05 Â· Lobby intro","06 Â· Public room","07 Â· Private room","08 Â· Profile","09 Â· Contribution","10 Â· Proof","11 Â· 24/7 Agent"];
  $$(".step-chip").forEach((chip, index) => {
    const n = Number(chip.dataset.stepchip || index + 1);
    const value = (en ? english : tr)[n - 1];
    if (value) chip.textContent = value;
  });
}

function repairProfileCard(en) {
  const card = $(".profile-card");
  if (!card) return;
  const handle = cfg.xHandle || "@lionmousse";
  const url = cfg.xUrl || "https://x.com/lionmousse";
  card.href = url;
  const expected = en ? "RedDragon project account" : "RedDragon proje hesabÄ±";
  const b = card.querySelector("b");
  const small = card.querySelector("small");
  if (!b || !small || !card.querySelector(":scope > span")) {
    card.innerHTML = `<span>ğ•</span><div><b>${handle}</b><small>${expected}</small></div>`;
  } else {
    b.textContent = handle;
    small.textContent = expected;
  }
}

function translateCore(en) {
  document.documentElement.lang = en ? "en" : "tr";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = en
    ? "RedDragon Technocore Agent Lab â€” create a DID, complete signed onboarding, export contribution proof and set up GitHub Actions automation."
    : "RedDragon Technocore Agent Lab â€” DID oluÅŸturma, imzalÄ± onboarding, contribution proof ve GitHub Actions otomasyonu.";

  if (en) {
    html(".hero-copy h1", "Build your agent identity.<br><em>Leave a verifiable trail.</em>");
    text(".hero-copy > p", "Create a DID, download an encrypted backup, complete the Technocore onboarding tour, record a useful contribution with the same DID, and optionally run a 24/7 GitHub Actions agent â€” all from one panel.");
    text('.hero-actions [data-jump="1"]', "Create my identity");
    text(".hero-actions .ghost-link", "View onboarding steps");
    text(".art-overlay span", "PUBLIC IDENTITY");
    text(".art-overlay small", "The private key stays local unless you explicitly copy it for GitHub Secrets");
    text(".tour-head .eyebrow", "ONBOARDING TOUR");
    text(".tour-head h2", "Complete each step");
    text(".tour-head p", "Green steps are complete. Never put private keys, seeds, or other secrets on X, in Technocore rooms, or in public GitHub files.");
    text("#progressRing span", "complete");
  } else {
    html(".hero-copy h1", "Agent kimliÄŸini kur.<br><em>Ä°zini doÄŸrulanabilir bÄ±rak.</em>");
    text(".hero-copy > p", "Tek panelden DID Ã¼ret, yedeÄŸini al, Technocore onboarding turunu tamamla, faydalÄ± katkÄ±nÄ± aynÄ± DID ile kaydet ve istersen GitHub Actions Ã¼zerinde 7/24 ajanÄ±nÄ± Ã§alÄ±ÅŸtÄ±r.");
    text('.hero-actions [data-jump="1"]', "KimliÄŸimi oluÅŸtur");
    text(".hero-actions .ghost-link", "Tur adÄ±mlarÄ±nÄ± gÃ¶r");
    text(".art-overlay span", "PUBLIC KÄ°MLÄ°K");
    text(".art-overlay small", "Private key yalnÄ±zca GitHub Secrets iÃ§in aÃ§Ä±kÃ§a kopyalarsan cihazdan Ã§Ä±kar");
    text(".tour-head .eyebrow", "KURULUM TURU");
    text(".tour-head h2", "Her ÅŸeyi tek tek tamamla");
    text(".tour-head p", "YeÅŸil adÄ±mlar tamamlandÄ± demektir. Private key, seed veya baÅŸka gizli verileri X'e, Technocore odalarÄ±na ya da public GitHub dosyalarÄ±na yazma.");
    text("#progressRing span", "tamamlandÄ±");
  }

  const owner = $(".ownerline small");
  if (owner) owner.innerHTML = en
    ? `Maintained by <a href="${cfg.xUrl || "https://x.com/lionmousse"}" target="_blank" rel="noreferrer">${cfg.xHandle || "@lionmousse"}</a>`
    : `Proje hesabÄ±: <a href="${cfg.xUrl || "https://x.com/lionmousse"}" target="_blank" rel="noreferrer">${cfg.xHandle || "@lionmousse"}</a>`;

  const signalTitles = en ? ["CORE SIGNAL","SECURITY","NO GUARANTEE"] : ["ANA SÄ°NYAL","GÃœVENLÄ°K","GARANTÄ° YOK"];
  const signalText = en
    ? ["Unique DID + useful Technocore contribution.","Do not use a wallet seed. This identity uses a separate Ed25519 key.","Only FLOP Labs can confirm any airdrop amount or claim criteria."]
    : ["Benzersiz DID + faydalÄ± Technocore katkÄ±sÄ±.","Wallet seed kullanma. Bu kimlik ayrÄ± bir Ed25519 anahtarÄ± kullanÄ±r.","Airdrop miktarÄ± ve claim kriterlerini yalnÄ±zca FLOP Labs kesinleÅŸtirebilir."];
  $$(".signalbar > div").forEach((box, i) => {
    const b = box.querySelector("b");
    const span = box.querySelector("span");
    if (b && signalTitles[i]) b.textContent = signalTitles[i];
    if (span && signalText[i]) span.textContent = signalText[i];
  });

  const cards = en ? cardEN : cardTR;
  for (const [n, pair] of Object.entries(cards)) {
    text(`[data-step="${n}"] .card-head h2`, pair[0]);
    text(`[data-step="${n}"] .card-head xÛom¢G§²ÚîÆ­yÛñ'Ü[[™1,KÚK“ØØ[YMLNH™XÙZ\™\šYšYYŠBˆœ™\XÙJÚØ[1,Xñ,H›ÛÙ‰ØH˜q'Û[™1,KÚK›[šÙYÈH\˜X›H›ÛÙˆŠBˆœ™\XÙJ×•XÚ›ØÛÜ™H›İHØ\\Ú]\ÚHÛW‹ÚK•XÚ›ØÛÜ™H›İHØ\XÚ]H\È[ˆŠBˆœ™\XÙJ×•XÚ›ØÛÜ™HY[šHÙHØ\\Ú]\ÚHÛW‹ÚK•XÚ›ØÛÜ™H™]Ë\›ÛÛHØ\XÚ]H\È[ˆŠNÂˆYˆ
[^ÛÛ[OOH˜[YJH[^ÛÛ[H˜[YNÂˆBŸB‚›][˜[ZXÕ[Y\œÈH×NÂ™[˜İ[ÛˆØÚY[P›İ[™Y™Yœ™\Ú

HÂˆ[˜[ZXÕ[Y\œË™›Ü‘XXÚ
ÛX\•[Y[İ]
NÂˆ[˜[ZXÕ[Y\œÈHÌLLÍLLŒK›X\

\ÊHOˆÙ][Y[İ]


HOˆÂˆ\TİX›S[™İXYÙJ
NÂˆ˜[œÛ]Q[˜[ZXÑSŠ
NÂˆK\ÊJNÂŸB‚™[˜İ[Ûˆ]ÚX[ÙÜÊ
HÂˆYˆ
Ú[™İË—×Ü™İX›QX[ÙÜÊH™]\›ÂˆÚ[™İË—×Ü™İX›QX[ÙÜÈHYNÂˆÛÛœİ˜]]™T›Û\HÚ[™İËœ›Û\˜š[™
Ú[™İÊNÂˆÛÛœİ˜]]™PÛÛ™š\›HHÚ[™İË˜ÛÛ™š\›K˜š[™
Ú[™İÊNÂˆÚ[™İËœ›Û\H
Y\ÜØYÙK‹‹œ™\İ
HOˆÂˆ]HHİš[™ÊY\ÜØYÙHˆŠNÂˆYˆ
\Ñ[Š
JHHHKœ™\XÙJ–YYZÈ\›Û\ñ,[±,HÚ\ˆ‹‘[\ˆH˜XÚİ\\ÜİÛÜ™ˆŠNÂˆ™]\›ˆ˜]]™T›Û\
K‹‹œ™\İ
NÂˆNÂˆÚ[™İË˜ÛÛ™š\›HH
Y\ÜØYÙK‹‹œ™\İ
HOˆÂˆ]HHİš[™ÊY\ÜØYÙHˆŠNÂˆYˆ
\Ñ[Š
JHHHBˆœ™\XÙJ”š]˜]HÙ^HÚ]XˆÙXÜ™]	ÙHX\1,qgİ1,\›XZÈpéÚ[ˆ[›ŞXHÛÜX[[˜XØZËˆY\ØZ‹YY][K\ÜİYH™^XHX›XÈÜŞX^XHX\1,qgİ1,\›XKˆ]˜[HY[Ú[ˆZOÈ‹•Hš]˜]HÙ^HÚ[™HÛÜYYÈHÛ\›Ø\™›Üˆ\İ[™È[ÈÚ]XˆÙXÜ™]ËˆÈ›İ\İH][ÈY\ÜØYÙ\ËYY][K\ÜİY\ËÜˆX›XÈš[\ËˆÛÛ[YOÈŠBˆœ™\XÙJ“İ\[YZÚHš]˜]HÙ^H™HÙpéÚXÚHØ^q,]\±,H[Z^›^Y[[HZOÈYYq'Ú[ˆ˜\œØHQ	ŞZHÙ\šHpïÛ^YXš[\œÚ[‹ˆ‹ÛX\ˆHš]˜]HÙ^H[™[\Ü˜\HÙ\ÜÚ[Ûˆ™XÛÜ™ÏÈ[İHØ[ˆ™\İÜ™HHQ]\ˆYˆ[İH]™HH[˜Ü\Y˜XÚİ\ˆŠNÂˆ™]\›ˆ˜]]™PÛÛ™š\›JK‹‹œ™\İ
NÂˆNÂŸB‚™[˜İ[Ûˆ\TİX›S[™İXYÙJ
HÂˆÛÛœİ[ˆH\Ñ[Š
NÂˆZ[İÚ]Ú\Š
NÂˆ˜[œÛ]PÛÜ™J[ŠNÂˆ˜[œÛ]U˜][
[ŠNÂˆ˜[œÛ]Q[š[˜Ù[Y[Ê[ŠNÂˆ˜[œÛ]S]™Tİ]XÊ[ŠNÂˆ]ÚX[ÙÜÊ
NÂ‚ˆÛÛœİİÛ™\–H	
ˆÛİÛ™\–ŠNÂˆYˆ
İÛ™\–
HÂˆİÛ™\–š™YˆHÙ™Ë\›šÎ‹ËŞ˜ÛÛKÛ[Û›[İ\ÜÙHÂˆİÛ™\–^ÛÛ[H<'ecÈ	ØÙ™Ë[™H[Û›[İ\ÜÙHŸXÂˆBˆÛÛœİ]™P˜YÙHH	
‹ÜXXİ[ÛœÈ›]™HŠNÂˆYˆ
]™P˜YÙJHÂˆÛÛœİİH]™P˜YÙKœ]Y\TÙ[XİÜŠšHŠNÂˆ]™P˜YÙK^ÛÛ[H[ˆÈˆ™[^HÛ›[™Hˆˆˆ™[^Hpéñ,ZÈÂˆYˆ
İ
H]™P˜YÙKœ™\[™
İ
NÂˆBˆØİ[Y[œ]Y\TÙ[XİÜ[
	ØVÚ™YHšÎ‹ËŞ˜ÛÛKÛ[Û›[İ\ÜÙH—IÊK™›Ü‘XXÚ

JHOˆÈKš™YˆHÙ™Ë\›šÎ‹ËŞ˜ÛÛKÛ[Û›[İ\ÜÙHÈJNÂˆÚ[™İË˜\PÛÛ[][š]S[™İXYÙOËŠ
NÂŸB‚™[˜İ[Ûˆ›Ûİ

HÂˆ\TİX›S[™İXYÙJ
NÂˆ˜[œÛ]Q[˜[ZXÑSŠ
NÂˆÌÍLNLÌŒK™›Ü‘XXÚ

\ÊHOˆÙ][Y[İ]


HOˆÂˆ\TİX›S[™İXYÙJ
NÂˆ˜[œÛ]Q[˜[ZXÑSŠ
NÂˆK\ÊJNÂˆØİ[Y[˜Y]™[\İ[™\Š˜ÛXÚÈ‹ØÚY[P›İ[™Y™Yœ™\ÚYJNÂˆØİ[Y[˜Y]™[\İ[™\Š˜Ú[™ÙH‹ØÚY[P›İ[™Y™Yœ™\ÚYJNÂŸB‚šYˆ
Øİ[Y[œ™XYTİ]HOOH˜ÛÛ\]HŠH›Ûİ

NÂ™[ÙHÚ[™İË˜Y]™[\İ[™\Š›ØY‹›ÛİÈÛ˜ÙNˆYHJNÂ