const $ = (s) => document.querySelector(s);

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
  setTimeout(reliableRelayStatus, 500);
});
