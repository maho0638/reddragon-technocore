const $ = (s) => document.querySelector(s);

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
      $("#toast") && ($("#toast").textContent = "Proof kopyalandı · DID path güncel");
      $("#toast")?.classList.add("show");
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
  setTimeout(reliableRelayStatus, 500);
});
