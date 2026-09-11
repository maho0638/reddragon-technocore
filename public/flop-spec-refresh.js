const RD_FLOP_SPEC_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_FLOP_SPEC_CHECKED = "2026-09-11";
const RD_FLOP_YELLOW_PAPER = "https://flop.finance/intro/yellowpaper/";
const RD_FLOP_TEASER = "https://flop.finance/teaser/";
const RD_FLOP_LEDGER_KEY = `reddragon-flop-testnet-ledger:${RD_FLOP_SPEC_DID}`;

function rdFlopSpecLang() {
  try {
    const value = localStorage.getItem("reddragon-lang");
    if (value === "tr" || value === "en") return value;
  } catch {}
  return String(navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

const RD_FLOP_SPEC_COPY = {
  tr: {
    intro: "FLOP Yellow Paper v0.5.0 ile doğrulanan güncel parametreleri ve testnet hazırlığını gösterir. Airdrop tahmini yapmaz; kesinleşmemiş kuralları açıkça senaryo/TBD olarak etiketler.",
    badge: "Yellow Paper v0.5.0 · taslak",
    endpoint: "11 Eylül 2026 kontrolünde resmî FLOP kaynaklarında canlı bir faucet veya inference endpoint'i doğrulanmadı. Testnet Q4 2026 için, yaklaşık 90 gün olarak planlı; mainnet Q1 2027 hedefleniyor. RedDragon doğrulanmamış endpoint kullanmaz.",
    unlockLabel: "3:1 teaser senaryosu karşılığı",
    spendTitle: "Agent 3:1 teaser senaryo hesaplayıcı",
    spendIntro: "Teaser ve agent sayfası her 3 FLOP inference harcamasının 1 airdrop FLOP kilidi açacağını söylüyor. Ancak authoritative Yellow Paper v0.5.0 Appendix E.38, spend-to-unlock'ın yayımlanıp yayımlanmayacağını hâlâ TBD bırakıyor ve mevcut Y1–Y3 3:1 tasarımını harcama projeksiyonuna göre uygulanamaz olarak işaretliyor. Bu hesap yalnızca teaser senaryosudur.",
    plan3: "3 · Doğrulanabilir inference kullanımı",
    plan3d: "Testnet açıldığında gerçek inference kullanımını aynı DID altında kaydet. Agent dağıtım skoru, vesting ufku ve spend-to-unlock mekanizması Yellow Paper E.38'de henüz kesinleşmiş değil.",
    source: "Kaynak durumu: FLOP Yellow Paper v0.5.0 (05.09.2026 güncellemeli authoritative implementation spec, hâlâ draft). Genesis arzı 3.5B FLOP: 1.2B miner + 1.2B agent + 305.505M validator + 794.495M reserve/incentives. Teaser 3:1 gösteriyor; Yellow Paper E.38 ise mekanizmanın ship edilmesini TBD bırakıyor.",
    yp: "Yellow Paper",
    teaser: "Teaser",
    exportFail: "Ledger dışa aktarılamadı."
  },
  en: {
    intro: "Shows current parameters verified against FLOP Yellow Paper v0.5.0 and testnet readiness. It does not estimate an airdrop; unresolved mechanics are explicitly labeled scenario/TBD.",
    badge: "Yellow Paper v0.5.0 · draft",
    endpoint: "As checked on 11 Sep 2026, no live official FLOP faucet or inference endpoint was verified in official sources. Testnet is planned for Q4 2026 for roughly 90 days; mainnet is targeted for Q1 2027. RedDragon does not use unverified endpoints.",
    unlockLabel: "3:1 teaser-scenario equivalent",
    spendTitle: "Agent 3:1 teaser scenario calculator",
    spendIntro: "The Teaser and agent page say every 3 FLOP spent on inference unlocks 1 airdropped FLOP. However, the authoritative Yellow Paper v0.5.0 Appendix E.38 still leaves whether spend-to-unlock ships as TBD and marks the current Y1–Y3 3:1 design infeasible against projected network inference spend. This calculator is a teaser scenario only.",
    plan3: "3 · Verifiable inference usage",
    plan3d: "When testnet opens, record real inference usage under the same DID. Agent conversion scoring, vesting horizon and spend-to-unlock remain unresolved in Yellow Paper E.38.",
    source: "Source status: FLOP Yellow Paper v0.5.0 (authoritative implementation spec updated 2026-09-05, still draft). Genesis supply is 3.5B FLOP: 1.2B miner + 1.2B agent + 305.505M validator + 794.495M reserve/incentives. The Teaser shows 3:1; Yellow Paper E.38 keeps whether that mechanism ships as TBD.",
    yp: "Yellow Paper",
    teaser: "Teaser",
    exportFail: "Could not export ledger."
  }
};

function rdFlopSpecCopy() {
  return RD_FLOP_SPEC_COPY[rdFlopSpecLang()];
}

function rdFlopSpecTotals(entries) {
  let claimed = 0;
  let spent = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const amount = Math.max(0, Number(entry?.amount) || 0);
    if (entry?.type === "faucet") claimed += amount;
    if (entry?.type === "inference") spent += amount;
  }
  return { claimed, spent, teaserScenarioUnlocked: spent / 3 };
}

function rdFlopSpecExportLedger() {
  const t = rdFlopSpecCopy();
  try {
    const raw = JSON.parse(localStorage.getItem(RD_FLOP_LEDGER_KEY) || "null");
    const ledger = raw && raw.version === 1 && raw.did === RD_FLOP_SPEC_DID && Array.isArray(raw.entries)
      ? raw
      : { version: 1, did: RD_FLOP_SPEC_DID, createdAt: new Date().toISOString(), entries: [] };
    const payload = {
      schema: "reddragon-flop-testnet-ledger/v2",
      did: RD_FLOP_SPEC_DID,
      exportedAt: new Date().toISOString(),
      officialStatus: {
        checkedAt: RD_FLOP_SPEC_CHECKED,
        yellowPaperVersion: "0.5.0 (draft)",
        yellowPaperUpdated: "2026-09-05",
        authoritativeReference: "FLOP Network Yellow Paper implementation specification",
        plannedTestnet: "Q4 2026 (~90 days)",
        plannedMainnet: "Q1 2027",
        genesisSupplyFlop: 3500000000,
        genesisMinerAirdropFlop: 1200000000,
        genesisAgentAirdropFlop: 1200000000,
        genesisValidatorAirdropFlop: 305505000,
        genesisReserveFlop: 794495000,
        faucetEndpointVerifiedLive: false,
        inferenceEndpointVerifiedLive: false,
        spendToUnlockRatified: false,
        spendToUnlockStatus: "Teaser/agent page state 3:1; Yellow Paper Appendix E.38 says whether spend-to-unlock ships is TBD and the current Y1-Y3 3:1 pacing is infeasible as drafted",
        sources: [RD_FLOP_YELLOW_PAPER, RD_FLOP_TEASER]
      },
      scenario: {
        name: "Teaser 3:1 spend-to-unlock",
        ratio: "3 FLOP inference spend -> 1 airdropped FLOP unlocked",
        status: "scenario only; not ratified by Yellow Paper v0.5.0"
      },
      totals: rdFlopSpecTotals(ledger.entries),
      entries: ledger.entries,
      disclaimer: "Browser-local activity ledger; verify each external reference independently. Contains no private key. The 3:1 value is a teaser scenario, not a ratified Yellow Paper rule."
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reddragon-flop-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    alert(t.exportFail);
  }
}

function rdFlopSpecSetFooter(host, t) {
  const note = host.querySelector(".rd-testnet-note");
  if (!note) return;
  note.textContent = "";
  const lead = document.createElement("span");
  lead.textContent = `RedDragon DID: ${RD_FLOP_SPEC_DID}\n${t.source} `;
  note.appendChild(lead);

  const yp = document.createElement("a");
  yp.href = RD_FLOP_YELLOW_PAPER;
  yp.target = "_blank";
  yp.rel = "noopener noreferrer";
  yp.textContent = t.yp;

  const sep = document.createTextNode(" · ");

  const teaser = document.createElement("a");
  teaser.href = RD_FLOP_TEASER;
  teaser.target = "_blank";
  teaser.rel = "noopener noreferrer";
  teaser.textContent = t.teaser;

  note.append(yp, sep, teaser);
  note.style.whiteSpace = "pre-line";
}

function rdFlopSpecPatch() {
  const host = document.getElementById("rdTestnetToolkit");
  if (!host) return false;
  if (host.dataset.specRefresh === RD_FLOP_SPEC_CHECKED) return true;

  const t = rdFlopSpecCopy();
  const tr = rdFlopSpecLang() === "tr";
  const head = host.querySelector(".rd-testnet-head");
  const intro = head?.querySelector("p");
  const badge = head?.querySelector(".rd-testnet-badge");
  if (intro) intro.textContent = t.intro;
  if (badge) badge.textContent = t.badge;

  const status = host.querySelector(".rd-testnet-status");
  const cols = status ? Array.from(status.children).filter((el) => el.tagName === "DIV") : [];
  if (cols[0]) {
    const b = cols[0].querySelector("b");
    if (b) {
      b.textContent = tr ? "Canlı endpoint doğrulanmadı" : "No live endpoint verified";
      b.dataset.state = "off";
    }
  }
  if (cols[1]) {
    const small = cols[1].querySelector("small");
    const strong = cols[1].querySelector("strong");
    if (small) small.textContent = tr ? "Testnet planı" : "Testnet plan";
    if (strong) strong.textContent = "Q4 2026 · ~90 gün";
  }
  if (cols[2]) {
    const small = cols[2].querySelector("small");
    const strong = cols[2].querySelector("strong");
    if (small) small.textContent = "Yellow Paper";
    if (strong) strong.textContent = "v0.5.0 · 2026-09-05";
  }
  if (cols[3]) {
    const small = cols[3].querySelector("small");
    const strong = cols[3].querySelector("strong");
    if (small) small.textContent = tr ? "Son kontrol" : "Last checked";
    if (strong) strong.textContent = RD_FLOP_SPEC_CHECKED;
  }
  const statusP = status?.querySelector("p");
  if (statusP) statusP.textContent = t.endpoint;

  const summary = host.querySelector(".rd-ledger-summary");
  const summaryCols = summary ? Array.from(summary.children) : [];
  if (summaryCols[2]) {
    const label = summaryCols[2].querySelector("small");
    if (label) label.textContent = t.unlockLabel;
  }

  const cards = Array.from(host.querySelectorAll(".rd-testnet-card"));
  if (cards[0]) {
    const h3 = cards[0].querySelector("h3");
    const p = cards[0].querySelector("p");
    if (h3) h3.textContent = t.spendTitle;
    if (p) p.textContent = t.spendIntro;
  }

  const steps = Array.from(host.querySelectorAll(".rd-testnet-step"));
  if (steps[2]) {
    const b = steps[2].querySelector("b");
    const span = steps[2].querySelector("span");
    if (b) b.textContent = t.plan3;
    if (span) span.textContent = t.plan3d;
  }

  rdFlopSpecSetFooter(host, t);

  const oldExport = document.getElementById("rdExportLedger");
  if (oldExport && oldExport.dataset.specRefresh !== RD_FLOP_SPEC_CHECKED) {
    const replacement = oldExport.cloneNode(true);
    replacement.dataset.specRefresh = RD_FLOP_SPEC_CHECKED;
    oldExport.replaceWith(replacement);
    replacement.addEventListener("click", rdFlopSpecExportLedger);
  }

  host.dataset.specRefresh = RD_FLOP_SPEC_CHECKED;
  return true;
}

function rdFlopSpecStart() {
  if (rdFlopSpecPatch()) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (rdFlopSpecPatch() || attempts >= 40) clearInterval(timer);
  }, 250);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rdFlopSpecStart, { once: true });
} else {
  rdFlopSpecStart();
}
