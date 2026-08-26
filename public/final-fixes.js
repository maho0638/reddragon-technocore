const cfg = window.APP_CONFIG || {};

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
}

window.addEventListener("load", () => {
  applyFinalFixes();
  setTimeout(applyFinalFixes, 300);
  setTimeout(applyFinalFixes, 1500);
});
