const COPY = {
  en: {
    refresh: "Refresh status", checking: "Checking…", failed: "Unverified · source unavailable", checked: "Last successful status check", stale: "Cached status · may be stale", summary: "Official sources and public read-only checks. Failed checks remain unverified.",
    testnetNotLive: "Planned / unreleased", testnetUnverified: "Unverified", testnetManual: "Release details found · identity check still required", testnetLiveUnscored: "Live · unscored opening", testnetDetail: "FLOP Testnet opened 24 November 2026. Public reads and registration are open, but scoring has no announced activation block or date; vouchers, orders and swaps are disabled. The Devnet faucet is not a Testnet claim.", timelineConflict: "An older dated FAQ gives {target} as a working target; the current network page confirms the 24 November opening.",
    devnetPublic: "Public development endpoints listed", enrollment: "Operator onboarding is administrator-assisted; public self-service enrollment is unavailable.", devnetError: "The official devnet source could not be checked.", rpcError: "The read-only RPC check could not be completed.", gatewayError: "The official model catalog could not be checked.", packageError: "Official package references could not be checked.", enrollmentUnverified: "Admission status unverified", devnetUnverified: "Unverified", devnetDetail: "Public endpoints are listed; operator enrollment requires administrator assistance.", devnetNoRewards: "The official {date} timeline FAQ says devnet earns nothing and has no reward or airdrop weight.", devnetRewardUnverified: "Current reward wording could not be checked in the official timeline FAQ.",
    rpcMatched: "Testnet genesis matched", rpcUnverified: "Unverified · read-only RPC unavailable or mismatched", rpcDetail: "Testnet RPC identity is verified only when its block-zero hash matches 0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800.",
    gatewayOk: "Model catalog responded", gatewayBad: "Unverified · catalog unavailable", gatewayDetail: "No inference or paid request is sent.",
    packagesOk: "Current official package references", packagesBad: "Unverified · docs unavailable",
    paper: "Yellow Paper v0.5.0 · draft · E.38 open", paperDrift: "Live page and GitHub mirror differ; file history is separated from repository CI activity.", paperMatch: "GitHub content history and repository head checked separately.",
    noToken: "The official-links page reports no live FLOP token, claim, or airdrop.", tokenUnverified: "Official token and claim status could not be checked.", tokenChanged: "The official-links token or claim wording changed and needs review.",
    sdk: "SDK versions", validator: "Validator package", manual: "Validator manual", admission: "Admission", none: "not listed",
    intro: "A public observatory for builders and agents. It distinguishes official facts from drafts and uncertainty, and links each claim to its source.", title: "Track FLOP without guessing.", kicker: "INDEPENDENT COMMUNITY TOOL · SOURCE-FIRST · NO AIRDROP GUARANTEES", official: "Read authoritative Yellow Paper", lab: "Open verifiable Agent Lab",
    card: [
      ["AUTHORITATIVE SPEC", "Yellow Paper v0.5.0 (draft)", "The normative implementation specification is a draft and continues to evolve.", "Official source →"],
      ["GENESIS SUPPLY · DRAFT", "4.4B FLOP", "The draft lists 1.2B each for miner, validator and agent cohorts, plus an 800M reserve. These are not individual rewards.", "§9 / Appendix A →"],
      ["PAPER HISTORY", "Checking paper history…", "GitHub file history and repository head are checked separately.", "Yellow Paper file history →"],
      ["AIRDROP CONVERSION · E.38 OPEN", "Conversion rules remain open", "E.38 leaves testnet conversion scoring and important eligibility mechanics unresolved. No personal reward estimate is available.", "Verify E.38 →"],
      ["AGENT GENESIS COHORT", "1.2B FLOP", "This is a cohort pool, not an individual grant. E.38 conversion rules remain unresolved.", "Official agent page →"],
      ["PUBLIC TESTNET", "Live · unscored opening", "Opened 24 November 2026. Public reads and registration are open; no scoring activation block or date is announced. Vouchers are disabled.", "Official testnet status →"],
      ["CREATOR APPLICATIONS", "Check official status", "Application availability can change. Individual compensation is not guaranteed.", "Official application →"],
      ["GPU MARKET", "Official market monitor", "Market information is not a faucet, testnet service or reward guarantee.", "Open GPU market →"],
      ["DEVNET · DEVELOPMENT ONLY", "Public endpoints; restricted enrollment", "Official network docs list endpoints; the dated timeline FAQ is linked below and its reward claim is reported with a live check time.", "Official devnet status →"]
    ]
  },
  tr: {
    refresh: "Durumu yenile", checking: "Kontrol ediliyor…", failed: "Doğrulanamadı · kaynak erişilemiyor", checked: "Son başarılı durum kontrolü", stale: "Önbellekteki durum · eski olabilir", summary: "Resmî kaynaklar ve yalnızca okunur kontroller. Başarısız kontroller doğrulanamadı olarak kalır.",
    testnetNotLive: "Planlandı / yayımlanmadı", testnetUnverified: "Doğrulanamadı", testnetManual: "Yayın bilgisi var · ağ kimliği ayrıca doğrulanmalı", testnetLiveUnscored: "Canlı · puanlama başlamadı", testnetDetail: "FLOP Testnet 24 Kasım 2026'da açıldı. Salt okunur zincir erişimi ve kayıt açık; puanlama için kesinleşmiş başlangıç bloğu veya tarih duyurulmadı, voucher işlemleri kapalı. Devnet faucet'i Testnet claim'i değildir.", timelineConflict: "Daha eski tarihli SSS {target} gününü çalışma hedefi olarak vermişti; güncel ağ durumu sayfası 24 Kasım açılışını doğruluyor.",
    devnetPublic: "Halka açık geliştirme ağı uçları listeleniyor", enrollment: "Operatör başvurusu yönetici desteğiyle yürütülüyor; herkesin kendi başına başvurabileceği bir yöntem yok.", devnetError: "Resmî geliştirme ağı kaynağı kontrol edilemedi.", rpcError: "Salt okunur RPC kontrolü tamamlanamadı.", gatewayError: "Resmî model kataloğu kontrol edilemedi.", packageError: "Resmî paket referansları kontrol edilemedi.", enrollmentUnverified: "Katılım durumu doğrulanamadı", devnetUnverified: "Doğrulanamadı", devnetDetail: "Halka açık uçlar listeleniyor; operatör katılımı yönetici desteği gerektiriyor.", devnetNoRewards: "{date} tarihli resmî zaman çizelgesi SSS'si geliştirme ağının ödül veya airdrop puanı vermediğini söylüyor.", devnetRewardUnverified: "Resmî zaman çizelgesi SSS'sindeki ödül bilgisi şu anda kontrol edilemedi.",
    rpcMatched: "Testnet başlangıç özeti eşleşti", rpcUnverified: "Doğrulanamadı · RPC erişilemiyor veya ağ kimliği uyuşmuyor", rpcDetail: "Testnet RPC kimliği ancak blok 0 özeti 0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800 ile eşleşirse doğrulanır.",
    gatewayOk: "Model kataloğu yanıt verdi", gatewayBad: "Doğrulanamadı · katalog erişilemiyor", gatewayDetail: "Model çalıştırma veya ücretli istek gönderilmez.",
    packagesOk: "Resmî paket referansları", packagesBad: "Doğrulanamadı · belgelere erişilemiyor",
    paper: "Yellow Paper v0.5.0 · taslak · E.38 açık", paperDrift: "Canlı sayfa ve GitHub kopyası farklı; dosya geçmişi depo CI etkinliğinden ayrı gösteriliyor.", paperMatch: "GitHub içerik geçmişi ve depo başlığı ayrı ayrı kontrol edildi.",
    noToken: "Resmî bağlantılar sayfasında canlı FLOP tokenı, claim veya airdrop olmadığı belirtiliyor.", tokenUnverified: "Resmî token ve claim durumu kontrol edilemedi.", tokenChanged: "Resmî bağlantılar sayfasındaki token/claim ifadesi değişmiş; yeniden incelenmeli.",
    sdk: "SDK sürümleri", validator: "Validator paketi", manual: "Validator kılavuzu", admission: "Katılım", none: "listelenmiyor",
    intro: "Geliştiriciler ve ajanlar için herkese açık gözlemevi. Resmî bilgileri taslaklardan ve belirsizliklerden ayırır; önemli bilgilerin yanına kaynağını ekler.", title: "FLOP'u tahmin yürütmeden takip et.", kicker: "BAĞIMSIZ TOPLULUK ARACI · KAYNAK ODAKLI · AIRDROP GARANTİSİ YOK", official: "Resmî Yellow Paper'ı oku", lab: "Doğrulanabilir Ajan Laboratuvarı'nı aç",
    card: [
      ["RESMÎ TEKNİK TANIM", "Yellow Paper v0.5.0 (taslak)", "Normatif uygulama tanımı taslak durumunda ve değişmeye devam ediyor.", "Resmî kaynak →"],
      ["GENESIS ARZI · TASLAK", "4,4 milyar FLOP", "Taslakta miner, validator ve ajan gruplarına 1,2'şer milyar, ayrıca 800 milyon rezerv yazıyor. Bunlar kişisel ödül değildir.", "§9 / Ek A →"],
      ["MAKALE GEÇMİŞİ", "İçerik geçmişi kontrol ediliyor…", "GitHub dosya geçmişi ile depo başlığı ayrı ayrı kontrol edilir.", "Yellow Paper dosya geçmişi →"],
      ["AIRDROP DÖNÜŞÜMÜ · E.38 AÇIK", "Dönüşüm kuralları açık", "E.38, testnet dönüşüm puanlaması ve önemli uygunluk kurallarını henüz belirlemiyor. Kişisel ödül tahmini yoktur.", "E.38'i incele →"],
      ["AJAN GENESIS GRUBU", "1,2 milyar FLOP", "Bu bir grup havuzudur, kişisel tahsis değildir. E.38 dönüşüm kuralları henüz tamamlanmadı.", "Resmî ajan sayfası →"],
      ["HALKA AÇIK TESTNET", "Canlı · puanlama başlamadı", "24 Kasım 2026'da açıldı. Salt okunur erişim ve kayıt açık; puanlamanın başlangıç bloğu/tarihi duyurulmadı, voucher işlemleri kapalı.", "Resmî testnet durumu →"],
      ["İÇERİK ÜRETİCİ BAŞVURUSU", "Resmî durumu kontrol et", "Başvuru durumu değişebilir. Kişisel ödeme garantisi yoktur.", "Resmî başvuru →"],
      ["GPU PİYASASI", "Resmî piyasa izleyicisi", "Piyasa bilgisi faucet, testnet hizmeti veya ödül garantisi değildir.", "GPU piyasasını aç →"],
      ["DEVNET · GELİŞTİRME AĞI", "Halka açık uçlar; kısıtlı katılım", "Resmî ağ belgeleri uçları listeliyor; tarihli zaman çizelgesi SSS'si aşağıda ve ödül bilgisi son kontrol zamanı ile raporlanıyor.", "Resmî geliştirme ağı durumu →"]
    ]
  }
};

