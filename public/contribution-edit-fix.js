const SESSION_KEY = "reddragon-imported-public-proof";
const PENDING_KEY = "reddragon-pending-public-proof";
const EDIT_IDS = ["clink", "ctitle", "csummary", "ctype", "targetRoom"];

function currentLang() {
  return localStorage.getItem("reddragon-lang") === "en" ? "en" : "tr";
}

function activeDid() {
  const did = document.getElementById("vaultDid")?.textContent?.trim() || "";
  return /^did:key:z6Mk/.test(did) ? did : "";
}

function proofOnScreen() {
  try {
    const proof = JSON.parse(document.getElementById("proofText")?.value || "null");
    return proof && typeof proof === "object" ? proof : null;
  } catch {
    return null;
  }
}

function releaseContributionForm() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  try { sessionStorage.removeItem(PENDING_KEY); } catch {}
}

function normalizeContributionStatus() {
  const out = document.getElementById("contribOut");
  const proof = proofOnScreen();
  const record = proof?.contribution?.record;
  const seq = String(record?.seq || document.getElementById("vaultContrib")?.textContent || "").trim();
  if (!out || !/^\d+$/.test(seq)) return;

  const text = out.textContent || "";
  if (!/(Kalıcı Ed25519|Durable Ed25519|Imported \+ verified|Restored signed contribution|Yerel Ed25519|offline-ed25519)/i.test(text)) return;

  const room = String(record?.room || "technocore");
  const target = currentLang() === "en"
    ? `Durable Ed25519-signed contribution · ${room} · seq ${seq}`
    : `Kalıcı Ed25519 imzalı contribution · ${room} · seq ${seq}`;
  if (out.textContent !== target) out.textContent = target;
}

function settleAppliedProof() {
  let pending = null;
  try { pending = sessionStorage.getItem(PENDING_KEY); } catch {}
  if (pending) return;

  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch {}
  if (!cached || cached.did !== activeDid()) return;

  const visible = proofOnScreen();
  const cachedSeq = String(cached?.contribution?.record?.seq || "");
  const visibleSeq = String(visible?.contribution?.record?.seq || "");
  if (!visible || visible.did !== cached.did || !cachedSeq || cachedSeq !== visibleSeq) return;

  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  normalizeContributionStatus();
}

function installContributionEditFix() {
  for (const id of EDIT_IDS) {
    const el = document.getElementById(id);
    if (!el || el.dataset.rdContributionEditFix === "1") continue;
    el.dataset.rdContributionEditFix = "1";
    el.addEventListener("input", releaseContributionForm, { passive: true });
    el.addEventListener("change", releaseContributionForm, { passive: true });
  }
}

window.addEventListener("load", () => {
  installContributionEditFix();
  const settle = () => {
    installContributionEditFix();
    settleAppliedProof();
    normalizeContributionStatus();
  };
  settle();
  setTimeout(settle, 300);
  setTimeout(settle, 1000);
  setTimeout(settle, 2000);
});
