const $ = (s) => document.querySelector(s);
const ACTIVITY_PREFIX = "reddragon-public-activity-v1:";
const STATE_PREFIX = "reddragon-public-state-v1:";

function activeDid() {
  const did = $("#vaultDid")?.textContent?.trim() || "";
  return /^did:key:z6Mk/.test(did) ? did : "";
}

function numericSeq(value) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0;
}

function seqFromText(value) {
  const s = String(value || "");
  const m = s.match(/\bseq\s+(\d+)\b/i) || s.match(/#(\d+)\b/);
  return m && numericSeq(m[1]) ? String(m[1]) : null;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; }
}

function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch {}
}

function readCoreState(did) {
  const state = readJson(localStorage, STATE_PREFIX + did);
  return state && state.did === did ? state : null;
}

function doneSet(did) {
  const set = new Set();
  const core = readCoreState(did);
  for (const n of core?.done || []) if (Number.isInteger(n)) set.add(n);
  document.querySelectorAll("[data-stepchip].done").forEach((el) => {
    const n = Number(el.dataset.stepchip);
    if (Number.isInteger(n)) set.add(n);
  });
  return set;
}

function parseProof() {
  try {
    const p = JSON.parse($("#proofText")?.value || "null");
    return p && typeof p === "object" ? p : null;
  } catch { return null; }
}

function readActivity(did) {
  const a = readJson(localStorage, ACTIVITY_PREFIX + did);
  return a && a.did === did ? a : { version: 1, did, updatedAt: null };
}

function formValue(id, fallback = "") {
  const core = activeDid() ? readCoreState(activeDid()) : null;
  const dom = $("#" + id)?.value;
  if (dom != null && String(dom).trim() !== "") return String(dom);
  return String(core?.form?.[id] ?? fallback);
}

function captureActivity(did) {
  const done = doneSet(did);
  const previous = readActivity(did);
  const proof = parseProof();
  const fp = $("#vaultFp")?.textContent?.trim() || proof?.fingerprint || "";
  const next = { ...previous, version: 1, did, fingerprint: fp || previous.fingerprint || null, updatedAt: new Date().toISOString() };

  if (proof?.didNote) next.didNote = proof.didNote;
  if (proof?.lobbyHello) next.lobbyHello = proof.lobbyHello;
  if (proof?.lobbyIntro) next.lobbyIntro = proof.lobbyIntro;
  if (proof?.publicRoom) next.publicRoom = proof.publicRoom;
  if (proof?.privateRoomCreated) next.privateRoomCreated = true;
  if (proof?.profileStyle) next.profileStyle = proof.profileStyle;

  if (done.has(3) && !next.didNote) {
    next.didNote = {
      namespace: "did",
      key: fp || null,
      value: did,
      status: "published",
      verification: "local-public-state"
    };
  }

  if (done.has(4) && !next.lobbyHello) {
    const seq = seqFromText($("#helloOut")?.textContent);
    next.lobbyHello = {
      room: "lobby",
      seq,
      text: clean(formValue("helloText")),
      verification: seq ? "local-public-seq" : "local-public-state"
    };
  } else if (done.has(4) && next.lobbyHello && !next.lobbyHello.seq) {
    const seq = seqFromText($("#helloOut")?.textContent);
    if (seq) next.lobbyHello.seq = seq;
  }

  if (done.has(5) && !next.lobbyIntro) {
    const seq = seqFromText($("#introOut")?.textContent) || (numericSeq($("#vaultLobby")?.textContent) ? $("#vaultLobby").textContent.trim() : null);
    const name = clean(formValue("agentName", "RedDragon")) || "RedDragon";
    const x = clean(formValue("xhandle"));
    const body = clean(formValue("introText"));
    next.lobbyIntro = {
      room: "lobby",
      seq,
      text: `${name}${x ? ` (${x})` : ""}: ${body}`.trim(),
      verification: seq ? "local-public-seq" : "local-public-state"
    };
  } else if (done.has(5) && next.lobbyIntro && !next.lobbyIntro.seq) {
    const seq = seqFromText($("#introOut")?.textContent) || (numericSeq($("#vaultLobby")?.textContent) ? $("#vaultLobby").textContent.trim() : null);
    if (seq) next.lobbyIntro.seq = seq;
  }

  if (done.has(6) && !next.publicRoom) {
    const room = clean($("#vaultRoom")?.textContent) && $("#vaultRoom").textContent.trim() !== "—"
      ? $("#vaultRoom").textContent.trim()
      : clean(formValue("publicRoom"));
    const seq = seqFromText($("#publicRoomOut")?.textContent);
    next.publicRoom = {
      room: room || null,
      seq,
      topic: clean(formValue("roomTopic")) || null,
      verification: seq ? "local-public-seq" : "local-public-state"
    };
  } else if (done.has(6) && next.publicRoom && !next.publicRoom.seq) {
    const seq = seqFromText($("#publicRoomOut")?.textContent);
    if (seq) next.publicRoom.seq = seq;
  }

  if (done.has(7)) next.privateRoomCreated = true;

  if (done.has(8) && !next.profileStyle) {
    next.profileStyle = {
      displayName: clean(formValue("displayName", "RedDragon")) || "RedDragon",
      color: formValue("profileColor", "#ff3b30") || "#ff3b30",
      verification: "local-public-state"
    };
  }

  writeJson(localStorage, ACTIVITY_PREFIX + did, next);
  return next;
}

function mergeIntoProof(did, activity) {
  const proof = parseProof();
  if (!proof || proof.did !== did) return;
  let changed = false;
  const setIfMissing = (key, value) => {
    if ((proof[key] == null || proof[key] === false) && value != null) {
      proof[key] = value;
      changed = true;
    }
  };
  setIfMissing("didNote", activity.didNote);
  setIfMissing("lobbyHello", activity.lobbyHello);
  setIfMissing("lobbyIntro", activity.lobbyIntro);
  setIfMissing("publicRoom", activity.publicRoom);
  if (!proof.privateRoomCreated && activity.privateRoomCreated) {
    proof.privateRoomCreated = true;
    changed = true;
  }
  setIfMissing("profileStyle", activity.profileStyle);
  if (!changed) return;
  proof.proofFormat = proof.proofFormat || "reddragon-public-proof-v2";
  proof.publicStateUpdatedAt = activity.updatedAt;
  $("#proofText").value = JSON.stringify(proof, null, 2);
  try { sessionStorage.setItem("reddragon-imported-public-proof", JSON.stringify(proof)); } catch {}
}

function tick() {
  const did = activeDid();
  if (!did) return;
  const activity = captureActivity(did);
  mergeIntoProof(did, activity);
}

window.addEventListener("load", () => {
  tick();
  setInterval(tick, 900);
});
