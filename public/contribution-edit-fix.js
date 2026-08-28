const SESSION_KEY = "reddragon-imported-public-proof";
const PENDING_KEY = "reddragon-pending-public-proof";

function releaseContributionForm() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  try { sessionStorage.removeItem(PENDING_KEY); } catch {}
}

function installContributionEditFix() {
  const ids = ["clink", "ctitle", "csummary", "ctype", "targetRoom"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el || el.dataset.rdContributionEditFix === "1") continue;
    el.dataset.rdContributionEditFix = "1";
    el.addEventListener("input", releaseContributionForm, { passive: true });
    el.addEventListener("change", releaseContributionForm, { passive: true });
  }
}

window.addEventListener("load", () => {
  installContributionEditFix();
  setTimeout(installContributionEditFix, 500);
  setTimeout(installContributionEditFix, 1500);
});
