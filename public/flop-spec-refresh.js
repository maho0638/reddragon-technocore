const RD_FLOP_SPEC_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_FLOP_SPEC_CHECKED = "2026-09-17";
const RD_FLOP_YELLOW_PAPER = "https://flop.finance/intro/yellowpaper/";
const RD_FLOP_AGENT = "https://flop.finance/intro/agent/";
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
    intro: "FLOP'un canlı Yellow Paper v0.5.0 / D-0440 parametreleriyle doğrulanan güncel testnet hazırlığını gösterir. Airdrop tahmini yapmaz; kesinleşmemiş kuralları açıkça senaryo/TBD olarak etiketler.",
    badge: "Yellow Paper v0.5.0 · D-0440 · taslak",
    endpoint: "17 Eylül 2026 kontrolünde resmî FLOP kaynaklarında halka açık canlı bir faucet veya inference endpoint'i doğrulanmadı. Testnet Q4 2026 için yaklaşık 90 gün olarak planlı; mainnet Q1 2027 hedefleniyor. RedDragon doğrulanmamış endpoint kullanmaz.",
    unlockLabel: "3:1 public-agent senaryosu karşılığı",
    spendTitle: "Agent 3:1 kullanım senaryosu hesaplayıcı",
    spendIntro: "Resmî Agent sayfası her 3 FLOP inference harcamasının 1 airdrop FLOP kilidi açacağını söylüyor. Ancak authoritative Yellow Paper Appendix E.38, spend-to-unlock'ın nihai olarak ship edilip edilmeyeceğini hâlâ TBD bırakıyor. Bu hesap bu nedenle senaryo olarak gösterilir, garanti değildir.",
    plan3: "3 · Doğrulanabilir inference kullanımı",
    plan3d: "Testnet açıldığında gerçek inference kullanımını aynı DID altında kaydet. Agent dönüşüm skoru, cap'ler ve nihai vesting ayrıntıları Yellow Paper E.38'de henüz kesinleşmiş değil.",
    source: "Kaynak durumu: canlı FLOP Yellow Paper v0.5.0 authoritative implementation spec ve D-0440. Genesis arzı 4.4B FLOP: 1.2B miner + 1.2B validator + 1.2B agent + 800M reserve/incentives. Resmî Agent sayfası 3:1 unlock anlatıyor; Yellow Paper E.38 nihai mekanizmayı hâlâ açık madde olarak tutuyor.",
    yp: "Yellow Paper",
    agent: "Agent",
    teaser: "Teaser",
    exportFail: "Ledger dışa aktarılamadı."
  },
  en: {
    intro: "Shows current testnet readiness verified against the live FLOP Yellow Paper v0.5.0 / D-0440 parameters. It does not estimate an airdrop; unresolved mechanics are explicitly labeled scenario/TBD.",
    badge: "Yellow Paper v0.5.0 · D-0440 · draft",
    endpoint: "As checked on 17 Sep 2026, no live public official FLOP faucet or inference endpoint was verified in official sources. Testnet is planned for Q4 2026 for roughly 90 days; mainnet is targeted for Q1 2027. RedDragon does not use unverified endpoints.",
    unlockLabel: "3:1 public-agent scenario equivalent",
    spendTitle: "Agent 3:1 usage scenario calculator",
    spendIntro: "The official Agent page says every 3 FLOP spent on inference unlocks 1 airdropped FLOP. However, the authoritative Yellow Paper Appendix E.38 still leaves whether spend-to-unlock ultimately ships as TBD. This calculator therefore shows a scenario, not a guarantee.",
    plan3: "3 · Verifiable inference usage",
    plan3d: "When testnet opens, record real inference usage under the same DID. Agent conversion scoring, caps and final vesting details remain unresolved in Yellow Paper E.38.",
    source: "Source status: live FLOP Yellow Paper v0.5.0 authoritative implementation spec with D-0440. Genesis supply is 4.4B FLOP: 1.2B miner + 1.2B validator + 1.2B agent + 800M reserve/incentives. The official Agent page states 3:1 unlock; Yellow Paper E.38 still keeps the final mechanism open.",
    yp: "Yellow Paper",
    agent: "Agent",
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
  return { claimed, spent, publicAgentScenarioUnlocked: spent / 3 };
}

function rdFlopSpecExportLedger() {
  const t = rdFlopSpecCopy();
  try {
    const raw = JSON.parse(localStorage.getItem(RD_FLOP_LEDGER_KEY) || "null");
    const ledger = raw && raw.version === 1 && raw.did === RD_FLOP_SPEC_DID && Array.isArray(raw.entries)
      ? raw
      : { version: 1, did: RD_FLOP_SPEC_DID, createdAt: new Date().toISOString(), entries: [] };
    const payload = {
      schema: "reddragon-flop-testnet-ledger/v3",
      did: RD_FLOP_SPEC_DID,
      exportedAt: new Date().toISOString(),
      officialStatus: {
        checkedAt: RD_FLOP_SPEC_CHECKED,
        yellowPaperVersion: "0.5.0 (draft / implementation spec — iterating)",
        yellowPaperUpdated: "2026-09-05",
        authoritativeReference: "Live FLOP Network Yellow Paper implementation specification",
        decision: "D-0440",
        plannedTestnet: "Q4 2026 (~90 days)",
        plannedMainnet: "Q1 2027",
        genesisSupplyFlop: 4400000000,
        genesisMinerAirdropFlop: 1200000000,
        genesisValidatorAirdropFlop: 1200000000,
        genesisAgentAirdropFlop: 1200000000,
        genesisReserveFlop: 800000000,
        validatorMinimumStakeFlop: 1200000,
        faucetEndpointVerifiedLive: false,
        inferenceEndpointVerifiedLive: false,
        spendToUnlockRatifiedInYellowPaper: false,
        publicAgentPageStatesSpendToUnlock3to1: true,
        spendToUnlockStatus: "Official Agent page states 3:1; Yellow Paper Appendix E.38 still leaves whether spend-to-unlock ships and final pacing/vesting mechanics unresolved",
        sources: [RD_FLOP_YELLOW_PAPER, RD_FLOP_AGENT, RD_FLOP_TEASER]
      },
      scenario: {
        name: "Official Agent page 3:1 spend-to-unlock",
        ratio: "3 FLOP inference spend -> 1 airdropped FLOP unlocked",
        status: "publicly stated by official Agent page; final normative mechanics remain open in Yellow Paper E.38"
      },
      totals: rdFlopSpecTotals(ledger.entries),
      entries: ledger.entries,
      disclaimer: "Browser-local activity ledger; verify each external reference independently. Contains no private key. Reward eligibility and final airdrop mechanics are not guaranteed."
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

  const sep1 = document.createTextNode(" · ");

  const agent = document.createElement("a");
  agent.href = RD_FLOP_AGENT;
  agent.target = "_blank";
  agent.rel = "noopener noreferrer";
  agent.textContent = t.agent;

  const sep2 = document.createTextNode(" · ");

  const teaser = document.createElement("a");
  teaser.href = RD_FLOP_TEASER;
  teaser.target = "_blank";
  teaser.rel = "noopener noreferrer";
  teaser.textContent = t.teaser;

  note.append(yp, sep1, agent, sep2, teaser);
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
      b.textContent = tr ? "Canlı public endpoint doğrulanmadı" : "No live public endpoint verified";
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
    if (strong) strong.textContent = "v0.5.0 · D-0440";
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