const FLOP_STATUS_COPY = window.RD_I18N?.register("flopStatus", COPY) || COPY;
const getLang = () => {
  try { const v = localStorage.getItem("reddragon-lang"); if (v === "tr" || v === "en") return v; } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
};
let liveSourceFailure = false;
const setLang = (lang) => {
  const value = lang === "tr" ? "tr" : "en";
  if (window.RD_I18N?.setLanguage) window.RD_I18N.setLanguage(value);
  else { try { localStorage.setItem("reddragon-lang", value); } catch {} }
  renderStatic(value);
  if (window.__rdFlopStatus) renderStatus(window.__rdFlopStatus, value);
  else if (liveSourceFailure) renderFailure(value);
};
const fmtTime = (value, lang) => {
  if (!value || Number.isNaN(Date.parse(value))) return lang === "tr" ? "doğrulanamadı" : "unverified";
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(value));
};
const put = (root, selector, text) => { const el = root.querySelector(selector); if (el) el.textContent = text; };

function renderStatic(lang) {
  if (!document.getElementById("flop-live-status")) return;
  const c = FLOP_STATUS_COPY[lang];
  document.documentElement.lang = lang;
  const select = document.getElementById("rdFlopLanguage"); if (select) { select.value = lang; select.setAttribute("aria-label", lang === "tr" ? "Arayüz dili" : "Language"); }
  const languageLabel = document.querySelector(".lang-pick .sr-only"); if (languageLabel) languageLabel.textContent = lang === "tr" ? "Arayüz dili" : "Language";
  put(document, ".hero h1", c.title); put(document, ".hero .lead", c.intro); put(document, ".hero .kicker", c.kicker);
  const actions = document.querySelectorAll(".hero .actions a"); if (actions[0]) actions[0].textContent = c.official; if (actions[1]) actions[1].textContent = c.lab;
  const nav = document.querySelectorAll(".topbar nav a");
  const navText = lang === "tr" ? ["Yellow Paper", "Ajan", "GPU Piyasası", "Ajan Laboratuvarı", "@lionmousse"] : ["Yellow Paper", "Agent", "GPU Market", "Agent Lab", "@lionmousse"];
  nav.forEach((el, i) => { if (navText[i]) el.textContent = navText[i]; });
  const notice = document.querySelector(".hero .notice");
  if (notice) notice.textContent = lang === "tr" ? "Bağımsız topluluk projesi. FLOP Labs ile bağlantılı değildir, onun tarafından onaylanmaz veya işletilmez. Resmî ağ kuralları ve uygunlukta yetkili FLOP Labs'tir." : "Independent community project. Not affiliated with, endorsed by, or operated by FLOP Labs. FLOP Labs remains the authority for official network rules and eligibility.";
  document.querySelectorAll(".status-grid .status-card").forEach((card, i) => {
    const item = c.card[i]; if (!item) return;
    const span = card.querySelector("span"); const h = card.querySelector("h2"); const p = card.querySelector("p"); const a = card.querySelector("a");
    if (span) span.textContent = item[0]; if (h && i !== 2) h.textContent = item[1]; if (p && i !== 2) p.textContent = item[2]; if (a && i !== 2) a.textContent = item[3];
  });
  const paperHistoryLink = document.querySelectorAll(".status-grid .status-card")[2]?.querySelector("a");
  if (paperHistoryLink) paperHistoryLink.textContent = lang === "tr" ? "Yellow Paper dosya geçmişi →" : "Yellow Paper file history →";
  const devnetCard = document.querySelectorAll(".status-grid .status-card")[8];
  const devnetLinks = devnetCard?.querySelectorAll("a");
  if (devnetLinks?.[1]) devnetLinks[1].textContent = lang === "tr" ? "Resmî zaman çizelgesi ve ödül SSS'si →" : "Official timeline and reward FAQ →";
  const sections = document.querySelectorAll("main > .why");
  if (sections[0]) {
    put(sections[0], ".kicker", lang === "tr" ? "TECHNOCORE · CANLI GENEL KAPASİTE" : "TECHNOCORE · LIVE PUBLIC CAPACITY");
    put(sections[0], "h2", lang === "tr" ? "Listelenen odalar hizmetin tamamı gibi sunulmuyor." : "Capacity signals, without pretending listed rooms are the whole service.");
    put(sections[0], "p:not(.kicker)", lang === "tr" ? "Technocore'dan yalnızca okunur canlı üst veriler. Listelenen oda sayısı gizli veya özel odaları kapsamayabilir; bu nedenle listelenen doluluk toplam sınır değil, alt sınırdır." : "Read-only live metadata from Technocore. The listed-room count can exclude unlisted/private rooms, so listed occupancy is a lower bound rather than the enforced total.");
    const links = sections[0].querySelectorAll(".actions a"); if (links[0]) links[0].textContent = lang === "tr" ? "Kapasite sorunu #253" : "Capacity issue #253"; if (links[1]) links[1].textContent = lang === "tr" ? "Listelenen sayım notu #260" : "Listed-count caveat #260";
  }
  if (sections[1]) {
    put(sections[1], ".kicker", lang === "tr" ? "BU GÖZLEMEVİ NEDEN VAR?" : "WHY THIS EXISTS");
    put(sections[1], "h2", lang === "tr" ? "Belirsizliği görünür kılar." : "Useful to the community because it makes uncertainty visible.");
    put(sections[1], "p:not(.kicker)", lang === "tr" ? "FLOP hızla değişiyor. Topluluk paylaşımları ve herkese açık kopyalar güncelliğini yitirebilir. Bu gözlemevi taslakları ve belirsizliği etiketler, her iddianın yanına kaynak koyar ve kontrol tarihini gösterir." : "FLOP is moving quickly. Community posts and public mirrors can become stale as the live specification changes. This observatory labels drafts and uncertainty, links sources beside claims and records check times.");
    const labels = lang === "tr" ? [["Kaynak farklılıkları", "Resmî sayfalar arasındaki içerik farkını izler."], ["Testnet hazırlığı", "Uydurma uç noktalar veya ödül formülleri olmadan durumu izler."], ["Doğrulanabilir ajan kimliği", "Ed25519 DID, imzalı Technocore kayıtları ve kaynak doğrulama."], ["TCLK PAPER çalışma alanı", "FLOP'un açık TCLK/Technocore ekosistemi için ajan araçları."]] : [["Source-drift tracking", "Detects when official public surfaces disagree with the live specification."], ["Testnet readiness", "Tracks status without inventing endpoints or reward formulas."], ["Verifiable agent identity", "Ed25519 DID, signed Technocore records and provenance checks."], ["TCLK PAPER workbench", "Agent tools around FLOP's public TCLK/Technocore ecosystem."]];
    sections[1].querySelectorAll(".feature-list > div").forEach((row, i) => { put(row, "b", labels[i]?.[0]); put(row, "span", labels[i]?.[1]); });
  }
  const machine = document.querySelector(".machine");
  if (machine) { put(machine, ".kicker", lang === "tr" ? "AJANLAR, GELİŞTİRİCİLER VE İNCELEYENLER İÇİN" : "FOR AGENTS, BUILDERS & REVIEWERS"); put(machine, "h2", lang === "tr" ? "İnsanlar ve yazılımlar için okunabilir." : "Human-readable and machine-readable."); put(machine, "p:not(.kicker)", lang === "tr" ? "Resmî kaynak durumu JSON olarak yayımlanır; aynı temkinli bilgileri başka araçlar da kullanabilir." : "Current source status is published as JSON so agents and tools can use the same conservative facts."); const links = machine.querySelectorAll(".actions a"); if (links[0]) links[0].textContent = lang === "tr" ? "Durum JSON'unu aç" : "Open source-status JSON"; if (links[1]) links[1].textContent = lang === "tr" ? "GitHub kaynak kodu" : "Inspect source on GitHub"; }
  const sources = document.querySelector(".sources");
  if (sources) { put(sources, ".kicker", lang === "tr" ? "KULLANILAN RESMÎ KAYNAKLAR" : "OFFICIAL SOURCES USED"); put(sources, "h2", lang === "tr" ? "Birincil kaynaklar" : "Primary references"); const rows = sources.querySelectorAll(".source-links a"); const labels = lang === "tr" ? [["FLOP Yellow Paper", "Normatif uygulama tanımı"], ["FLOP Ajan sayfası", "Ajan işleyişi ve kullanım biçimi"], ["FLOP Teaser", "Genel bakış ve yol haritası"], ["flop.finance", "Resmî proje ve başvurular"], ["FLOP GPU piyasası", "Resmî kiralık GPU izleyicisi"], ["flop-labs/yellowpaper", "Açık teknik metin ve içerik geçmişi"], ["Resmî testnet ağı", "Başlangıç, sürüm ve katılım durumu"], ["Resmî devnet ağı", "Geliştirme ağı ve kabul durumu"], ["Testnet zaman çizelgesi", "Çalışma hedefleri ve devnet ayrımı"]] : [["FLOP Yellow Paper", "Normative implementation specification"], ["FLOP Agent page", "Public agent mechanics and usage model"], ["FLOP Teaser", "Project overview and roadmap"], ["flop.finance", "Official project and applications"], ["FLOP GPU market", "Official rentable-GPU monitor"], ["flop-labs/yellowpaper", "Public technical spec and content history"], ["Official testnet network", "Launch, release and admission status"], ["Official devnet network", "Development network and admission"], ["Testnet timeline", "Working dates and devnet distinction"]]; rows.forEach((a,i)=>{put(a,"b",labels[i]?.[0]);put(a,"span",labels[i]?.[1]);}); }
  const section = document.getElementById("join-guide");
  if (section) {
    section.querySelector(".kicker").textContent = lang === "tr" ? "PRATİK REHBER · DEVNET TESTNET DEĞİLDİR" : "PRACTICAL GUIDE · DEVNET IS NOT TESTNET";
    section.querySelector("h2").textContent = lang === "tr" ? "Şu anda neler yapabilirsin?" : "What you can do now";
    const trCards = [
      ["SDK/runtime uyumluluğunu kontrol et", "24 Kasım 2026 itibarıyla Testnet sayfası SDK 0.9.0 listeliyor; yayımlanmış runtime allowlist'i 1014034'te biterken açılış runtime'ı 1014035. Uyumluluk kontrollerini açık tut; resmî destek güncellenene kadar yalnız doğrulanmış salt-okunur RPC yöntemlerini kullan. Devnet etkinliği Testnet puanı değildir."],
      ["Testnet canlı · puanlama başlamadı", "Puanlamasız açılış 24 Kasım 2026'da başladı. Salt okunur erişim ve kayıt açık; puanlama bloğu/tarihi duyurulmadı, voucher işlemleri kapalı. Herhangi bir uç noktayı kullanmadan önce resmî genesis değerini doğrula."],
      ["GPU yok mu? Hazırlık yapabilirsin", "Teknik tanımı ve SDK belgelerini oku, belgelenmiş API'lere ajan bağla, herkese açık DID biçimini doğrula ve kaynak sürümlerini karşılaştır. GPU yalnızca madenci çalıştırmak için gerekir."],
      ["Ödül garantisi yok", "Devnet ödül veya airdrop puanı kazandırmaz. DID, token dağıtım notu, model isteği, cüzdan bakiyesi veya elle kaydedilmiş etkinlik uygunluk kanıtı değildir. E.38 dönüşüm kurallarının bir kısmı açık bırakılmıştır."]
    ];
    section.querySelectorAll(".guide-grid article").forEach((article, i) => { if (lang === "tr" && trCards[i]) { put(article, "h3", trCards[i][0]); put(article, "p", trCards[i][1]); } else if (lang === "en") { const en = [["Check SDK/runtime compatibility", "As of 24 November 2026, the Testnet page lists SDK 0.9.0, but its published runtime allowlist stops at 1014034 while the opening runtime is 1014035. Keep compatibility checks enabled; use only verified read-only RPC methods until official SDK/runtime support is updated. Devnet activity is not Testnet credit."], ["Testnet is live · unscored", "The unscored opening began 24 November 2026. Public reads and registration are open, but no scoring activation block or date is announced; vouchers, orders and swaps are disabled. Verify the official genesis before using any endpoint."], ["No GPU? You can still prepare", "Read the spec and SDK docs, build an agent against documented APIs, validate a public DID format, compare official source versions and track your own local checklist. GPU ownership is needed for miner operation, not for reading or SDK integration."], ["Rewards are not guaranteed", "Devnet has no reward or airdrop weight. A public DID, faucet note, model request, wallet balance or manually saved activity is not proof of eligibility. E.38 leaves important testnet-to-genesis conversion rules open."]]; put(article, "h3", en[i][0]); put(article, "p", en[i][1]); } });
    const guideLinks = section.querySelectorAll(".guide-grid article a"); const labels = lang === "tr" ? ["Resmî Testnet uyumluluk notu ↗", "Resmî testnet başlangıç durumu ↗", "Madenci rehberi ve roller ↗", "Resmî dönüşüm durumu ↗"] : ["Official Testnet compatibility note ↗", "Recheck official launch status ↗", "Miner guide and role details ↗", "Official conversion status ↗"]; guideLinks.forEach((a,i)=>{if(labels[i])a.textContent=labels[i];});
    const toolLinks = section.querySelectorAll(".tool-links a"); const toolLabels = lang === "tr" ? ["Ajan Laboratuvarı ve DID araçları", "Doğrulayıcı kılavuzu ve katılım adımları ↗", "Resmî bağlantılar ve dolandırıcılık uyarıları ↗"] : ["Open Agent Lab and existing DID tools", "Validator guide and current admission steps ↗", "Check official links and scam guidance ↗"]; toolLinks.forEach((a,i)=>{if(toolLabels[i])a.textContent=toolLabels[i];});
  }
  const live = document.getElementById("flop-live-status");
  if (live) {
    const liveCardCopy = [
      ["rdLiveTestnet", lang === "tr" ? "HALKA AÇIK TESTNET" : "PUBLIC TESTNET", lang === "tr" ? "Resmî testnet kaynağı ↗" : "Official testnet source ↗"],
      ["rdLiveDevnet", "DEVNET", lang === "tr" ? "Resmî devnet kaynağı ↗" : "Official devnet source ↗"],
      ["rdLiveRpc", lang === "tr" ? "SALT OKUNUR RPC KONTROLÜ" : "READ-ONLY RPC CHECK", lang === "tr" ? "FLOP Testnet gezgini ↗" : "FLOP Testnet explorer ↗"],
      ["rdLiveGateway", lang === "tr" ? "AĞ GEÇİDİ / MODEL KATALOĞU" : "GATEWAY / MODEL CATALOG", lang === "tr" ? "Resmî katalog ↗" : "Official catalog ↗"],
      ["rdLivePackages", lang === "tr" ? "SDK / CLI SÜRÜMLERİ" : "SDK / CLI RELEASES", lang === "tr" ? "Resmî SDK referansları ↗" : "Official SDK references ↗"],
      ["rdLivePaper", "YELLOW PAPER / E.38", lang === "tr" ? "Resmî teknik tanım ↗" : "Official paper ↗"]
    ];
    for (const [id, title, linkText] of liveCardCopy) {
      const card = document.getElementById(id);
      put(card, "span", title);
      const link = card?.querySelector("a:not(#rdLiveTimelineLink)");
      if (link) link.textContent = linkText;
    }
    put(live, "#rdLiveTimelineLink", lang === "tr" ? "Resmî zaman çizelgesi / ödül SSS'si ↗" : "Official timeline / reward FAQ ↗");
    put(live, ".section-heading .kicker", lang === "tr" ? "SALT OKUNUR KAYNAK KONTROLÜ" : "READ-ONLY SOURCE CHECK");
    put(live, "#live-title", lang === "tr" ? "Canlı FLOP durumu" : "Live FLOP status");
    put(live, "#rdLiveSummary", c.summary); put(live, "#rdRefreshStatus", c.refresh);
    put(live, "#rdLiveDisclaimer", lang === "tr" ? "Kontroller işlem göndermez, imza atmaz, faucet claim etmez veya inference çalıştırmaz. Belgede yazan genesis değeri beklenen değerdir; RPC kimliği ancak salt okunur yanıt eşleşirse doğrulanır." : "Status checks do not submit transactions, sign, claim faucet funds, or run inference. The docs-published genesis is expected; RPC identity is verified only when a read-only response matches.");
  }
  const footer = document.getElementById("rdFooterChecked"); if (footer && !window.__rdFlopStatus) footer.textContent = lang === "tr" ? "kaynak kontrolü sayfa açılınca güncellenir" : "source check updates on page load";
  const footerTagline = document.querySelector("footer > span:last-child"); if (footerTagline) footerTagline.textContent = lang === "tr" ? "Topluluk çalışması · kaynak odaklı · resmî bağlantı iddiası yok" : "Community-built · source-first · no affiliation claim";
  const footerContext = document.querySelector("footer > span:first-child");
  if (footerContext?.firstChild?.nodeType === Node.TEXT_NODE) footerContext.firstChild.nodeValue = lang === "tr" ? "RedDragon FLOP Topluluk Gözlemevi · " : "RedDragon FLOP Community Observatory · ";
}

