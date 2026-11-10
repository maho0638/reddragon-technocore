const cfg = window.APP_CONFIG || {};
const COMMUNITY_COPY = window.RD_I18N?.register("communityPositioning", {
  tr: {
    title: "RedDragon · FLOP Topluluk Gözlemevi ve Ajan Laboratuvarı",
    description: "RedDragon FLOP Topluluk Gözlemevi ve Ajan Laboratuvarı — Yellow Paper takibi, resmî kaynaklar arasındaki farklılıklar, testnet hazırlığı, DID, TCLK ve Technocore ajan araçları.",
    brand: "FLOP Topluluk Gözlemevi · Ajan Laboratuvarı",
    eyebrow: "FLOP TOPLULUĞU · YELLOW PAPER · TESTNET · DID · TCLK",
    heroTitle: "FLOP'u kaynaklardan takip et.<br><em>Ajan izini doğrulanabilir bırak.</em>",
    heroIntro: "RedDragon, FLOP'un esas alınan Yellow Paper değişikliklerini, resmî kaynaklar arasındaki farklılıkları ve testnet hazırlığını izler. Aynı paneldeki DID, Technocore ve TCLK araçlarıyla doğrulanabilir ajan katkıları oluşturur.",
    observatory: "FLOP Gözlemevini aç", create: "Ajan kimliği oluştur",
    signalTitles: ["KAYNAK ÖNCELİKLİ", "BAĞIMSIZ", "GARANTİ YOK"],
    signalCopy: ["Yellow Paper temel teknik kaynaktır; teaser ile teknik tanım arasındaki farklılıklar açıkça belirtilir.", "Topluluk yapımıdır; FLOP Labs ile bağlantılı değildir ve FLOP Labs tarafından onaylanmamıştır.", "Airdrop miktarını ve katılım koşullarını yalnızca FLOP Labs kesinleştirebilir."],
    nav: "FLOP Gözlemevi", footer: "RedDragon FLOP Topluluk Gözlemevi · bağımsız topluluk aracı"
  },
  en: {
    title: "RedDragon · FLOP Community Observatory & Agent Lab",
    description: "RedDragon FLOP Community Observatory & Agent Lab — authoritative Yellow Paper tracking, differences across official sources, testnet readiness, DID, TCLK and Technocore agent tools.",
    brand: "FLOP Community Observatory · Agent Lab",
    eyebrow: "FLOP COMMUNITY · YELLOW PAPER · TESTNET · DID · TCLK",
    heroTitle: "Track FLOP from the sources.<br><em>Leave a verifiable agent trail.</em>",
    heroIntro: "RedDragon tracks FLOP's authoritative Yellow Paper changes, differences across official sources and testnet readiness. The same panel provides DID, Technocore and TCLK tools for verifiable agent contributions.",
    observatory: "Open FLOP Observatory", create: "Create agent identity",
    signalTitles: ["SOURCE-FIRST", "INDEPENDENT", "NO GUARANTEE"],
    signalCopy: ["The Yellow Paper is the primary technical source; differences from the teaser are clearly labeled.", "Community-built; not affiliated with or endorsed by FLOP Labs.", "Only FLOP Labs can finalize airdrop amounts and eligibility."],
    nav: "FLOP Observatory", footer: "RedDragon FLOP Community Observatory · independent community tool"
  }
});
const rdCommunityLang = () => window.RD_I18N?.language() || (String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en");
function rdCommunityApply() {
  const c = COMMUNITY_COPY[rdCommunityLang()];
  document.title = c.title;
  const meta = document.querySelector('meta[name="description"]'); if (meta) meta.content = c.description;
  const setText = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
  setText("#brandSub", c.brand);
  setText(".hero-copy .eyebrow", c.eyebrow);
  const hero = document.querySelector(".hero-copy h1"); if (hero) hero.innerHTML = c.heroTitle;
  setText(".hero-copy > p", c.heroIntro);
  const observatory = document.querySelector(".hero-actions .ghost-link");
  if (observatory) { observatory.href = cfg.flopCommunityUrl || "/flop"; observatory.textContent = c.observatory; }
  setText('.hero-actions [data-jump="1"]', c.create);
  document.querySelectorAll(".signalbar > div").forEach((box, index) => {
    const title = box.querySelector("b"), body = box.querySelector("span");
    if (title) title.textContent = c.signalTitles[index] || "";
    if (body) body.textContent = c.signalCopy[index] || "";
  });
  setText("#flopCommunityLink", c.nav);
  setText("footer > span", c.footer);
}
window.applyCommunityLanguage = rdCommunityApply;
rdCommunityApply();
