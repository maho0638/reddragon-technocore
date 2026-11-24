const RD_FLOP_SPEC_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_FLOP_SPEC_CHECKED = "2026-11-24";
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
  "tr": {
    "intro": "FLOP Yellow Paper v0.5.0 / D-0440 ve resmî ağ kaynakları üzerinden güncel testnet hazırlığını gösterir. Bu kontrol airdrop miktarı veya uygunluk garantisi değildir.",
    "badge": "Yellow Paper v0.5.0 · D-0440 · taslak",
    "endpoint": "24 Kasım 2026: resmî Testnet canlı ve puanlamasız açıldı. Salt okunur erişim ve operatör kaydı açık; puanlama bloğu/tarihi duyurulmadı, voucher işlemleri kapalı. Self claim ve Testnet faucet limitleri doğrulanmadı; Devnet faucet’i Testnet değildir.",
    "unlockLabel": "Yerel testnet kaydı mainnet kilidi kanıtlamaz",
    "spendTitle": "Mainnet kilitli Agent grant örneği",
    "spendIntro": "Yellow Paper R8.7–R8.8 uyarınca yalnızca mainnet Agent grant'inin kilitli kısmından ödenen, kesinleşmiş ve itiraz penceresi tamamlanmış inference payable'ının her 3 FLOP'u 1 FLOP kilidi açar. Kilitli grant harcaması anaparanın en fazla %75'idir. Testnet işlem kayıtları bu kilidi açmaz.",
    "plan3": "3 · Resmî inference settlement'ını doğrula",
    "plan3d": "Ödül için testnet'te hangi kesinleşmiş harcamanın sayılacağını resmî kurallardan doğrula. Dönüşüm skoru ve kimlik/limit kuralları E.38'de açık; tarayıcı kaydı kanıt değildir.",
    "source": "24 Kasım 2026 ağ durumu kontrolü: FLOP Testnet canlı ve puanlamasız. Yellow Paper v0.5.0 taslak; E.38 açık. Puanlama başlangıç bloğu ve Testnet claim limiti duyurulmadı. Kaynakların kendi tarihleri ayrıca gösterilir.",
    "yp": "Yellow Paper",
    "agent": "Agent",
    "teaser": "Teaser",
    "exportFail": "Ledger dışa aktarılamadı."
  },
  "en": {
    "intro": "Current FLOP testnet readiness against Yellow Paper v0.5.0 and official network sources. This is not an airdrop or eligibility estimate.",
    "badge": "Yellow Paper v0.5.0 · D-0440 · draft",
    "endpoint": "Checked 24 Nov 2026: official Testnet is live and unscored. Public reads and operator registration are open; no scoring activation block/date is announced, and voucher trading is disabled. Testnet Self claims and faucet limits remain unverified; the Devnet faucet is not Testnet.",
    "unlockLabel": "Testnet local records prove no mainnet unlock",
    "spendTitle": "Mainnet locked Agent grant illustration",
    "spendIntro": "Under Yellow Paper R8.7–R8.8, only eligible finalized inference payable sourced from locked principal of a mainnet Agent grant accrues unlock credit: 3 FLOP payable per 1 FLOP unlocked, after the dispute window, with locked spending capped at 75% of principal. Testnet ledger entries do not unlock grants.",
    "plan3": "3 · Verify real inference settlement",
    "plan3d": "Follow officially settled-compute scoring and evidence rules on testnet. E.38 still leaves conversion score, identity and caps open; a browser entry is not proof.",
    "source": "Network status check 24 Nov 2026: FLOP Testnet is live and unscored. Yellow Paper v0.5.0 remains a draft and E.38 remains open. No scoring activation block or Testnet claim limits have been announced. Source-specific dates are kept separate.",
    "yp": "Yellow Paper",
    "agent": "Agent",
    "teaser": "Teaser",
    "exportFail": "Could not export ledger."
  }
};

const RD_FLOP_SPEC_CATALOG=window.RD_I18N?.register("flopGuide",RD_FLOP_SPEC_COPY)||RD_FLOP_SPEC_COPY;
function rdFlopSpecCopy() {
  return RD_FLOP_SPEC_CATALOG[rdFlopSpecLang()];
}

function rdFlopSpecTotals(entries) {
  let claimed = 0;
  let spent = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const amount = Math.max(0, Number(entry?.amount) || 0);
    if (entry?.type === "faucet") claimed += amount;
    if (entry?.type === "inference") spent += amount;
  }
  return { claimed, spent, publicAgentScenarioUnlocked: null, mainnetUnlockProof: "not established by local testnet records" };
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
        yellowPaperUpdated: "2026-09-24",
        authoritativeReference: "Live FLOP Network Yellow Paper implementation specification",
        decision: "D-0440",
        plannedTestnet: "Opened 2026-11-24 · live, unscored; scoring activation block/date not announced",
        plannedMainnet: "Q1 2027",
        genesisSupplyFlop: 4400000000,
        genesisMinerAirdropFlop: 1200000000,
        genesisValidatorAirdropFlop: 1200000000,
        genesisAgentAirdropFlop: 1200000000,
        genesisReserveFlop: 800000000,
        validatorMinimumStakeFlop: 1200000,
        faucetEndpointVerifiedLive: false,
        inferenceEndpointVerifiedLive: false,
        spendToUnlockRatifiedInYellowPaper: true,
        publicAgentPageStatesSpendToUnlock3to1: true,
        spendToUnlockStatus: "Yellow Paper R8.7-R8.8 specify 3:1 finalized locked-grant payable unlock after dispute window, with a 75% locked-spend cap. E.38 conversion scoring, identity and caps remain open; runtime implementation is partial.",
        sources: [RD_FLOP_YELLOW_PAPER, RD_FLOP_AGENT, RD_FLOP_TEASER]
      },
      scenario: {
        name: "Mainnet locked Agent grant R8.7 3:1 illustration",
        ratio: "3 FLOP eligible finalized locked-grant payable -> 1 FLOP principal unlocked",
        status: "normative R8.7–R8.8 rule for mainnet grant, not a testnet-spend credit; E.38 conversion scoring and eligibility remain open"
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
      b.textContent = tr ? "Canlı · puanlama başlamadı" : "Live · unscored opening";
      b.dataset.state = "warn";
    }
  }
  if (cols[1]) {
    const small = cols[1].querySelector("small");
    const strong = cols[1].querySelector("strong");
    if (small) small.textContent = tr ? "Ağ durumu" : "Network status";
    if (strong) strong.textContent = tr ? "24 Kasım · puanlama yok" : "24 Nov · unscored";
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
