const FLOP_UNIT = 10n ** 18n;

export function formatFlop(raw) {
  const value = BigInt(raw);
  const whole = value / FLOP_UNIT;
  const fraction = value % FLOP_UNIT;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

export function transferRow(record, address, block, txHash = null) {
  const event = record?.event;
  if (event?.section !== "balances" || event?.method !== "Transfer") return null;
  const from = String(event.data?.[0] ?? "");
  const to = String(event.data?.[1] ?? "");
  if (from !== address && to !== address) return null;
  let amount;
  try { amount = formatFlop(BigInt(String(event.data?.[2] ?? ""))); } catch { return null; }
  return { block, direction: to === address ? "in" : "out", amount, from, to, txHash };
}
