const cfg = window.APP_CONFIG || {};

function currentLang() {
  const saved = localStorage.getItem("reddragon-lang");
  return saved === "en" ? "en" : "tr";
}

function applyFinalFixes() {
  const handle = cfg.xHandle || "@joannawolker";
  const url = cfg.xUrl || "https://x.com/joannawolker";

  const ownerX = document.querySelector("#ownerX");
  if (ownerX) {
    ownerX.href = url;
    ownerX.textContent = `𝕏 ${handle}`;
  }

  const xInput = document.querySelector("#xhandle");
  if (xInput && (!xInput.value.trim() || xInput.value.trim() === "@joannawalker")) {
    xInput.value = handle;
    xInput.setAttribute("value", handle);
  }

  document.querySelectorAll('a[href="https://x.com/joannawalker"]').forEach((a) => {
    a.href = url;
    a.textContent = (a.textContent || "").replaceAll("@joannawalker", handle);
  });

  const didSecret = document.querySelector("#copyDidSecret")?.closest(".secret-row");
  if (didSecret) didSecret.classList.add("rd-hidden");

  const secretTitle = [...document.querySelectorAll('[data-step="11"] h3')]
    .find((h) => /Repository Secret/i.test(h.textContent || ""));
  if (secretTitle && /Secrets$/i.test(secretTitle.textContent.trim())) {
    secretTitle.textContent = "Repository Secret · sadece 1 tane";
  }

  const card = document.querySelector('[data-step="11"]');
  if (card) {
    let note = document.querySelector("#rdGithubScheduleNote");
    if (!note) {
      note = document.createElement("div");
      note.id = "rdGithubScheduleNote";
      note.className = "rd-security-note";
      const quick = document.querySelector("#rdQuickSetup");
      if (quick) quick.before(note); else card.appendChild(note);
    }
    if (currentLang() === "en") {
      note.innerHTML = "<b>GitHub schedule note</b> Scheduled workflows are disabled by default on public forks until you enable Actions. GitHub can also disable scheduled workflows in a public repository after 60 days with no repository activity.";
    } else {
      note.innerHTML = "<b>GitHub zamanlama notu</b> Public fork'larda scheduled workflow, Actions'tan etkinleştirene kadar varsayılan olarak kapalıdır. Ayrıca GitHub, public bir repoda 60 gün repo aktivitesi olmazsa scheduled workflow'u otomatik devre dışı bırakabilir.";
    }
  }
}

window.addEventListener("load", () => {
  applyFinalFixes();
  setTimeout(applyFinalFixes, 300);
  setTimeout(applyFinalFixes, 1500);
  setInterval(applyFinalFixes, 1200);
});
