function activeDidForProgress() {
  const did = document.getElementById("vaultDid")?.textContent?.trim() || "";
  return /^did:key:z6Mk/.test(did) ? did : "";
}

function syncScopedProgressRing() {
  const ring = document.getElementById("progressRing");
  if (!ring) return;

  const did = activeDidForProgress();
  let done = 0;

  if (did) {
    for (let i = 1; i <= 10; i++) {
      const chip = document.querySelector(`[data-stepchip="${i}"]`);
      if (chip?.classList.contains("done")) done++;
    }
  }

  const pct = did ? Math.round((done / 10) * 100) : 0;
  ring.style.setProperty("--pct", `${pct}%`);
  const strong = ring.querySelector("strong");
  if (strong) strong.textContent = `${pct}%`;
}

window.addEventListener("load", () => {
  syncScopedProgressRing();

  // Existing DID/public-proof restore modules settle asynchronously. Re-check briefly
  // without observing/mutating the same nodes, avoiding UI feedback loops.
  let checks = 0;
  const timer = setInterval(() => {
    syncScopedProgressRing();
    if (++checks >= 60) clearInterval(timer);
  }, 500);
});
