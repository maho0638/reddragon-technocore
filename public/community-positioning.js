const cfg = window.APP_CONFIG || {};

function rdCommunityLang() {
  try {
    const value = localStorage.getItem("reddragon-lang");
    if (value === "tr" || value === "en") return value;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

function rdCommunityText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function rdCommunityHtml(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = value;
}

function rdCommunityApply() {
  const tr = rdCommunityLang() === "tr";
  document.title = tr
    ? "RedDragon · FLOP Topluluk Gözlemevi & Agent Lab"
    : "RedDragon · FLOP Community Observatory & Agent Lab";

  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = tr
    ? "RedDragon FLOP Topluluk Gözlemevi & Agent Lab — authoritative Yellow Paper takibi, kaynak drift'i, testnet hazırlığı, DID, TCLK ve Technocore agent araçları."
    : "RedDragon FLOP Community Observatory & Agent Lab — authoritative Yellow Paper tracking, source drift, testnet readiness, DID, TCLK and Technocore agent tools.";

  rdCommunityText("#brandSub", tr ? "FLOP Topluluk Gözlemevi · Agent Lab" : "FLOP Community Observatory · Agent Lab");
  rdCommunityText(".hero-copy .eyebrow", "FLOP COMMUNITY · YELLOW PAPER · TESTNET · DID · TCLK");
  rdCommunityHtml(
    ".hero-copy h1",
    tr
      ? "FLOP'u kaynaklardan takip et.<br><em>Agent izini doğrulanabilir bırak.</em>"
      : "Track FLOP from the sources.<br><em>Leave a verifiable agent trail.</em>"
  );
  rdCommunityText(
    ".hero-copy > p",
    tr
      ? "RedDragon, FLOP'un authoritative Yellow Paper değişikliklerini, resmî kaynaklar arasındaki drift'i ve testnet hazırlığını takip eder; aynı panelde DID, Technocore ve TCLK araçlarıyla doğrulanabilir agent katkısı oluşturur."
      : "RedDragon tracks FLOP's authoritative Yellow Paper changes, drift between official public sources and testnet readiness; the same project also provides DID, Technocore and TCLK tools for verifiable agent contributions."
  );

  const observatory = document.querySelector(".hero-actions .ghost-link");
  if (observatory) {
    observatory.href = cfg.flopCommunityUrl || "/flop";
    observatory.textContent = tr ? "FLOP Gözlemevini aç" : "Open FLOP Observatory";
  }
  rdCommunityText('.hero-actions [data-jump="1"]', tr ? "Agent kimliği oluştur" : "Create agent identity");

  const signalTitles = tr
    ? ["KAYNAK-ÖNCELİKLİ", "BAĞIMSIZ", "GARANTİ YOK"]
    : ["SOURCE-FIRST", "INDEPENDENT", "NO GUARANTEE"];
  const signalCopy = tr
    ? [
        "Yellow Paper authoritative kaynaktır; teaser/spec drift'i gizlenmez, açıkça etiketlenir.",
        "Topluluk yapımı araçtır; FLOP Labs ile bağlı veya FLOP Labs tarafından onaylanmış değildir.",
        "Airdrop miktarı ve eligibility yalnızca FLOP Labs tarafından kesinleştirilebilir."
      ]
    : [
        "The Yellow Paper is authoritative; teaser/spec drift is labeled rather than hidden.",
        "Community-built; not affiliated with or endorsed by FLOP Labs.",
        "Only FLOP Labs can finalize airdrop amounts and eligibility."
      ];
  document.querySelectorAll(".signalbar > div").forEach((box, index) => {
    const b = box.querySelector("b");
    const span = box.querySelector("span");
    if (b && signalTitles[index]) b.textContent = signalTitles[index];
    if (span && signalCopy[index]) span.textContent = signalCopy[index];
  });

  const nav = document.getElementById("flopCommunityLink");
  if (nav) nav.textContent = tr ? "FLOP Gözlemevi" : "FLOP Observatory";

  const footer = document.querySelector("footer > span");
  if (footer) footer.textContent = tr
    ? "RedDragon FLOP Topluluk Gözlemevi · bağımsız topluluk aracı"
    : "RedDragon FLOP Community Observatory · independent community tool";
}

rdCommunityApply();
