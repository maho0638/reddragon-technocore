const cfg = window.APP_CONFIG || {};

function currentLang() {
  const saved = localStorage.getItem("reddragon-lang");
  return saved === "en" ? "en" : "tr";
}

function fixProofImportCopy() {
  const proofBox = document.querySelector("#rdProofImport");
  if (!proofBox) return;

  const title = proofBox.querySelector(":scope > b");
  const desc = proofBox.querySelector(":scope > span");

  if (currentLang() === "en") {
    if (title) title.textContent = "Restore public proof";
    if (desc) {
      desc.textContent = " New proofs include the Ed25519 signature, so they can be verified locally even after the Technocore ring buffer removes the old message. Legacy v1 proofs can only be verified while the original record is still available on Technocore.";
    }
  } else {
    if (title) title.textContent = "Public proof'u geri yükle";
    if (desc) {
      desc.textContent = " Yeni proof'lar Ed25519 imzasını da içerir; Technocore ring buffer eski mesajı silse bile imza yerel olarak doğrulanabilir. Eski v1 proof'lar yalnızca kayıt hâlâ Technocore'da duruyorsa doğrulanabilir.";
    }
  }
}

function applyFinalFixes() {
  const isEn = currentLang() === "en";
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
  if (secretTitle) {
    secretTitle.textContent = isEn
      ? "Repository Secret · only one required"
      : "Repository Secret · sadece 1 tane";
  }

  const securityNote = document.querySelector("#rdQuickSetup .rd-security-note");
  if (securityNote) {
    securityNote.innerHTML = isEn
      ? '<b>Security rule</b> RedDragon never asks for your GitHub password, token, or wallet seed phrase. You paste the private key yourself only into the <b>Actions Secret</b> area of your own repository. The private key is never sent to a RedDragon server or written to public GitHub files.'
      : '<b>Güvenlik kuralı</b> RedDragon GitHub şifreni, tokenini veya wallet seed phrase\'ini istemez. Private key\'i yalnızca kendi GitHub repondaki <b>Actions Secret</b> alanına sen yapıştırırsın. Private key RedDragon sunucusuna gönderilmez ve public GitHub dosyalarına yazılmaz.';
  }

  fixProofImportCopy();

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
    note.innerHTML = isEn
      ? "<b>GitHub schedule note</b> Scheduled workflows are disabled by default on public forks until you enable Actions. GitHub can also disable scheduled workflows in a public repository after 60 days with no repository activity."
      : "<b>GitHub zamanlama notu</b> Public fork'larda scheduled workflow, Actions'tan etkinleştirene kadar varsayılan olarak kapalıdır. Ayrıca GitHub, public bir repoda 60 gün repo aktivitesi olmazsa scheduled workflow'u otomatik devre dışı bırakabilir.";
  }
}

window.addEventListener("load", () => {
  applyFinalFixes();
  setTimeout(applyFinalFixes, 300);
  setTimeout(applyFinalFixes, 1500);
});
