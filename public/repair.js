const cfg = window.APP_CONFIG || {};
const PUBLIC_PREFIX = "reddragon-public-state-v1:";
const LEGACY_PROGRESS = "reddragon-progress";
const SESSION_PROOF = "reddragon-imported-public-proof";
const PENDING_PROOF = "reddragon-pending-public-proof";

function numericSeq(value) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0;
}

function invalidProofRecord(proof) {
  const record = proof?.contribution?.record;
  return !!record && !numericSeq(record.seq);
}

function scrubProof(proof) {
  if (!proof || typeof proof !== "object") return proof;
  if (invalidProofRecord(proof)) {
    proof = JSON.parse(JSON.stringify(proof));
    proof.contribution = proof.contribution || {};
    proof.contribution.record = null;
  }
  return proof;
}

function scrubStoredState() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PROGRESS) || "[]");
    if (Array.isArray(legacy)) {
      localStorage.setItem(LEGACY_PROGRESS, JSON.stringify(legacy.filter((n) => n !== 9 && n !== 10)));
    }
  } catch {}

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PUBLIC_PREFIX)) continue;
      try {
        const state = JSON.parse(localStorage.getItem(key) || "null");
        if (!state || typeof state !== "object") continue;
        if (invalidProofRecord(state.proof)) {
          state.proof = scrubProof(state.proof);
          state.done = Array.isArray(state.done) ? state.done.filter((n) => n !== 9 && n !== 10) : [];
          localStorage.setItem(key, JSON.stringify(state));
        }
      } catch {}
    }
  } catch {}

  for (const key of [SESSION_PROOF, PENDING_PROOF]) {
    try {
      const proof = JSON.parse(sessionStorage.getItem(key) || "null");
      if (invalidProofRecord(proof)) sessionStorage.removeItem(key);
    } catch {}
  }
}

function repairXLinks() {
  const handle = cfg.xHandle || "@joannawolker";
  const url = cfg.xUrl || "https://x.com/joannawolker";

  document.querySelectorAll('a[href="https://x.com/joannawalker"]').forEach((a) => {
    a.href = url;
    if ((a.textContent || "").includes("@joannawalker")) {
      a.textContent = (a.textContent || "").replaceAll("@joannawalker", handle);
    }
  });

  document.querySelectorAll(".profile-card b").forEach((b) => {
    if ((b.textContent || "").trim() === "@joannawalker") b.textContent = handle;
  });

  document.querySelectorAll(".ownerline a, footer a").forEach((a) => {
    if ((a.textContent || "").includes("@joannawalker")) {
      a.textContent = (a.textContent || "").replaceAll("@joannawalker", handle);
      a.href = url;
    }
  });
}

function currentProof() {
  try { return JSON.parse(document.querySelector("#proofText")?.value || "null"); }
  catch { return null; }
}

function syncInvalidContributionUi() {
  const proof = currentProof();
  if (!invalidProofRecord(proof)) return;

  for (const n of [9, 10]) {
    const chip = document.querySelector(`[data-stepchip="${n}"]`);
    chip?.classList.remove("done");
    const status = document.querySelector(`#s${n}`);
    if (status) {
      status.classList.remove("done");
      status.textContent = "Bekliyor";
    }
  }

  const out = document.querySelector("#contribOut");
  if (out && /seq\s+signed\b/i.test(out.textContent || "")) {
    out.textContent = "Önceki kayıt cevabında sayısal sequence alınamadı. Relay düzeltildi; contribution'ı bir kez yeniden gönder.";
  }
  const vault = document.querySelector("#vaultContrib");
  if (vault && !numericSeq(vault.textContent)) vault.textContent = "—";

  ["copyProof", "downloadProof", "xShare"].forEach((id) => {
    const el = document.querySelector(`#${id}`);
    if (el) el.disabled = true;
  });
}

scrubStoredState();

window.addEventListener("load", () => {
  repairXLinks();
  syncInvalidContributionUi();
  const timer = setInterval(() => {
    repairXLinks();
    syncInvalidContributionUi();
  }, 750);
  setTimeout(() => clearInterval(timer), 120000);
});
