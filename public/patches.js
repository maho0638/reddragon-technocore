const $ = (s) => document.querySelector(s);

function showToast(message) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove("show"), 3200);
}

function shardedDidMeta(proof) {
  if (!proof || typeof proof !== "object") return proof;
  const fp = String(proof.fingerprint || "");
  if (/^[0-9a-f]{16}$/.test(fp) && proof.didNote && proof.didNote.namespace === "did") {
    proof.didNote = {
      ...proof.didNote,
      namespace: `did-${fp.slice(0, 2)}`,
      key: fp.slice(2),
      path: `/kv/did-${fp.slice(0, 2)}/${fp.slice(2)}`,
      convention: "sharded DID note"
    };
  }
  return proof;
}

function patchDidNoteDisplay() {
  const out = $("#didNoteOut");
  const fpNode = $("#vaultFp");
  if (!out || !fpNode) return;
  const apply = () => {
    const fp = (fpNode.textContent || "").trim();
    if (!/^[0-9a-f]{16}$/.test(fp)) return;
    if (/Published · \/kv\/did\//.test(out.textContent || "")) {
      out.textContent = `Published · /kv/did-${fp.slice(0, 2)}/${fp.slice(2)} · current sharded DID path`;
    }
  };
  new MutationObserver(apply).observe(out, { childList: true, subtree: true, characterData: true });
  apply();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function proofObject() {
  try { return shardedDidMeta(JSON.parse($("#proofText")?.value || "{}")); }
  catch { return null; }
}

function patchProofButtons() {
  const copyBtn = $("#copyProof");
  if (copyBtn) {
    const b = copyBtn.cloneNode(true);
    copyBtn.replaceWith(b);
    b.onclick = async () => {
      const p = proofObject();
      if (!p) return;
      const text = JSON.stringify(p, null, 2);
      const box = $("#proofText");
      if (box) box.value = text;
      await copyText(text);
      showToast("Proof kopyalandı · DID path güncel");
    };
  }

  const dlBtn = $("#downloadProof");
  if (dlBtn) {
    const b = dlBtn.cloneNode(true);
    dlBtn.replaceWith(b);
    b.onclick = () => {
      const p = proofObject();
      if (!p) return;
      const fp = String(p.fingerprint || "proof");
      const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reddragon-proof-${fp}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
}

function patchRestoreFlow() {
  const input = $("#restoreInput");
  const identityOut = $("#identityOut");
  const steps = $("#steps");
  if (!input || !identityOut || !steps) return;

  let restoreAttempt = false;
  let restoredBackupVerified = false;

  input.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = String(file.name || "").toLowerCase();

    if (name.includes("reddragon-proof") || name.startsWith("proof")) {
      event.stopImmediatePropagation();
      event.preventDefault();
      input.value = "";
      showToast("Bu public proof dosyası. Geri yükleme için reddragon-technocore-…json dosyasını seç.");
      return;
    }
    if (!name.endsWith(".json")) {
      event.stopImmediatePropagation();
      event.preventDefault();
      input.value = "";
      showToast("Kimlik yedeği JSON dosyası olmalı.");
      return;
    }
    if (file.size > 128 * 1024) {
      event.stopImmediatePropagation();
      event.preventDefault();
      input.value = "";
      showToast("Bu dosya beklenen kimlik yedeğinden çok büyük; güvenlik için açılmadı.");
      return;
    }
    restoreAttempt = true;
  }, true);

  function syncRestoredBackupUi() {
    if (!restoredBackupVerified) return;

    const s2 = $("#s2");
    if (s2) {
      if (s2.textContent !== "Tamam") s2.textContent = "Tamam";
      if (!s2.classList.contains("done")) s2.classList.add("done");
    }

    const chip2 = document.querySelector('[data-stepchip="2"]');
    if (chip2 && !chip2.classList.contains("done")) chip2.classList.add("done");

    const card2 = document.querySelector('[data-step="2"]');
    if (card2 && !card2.querySelector(".rd-restore-ok")) {
      const note = document.createElement("div");
      note.className = "result rd-restore-ok";
      note.textContent = "Şifreli kimlik yedeği doğrulandı ve başarıyla geri yüklendi.";
      card2.appendChild(note);
    }

    const doneCount = [...document.querySelectorAll('[data-stepchip]')]
      .filter((chip) => Number(chip.dataset.stepchip) <= 10 && chip.classList.contains("done")).length;
    const pct = Math.round(doneCount / 10 * 100);
    const ring = $("#progressRing");
    if (ring) {
      ring.style.setProperty("--pct", `${pct}%`);
      const strong = ring.querySelector("strong");
      if (strong && strong.textContent !== `${pct}%`) strong.textContent = `${pct}%`;
    }
  }

  const identityObserver = new MutationObserver(() => {
    const text = identityOut.textContent || "";
    if (!/did:key:z6Mk/.test(text)) return;

    // Password fields should never remain populated after a usable identity exists.
    const p1 = $("#pass1");
    const p2 = $("#pass2");
    if (p1) p1.value = "";
    if (p2) p2.value = "";

    if (restoreAttempt) {
      restoreAttempt = false;
      restoredBackupVerified = true;
      syncRestoredBackupUi();
      showToast("Kimlik yedeği doğrulandı · DID + private key geri yüklendi");
    }
  });
  identityObserver.observe(identityOut, { childList: true, subtree: true, characterData: true });

  // Core UI refreshes can redraw completion state; keep step 2 consistent for this live restored session.
  new MutationObserver(() => queueMicrotask(syncRestoredBackupUi))
    .observe(steps, { subtree: true, attributes: true, attributeFilter: ["class"] });

  document.addEventListener("click", () => {
    if (restoredBackupVerified) setTimeout(syncRestoredBackupUi, 0);
  }, true);
}

async function reliableRelayStatus() {
  const live = $(".live");
  if (!live) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "health" }),
      signal: controller.signal
    });
    if (!r.ok) throw new Error(String(r.status));
    live.lastChild.textContent = " relay online";
    live.classList.remove("rd-status-bad");
    live.classList.add("rd-status-ok");
  } catch {
    live.lastChild.textContent = " relay offline";
    live.classList.remove("rd-status-ok");
    live.classList.add("rd-status-bad");
  } finally {
    clearTimeout(timer);
  }
}

window.addEventListener("load", () => {
  patchDidNoteDisplay();
  patchProofButtons();
  patchRestoreFlow();
  setTimeout(reliableRelayStatus, 500);
});
