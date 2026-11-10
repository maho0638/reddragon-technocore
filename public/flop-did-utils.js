const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function isPublicEd25519Did(did) {
  if (typeof did !== "string" || !/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(did)) return false;
  let value = 0n;
  for (const char of did.slice("did:key:z".length)) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return false;
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  while (value > 0n) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  const encoded = did.slice("did:key:z".length);
  for (const char of encoded) { if (char !== "1") break; bytes.unshift(0); }
  return bytes.length === 34 && bytes[0] === 0xed && bytes[1] === 0x01;
}

export function ledgerStorageKey(did) {
  return isPublicEd25519Did(did) ? `reddragon-flop-testnet-ledger:${did}` : "";
}

export function loadDidLedger(storage, did, now = new Date()) {
  const empty = () => ({ version: 1, did: ledgerStorageKey(did) ? did : "", createdAt: now.toISOString(), entries: [] });
  const key = ledgerStorageKey(did);
  if (!key || !storage) return empty();
  try {
    const raw = JSON.parse(storage.getItem(key) || "null");
    if (raw && raw.version === 1 && raw.did === did && Array.isArray(raw.entries)) return raw;
  } catch {}
  return empty();
}

export function saveDidLedger(storage, ledger) {
  const key = ledgerStorageKey(ledger?.did);
  if (!key || !storage || ledger?.version !== 1 || !Array.isArray(ledger.entries)) return false;
  try { storage.setItem(key, JSON.stringify(ledger)); return true; }
  catch { return false; }
}