function renderStatus(data, lang = getLang()) {
  liveSourceFailure = false;
  const c = FLOP_STATUS_COPY[lang];
  const show = (id, status, detail, state = "warn") => {
    const card = document.getElementById(id); if (!card) return;
    card.dataset.state = state; put(card, "[data-status]", status); put(card, "[data-detail]", detail);
  };
  const unverified = (obj) => !obj || obj.state === "unverified" || !!obj.error;
  const timeline = data.timeline || {};
  const timelineLink = document.getElementById("rdLiveTimelineLink");
  if (timelineLink) timelineLink.textContent = lang === "tr" ? "Resmî zaman çizelgesi / ödül SSS'si ↗" : "Official timeline / reward FAQ ↗";
  const timelineDate = timeline.updated || (lang === "tr" ? "tarihi doğrulanamadı" : "date unverified");
  const target = timeline.testnetTarget || (lang === "tr" ? "hedef doğrulanamadı" : "target unverified");
  const testnetDetail = data.testnet?.state === "not-live" && timeline.state === "verified" && timeline.testnetOpenClaim
    ? `${c.testnetDetail} ${c.timelineConflict.replace("{date}", timelineDate).replace("{target}", target)}`
    : c.testnetDetail;
  if (data.testnet?.state === "live-unscored") show("rdLiveTestnet", c.testnetLiveUnscored, testnetDetail, "warn");
  else if (data.testnet?.state === "not-live") show("rdLiveTestnet", c.testnetNotLive, testnetDetail, "warn");
  else if (data.testnet?.state === "manual-verification-required") show("rdLiveTestnet", c.testnetManual, testnetDetail, "warn");
  else show("rdLiveTestnet", c.testnetUnverified, testnetDetail, "bad");
  const rewardsText = data.devnet?.rewards === "none" && timeline.state === "verified"
    ? c.devnetNoRewards.replace("{date}", timelineDate)
    : c.devnetRewardUnverified;
  if (data.devnet?.state === "public-development-network") show("rdLiveDevnet", c.devnetPublic, `${c.devnetDetail} ${data.devnet.operatorEnrollment === "administrator-assisted / public self-service unavailable" ? c.enrollment : c.enrollmentUnverified} ${rewardsText}`, "good");
  else show("rdLiveDevnet", c.devnetUnverified, c.devnetError, "bad");
  const rpc = data.services?.rpc;
  show("rdLiveRpc", rpc?.state === "identity-matched" ? c.rpcMatched : c.rpcUnverified, rpc?.state === "identity-matched" ? `${c.rpcDetail} ${rpc.chain} · ${rpc.version}` : `${c.rpcDetail} ${rpc?.error ? c.rpcError : ""}`, rpc?.state === "identity-matched" ? "good" : "warn");
  const gateway = data.services?.gateway;
  show("rdLiveGateway", gateway?.state === "catalog-responded" ? c.gatewayOk : c.gatewayBad, gateway?.state === "catalog-responded" ? `${c.gatewayDetail} · ${gateway.count} ${lang === "tr" ? "model" : "models"}` : `${c.gatewayDetail} ${gateway?.error ? c.gatewayError : ""}`, gateway?.state === "catalog-responded" ? "good" : "warn");
  const packages = data.packages;
  let versions = (packages?.versions || []).map((v) => `${v.name} ${v.version}`).join(" · ");
  const validator = packages?.validatorPackage || (lang === "tr" ? "doğrulanamadı" : "unverified");
  const mismatch = packages?.validatorPackage && packages.validatorManualVersion && packages.validatorPackage !== packages.validatorManualVersion
    ? ` · ${c.validator}: ${packages.validatorPackage}; ${c.manual}: ${packages.validatorManualVersion} (${packages.validatorManualUpdated || ""})` : ` · ${c.validator}: ${validator}`;
  show("rdLivePackages", packages?.state === "verified-from-docs" ? c.packagesOk : c.packagesBad, `${c.sdk}: ${versions || c.none}${mismatch} · ${c.admission}: ${packages?.validatorAdmission === "administrator-assisted" ? c.enrollment : packages?.validatorAdmission === "unverified" ? c.enrollmentUnverified : c.none}`, packages?.state === "verified-from-docs" ? "good" : "warn");
  const yp = data.yellowPaper || {};
  const official = data.officialLinks || {};
  const tokenText = official.state !== "verified" || official.error
    ? c.tokenUnverified
    : official.tokenClaim === true ? c.noToken : c.tokenChanged;
  const content = yp.githubContentCommit;
  const head = yp.githubRepositoryHead;
  const diff = content && head && content.sha !== head.sha;
  const paperDetail = diff ? `${c.paperDrift} ${lang === "tr" ? "İçerik" : "Content"} ${fmtTime(content.date, lang)} · ${lang === "tr" ? "depo" : "repo"} ${fmtTime(head.date, lang)} (${head.message || ""})` : c.paperMatch;
  show("rdLivePaper", c.paper, `${paperDetail} · ${lang === "tr" ? "Canlı sayfa" : "Live page"} ${yp.livePageUpdated || c.none}. ${c.devnetNoRewards ? (data.devnet?.rewards === "none" && data.timeline?.state === "verified" ? c.devnetNoRewards.replace("{date}", data.timeline.updated || c.none) : c.devnetRewardUnverified) : ""} ${tokenText}`, "warn");
  const checkedAt = data.checkedAt || data.cachedAt;
  const old = data.stale || !checkedAt || Date.now() - Date.parse(checkedAt) > 24 * 60 * 60 * 1000;
  put(document, "#rdLiveChecked", `${old ? c.stale : c.checked}: ${fmtTime(checkedAt, lang)}${data.cachedAt ? ` · ${lang === "tr" ? "önbellek" : "cache"} ${fmtTime(data.cachedAt, lang)}` : ""}`);
  const footer = document.getElementById("rdFooterChecked"); if (footer) footer.textContent = `${lang === "tr" ? "kontrol" : "checked"} ${fmtTime(checkedAt, lang)}`;
  const paperTitle = document.getElementById("rdPaperSyncTitle"); const paperText = document.getElementById("rdPaperSyncText");
  if (paperTitle) paperTitle.textContent = diff ? (lang === "tr" ? "GitHub içerik güncellemesi canlı sayfadan yeni" : "GitHub paper content is newer than live page") : (lang === "tr" ? "Depo başlığı yalnızca CI çalışması olabilir" : "Latest repository commit may be CI-only");
  if (paperText) paperText.textContent = diff ? `${lang === "tr" ? "Canlı FLOP sayfası" : "Live FLOP page"}: ${yp.livePageUpdated || (lang === "tr" ? "doğrulanamadı" : "unverified")}. ${lang === "tr" ? "GitHub makale dosyası" : "GitHub paper file"}: ${content?.date || (lang === "tr" ? "doğrulanamadı" : "unverified")}. ${lang === "tr" ? "Depo başlığı" : "Repository head"}: ${head?.date || (lang === "tr" ? "doğrulanamadı" : "unverified")} · ${head?.message || ""}.` : c.paperMatch;
  const didStatus = document.getElementById("rdTestnetToolkit");
  if (didStatus) {
    const statusCols = Array.from(didStatus.querySelectorAll(".rd-testnet-status > div"));
    if (statusCols[0]) { const b = statusCols[0].querySelector("b"); if (b) { b.textContent = data.testnet?.state === "live-unscored" ? c.testnetLiveUnscored : data.testnet?.state === "not-live" ? c.testnetNotLive : c.testnetUnverified; b.dataset.state = data.testnet?.state === "live-unscored" ? "warn" : data.testnet?.state === "not-live" ? "off" : "warn"; } }
    if (statusCols[3]) { const strong = statusCols[3].querySelector("strong"); if (strong) strong.textContent = fmtTime(checkedAt, lang); }
    const note = didStatus.querySelector(".rd-testnet-note"); if (note) { const source = note.querySelector("a"); if (source) source.textContent = lang === "tr" ? "Resmî FLOP ağ durumu" : "Official FLOP network status"; }
  }
}

function renderFailure(lang = getLang()) {
  const c = FLOP_STATUS_COPY[lang];
  liveSourceFailure = true;
  for (const id of ["rdLiveTestnet", "rdLiveDevnet", "rdLiveRpc", "rdLiveGateway", "rdLivePackages", "rdLivePaper"]) {
    const card = document.getElementById(id); if (!card) continue;
    card.dataset.state = "bad";
    put(card, "[data-status]", c.failed);
    put(card, "[data-detail]", lang === "tr" ? "Canlı kaynak kontrolü tamamlanamadı; tahmin gösterilmiyor." : "The live source check failed; no inferred status is shown.");
  }
  put(document, "#rdLiveChecked", lang === "tr" ? "Son kontrol: kaynaklara erişilemedi" : "Last check: sources unreachable");
  put(document, "#rdFooterChecked", lang === "tr" ? "durum doğrulanamadı" : "status unverified");
}

async function refresh() {
  const c = FLOP_STATUS_COPY[getLang()];
  const timeout = AbortSignal.timeout(8000);
  try {
    const response = await fetch("/api/flop-status", { method: "GET", headers: { accept: "application/json" }, cache: "no-store", credentials: "same-origin", signal: timeout });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.schema !== "reddragon-flop-live-status/v1" || !data.checkedAt) throw new Error("Invalid status response");
    window.__rdFlopStatus = data;
    renderStatus(data, getLang());
  } catch {
    const lang = getLang();
    const failureCopy = FLOP_STATUS_COPY[lang];
    renderFailure(lang);
    const toolkit = document.getElementById("rdTestnetToolkit");
    if (toolkit) {
      const statusCols = Array.from(toolkit.querySelectorAll(".rd-testnet-status > div"));
      const t = failureCopy;
      if (statusCols[0]) {
        const label = statusCols[0].querySelector("b");
        if (label) { label.textContent = t.testnetUnverified; label.dataset.state = "warn"; }
      }
      if (statusCols[3]) {
        const checked = statusCols[3].querySelector("strong");
        if (checked) checked.textContent = lang === "tr" ? "doğrulanamadı" : "unverified";
      }
      const note = toolkit.querySelector(".rd-testnet-note");
      if (note) note.textContent = lang === "tr" ? "Canlı resmî kaynak kontrolü başarısız; testnet durumu doğrulanamadı. Devnet ayrı bir geliştirme ağıdır." : "Live official source checks failed; testnet status is unverified. Devnet is a separate development network.";
    }
  }
}

renderStatic(getLang());
document.getElementById("rdFlopLanguage")?.addEventListener("change", (event) => setLang(event.target.value));
document.getElementById("rdRefreshStatus")?.addEventListener("click", refresh);
refresh();
