import { buildManualClaimCurl, isCanonicalNonce, makeSignedClaim, TESTNET_GENESIS } from "/flop-wallet-core.mjs";
import "/flop-wallet-chain.bundle.js";

const $ = (id) => document.getElementById(id);
const accountsByKey = new Map();
const providersByName = new Map();
const nonceByAddress = new Map();
let activityCursor = null;
let activityAddress = "";
let activityRows = [];
let activityBusy = false;
let activityBalance = "";
const COPY = {
  en: { intro: "This page never receives a seed or private key. Wallet signing happens in your extension. Testnet is unscored; test FLOP has no monetary value.", connect: "Connect selected wallet", provider: "Wallet extension", chooseProvider: "Choose extension", choosePrompt: "Choose an extension, then connect it.", account: "Account", connectFirst: "Connect a wallet first", prepare: "Prepare signed claim", checking: "Checking official Testnet identity and faucet limits…", notReady: "Faucet or RPC status is not verified. Signing is disabled.", ready: "Testnet identity and signed claim route verified. Current grant limit", noExtension: "No compatible Polkadot wallet extension was found.", denied: "Wallet access was not granted or no accounts were shared.", noSigner: "The selected account has no raw-message signer.", signFailed: "Wallet signing was not completed.", prepared: "Signed JSON prepared only. Nothing was sent to FLOP. Submit manually with the official client; an included transaction is not final until finalized on-chain.", copy: "Copy request JSON", copied: "Request JSON copied.", copyFailed: "Clipboard unavailable; select and copy the text manually.", safety: "The site does not submit a faucet request. The official faucet did not advertise browser CORS support in a read-only preflight, so this page prepares the exact signed JSON request for you to submit through your own client. No automatic retry occurs.", payload: "Signed request JSON", instructions: "Official claim instructions ↗" },
  tr: { intro: "Bu sayfa seed veya özel anahtar almaz. İmzalama cüzdan uzantınızda yapılır. Testnet puanlamasızdır; test FLOP'un parasal değeri yoktur.", connect: "Seçili cüzdanı bağla", provider: "Cüzdan uzantısı", chooseProvider: "Uzantı seç", choosePrompt: "Bir uzantı seç, sonra bağla.", account: "Hesap", connectFirst: "Önce cüzdan bağla", prepare: "İmzalı talep hazırla", checking: "Resmî Testnet kimliği ve faucet limitleri kontrol ediliyor…", notReady: "Faucet veya RPC durumu doğrulanamadı. İmzalama kapalı.", ready: "Testnet kimliği ve imzalı claim yolu doğrulandı. Güncel talep sınırı", noExtension: "Uyumlu Polkadot cüzdan uzantısı bulunamadı.", denied: "Cüzdan erişimi verilmedi veya hesap paylaşılmadı.", noSigner: "Seçilen hesapta ham mesaj imzalayıcısı yok.", signFailed: "Cüzdan imzalama işlemi tamamlanmadı.", prepared: "Yalnızca imzalı JSON hazırlandı. FLOP'a hiçbir şey gönderilmedi. Resmî istemciyle elle gönderin; dahil edilmiş işlem, zincirde kesinleşmeden sonlanmış sayılmaz.", copy: "Talep JSON'unu kopyala", copied: "Talep JSON'u panoya kopyalandı.", copyFailed: "Pano kullanılamıyor; metni elle seçip kopyalayın.", safety: "Bu sayfa faucet talebini göndermez. Salt okunur CORS ön kontrolünde resmî faucet tarayıcı CORS desteği bildirmedi; bu nedenle sayfa imzalı JSON'u hazırlar, siz kendi istemcinizle gönderirsiniz. Otomatik tekrar yapılmaz.", payload: "İmzalı talep JSON'u", instructions: "Resmî talep yönergesi ↗" }
};
Object.assign(COPY.en, { prepared: "Signed request and a manual curl command are prepared only. Nothing was sent. Review the command, then run it yourself if you choose. Treat the grant as spendable only after finalization.", copyCommand: "Copy manual curl command", commandCopied: "Manual command copied.", commandSafety: "Review this command before running it. It submits one signed request to the official faucet; there is no automatic submission or retry.", command: "Manual submission command · inspect before running", safety: "This page only prepares a signed request. FLOP's official agent guide documents a POST to the Testnet claim endpoint; this page provides a curl command for you to inspect and run manually. The page never submits the request." });
Object.assign(COPY.tr, { prepared: "Yalnızca imzalı talep ve elle çalıştırılacak curl komutu hazırlandı. Hiçbir şey gönderilmedi. İstersen komutu inceleyip kendin çalıştır. Talebi ancak işlem kesinleşince harcanabilir say.", copyCommand: "Elle gönderim komutunu kopyala", commandCopied: "Elle gönderim komutu kopyalandı.", commandSafety: "Çalıştırmadan önce komutu incele. Tek imzalı talebi resmî faucet'e gönderir; otomatik gönderim veya tekrar yoktur.", command: "Elle gönderim komutu · çalıştırmadan önce incele", safety: "Sayfa yalnızca imzalı talebi hazırlar. FLOP'un resmî ajan yönergesi Testnet claim adresine POST isteği gönderilmesini belgeliyor; bu sayfa inceleyip elle çalıştırman için curl komutu oluşturur. Talebi sayfa göndermez." });
Object.assign(COPY.en, { balanceLoading: "Checking finalized Testnet balance…", historyLoading: "Scanning finalized blocks…", historyEmpty: "No matching transfers in the scanned finalized blocks.", historyPartial: "Recent finalized blocks only. Full account history is not available through the published archive feed yet.", historyMore: "Load older blocks", historyEnd: "Reached the opening block.", refreshAccount: "Refresh balance and activity", forgetWallet: "Forget this wallet", explorer: "Open official Testnet explorer", connected: "Connected read-only to the verified FLOP Testnet.", chainError: "Read-only Testnet data could not be verified. Check the wallet and RPC, then retry.", in: "Received", out: "Sent", block: "Block", balance: "Free balance", activity: "Recent transfers", busy: "A read-only request is already running." });
Object.assign(COPY.tr, { balanceLoading: "Kesinleşmiş Testnet bakiyesi kontrol ediliyor…", historyLoading: "Kesinleşmiş bloklar taranıyor…", historyEmpty: "Taranan kesinleşmiş bloklarda eşleşen transfer yok.", historyPartial: "Yalnızca son kesinleşmiş bloklar. Yayımlanan arşiv akışı henüz tam hesap geçmişi sunmuyor.", historyMore: "Daha eski blokları yükle", historyEnd: "Açılış bloğuna ulaşıldı.", refreshAccount: "Bakiye ve hareketleri yenile", forgetWallet: "Bu cüzdanı unut", explorer: "Resmî Testnet explorer'ını aç", connected: "Doğrulanmış FLOP Testnet'e salt okunur bağlandı.", chainError: "Salt okunur Testnet verisi doğrulanamadı. Cüzdanı ve RPC'yi kontrol edip yeniden dene.", in: "Gelen", out: "Giden", block: "Blok", balance: "Kullanılabilir bakiye", activity: "Son transferler", busy: "Salt okunur bir istek zaten çalışıyor." });
const lang = () => { try { return (localStorage.getItem("reddragon-lang") || navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en"; } catch { return String(navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en"; } };
const say = (key) => COPY[lang()][key];
function message(text, state = "") { const el = $("rdWalletStatus"); if (el) { el.textContent = text; el.dataset.state = state; } }
function nonceFor(address) {
  if (nonceByAddress.has(address)) return nonceByAddress.get(address);
  const key = `rd-flop-claim-nonce:${address}`;
  try { const saved = sessionStorage.getItem(key); if (isCanonicalNonce(saved)) { nonceByAddress.set(address, saved); return saved; } } catch { /* Keep the nonce in memory when browser storage is disabled. */ }
  const value = String(Date.now());
  nonceByAddress.set(address, value);
  try { sessionStorage.setItem(key, value); } catch { /* The in-memory value remains stable for this tab. */ }
  return value;
}

async function readStatus() {
  const response = await fetch("/api/flop-status", { method: "GET", headers: { accept: "application/json" }, cache: "no-store", credentials: "same-origin", redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderLanguage() {
  const c = COPY[lang()];
  $("rdWalletIntro").textContent = c.intro;
  $("rdWalletConnect").textContent = c.connect;
  $("rdWalletProvider").setAttribute("aria-label", c.provider);
  $("rdPrepareClaim").textContent = c.prepare;
  $("rdWalletSafety").textContent = c.safety;
  const claimMessageLabel = $("rdClaimMessage")?.parentElement?.firstChild;
  if (claimMessageLabel?.nodeType === Node.TEXT_NODE) {
    claimMessageLabel.textContent = `${lang() === "tr" ? "İmzalanan mesaj" : "Signed message"}: `;
  }
  $("rdClaimPayload").previousElementSibling.textContent = c.payload;
  $("rdClaimCommand").previousElementSibling.textContent = c.command;
  $("rdCopyClaimCommand").textContent = c.copyCommand;
  $("rdClaimCommandSafety").textContent = c.commandSafety;
  $("rdWalletRefreshAccount").textContent = c.refreshAccount;
  $("rdWalletForget").textContent = c.forgetWallet;
  $("rdWalletExplorer").textContent = c.explorer;
  $("rdWalletHistoryTitle").textContent = c.activity;
  $("rdWalletHistoryMore").textContent = c.historyMore;
  $("rdWalletHistoryCoverage").textContent = c.historyPartial;
  if (activityAddress) {
    $("rdWalletChainStatus").textContent = c.connected;
    $("rdWalletHistoryStatus").textContent = activityRows.length ? c.historyPartial : c.historyEmpty;
    if (activityBalance) $("rdWalletBalance").textContent = `${c.balance}: ${activityBalance} FLOP`;
    renderTransfers();
  }
  $("rdCopyClaim").textContent = c.copy;
  $("rdClaimOutput").querySelector("a").textContent = c.instructions;
  $("rdWalletAccount").setAttribute("aria-label", c.account);
  if (!accountsByKey.size) { const option = $("rdWalletAccount").options[0]; if (option) option.textContent = c.connectFirst; }
  if (!providersByName.size) { const option = $("rdWalletProvider").options[0]; if (option) option.textContent = c.chooseProvider; }
  if (!$("rdClaimOutput").hidden) $("rdClaimState").textContent = c.prepared;
}

async function refreshStatus() {
  message(say("checking"));
  try {
    const data = await readStatus();
    const timestamp = Date.parse(data?.checkedAt || "");
    const ok = data?.services?.faucet?.ready === true && data?.services?.testnetRpc?.state === "identity-matched" && data?.testnet?.state === "live-unscored" && Number.isFinite(timestamp) && Date.now() - timestamp <= 5 * 60_000 && data?.services?.testnetRpc?.genesis === TESTNET_GENESIS;
    $("rdPrepareClaim").disabled = !ok || accountsByKey.size === 0;
    const limit = data?.services?.faucet?.limits;
    message(ok && limit ? `${say("ready")}: ${limit.grantFlop} FLOP / ${limit.cooldownSeconds}s` : say("notReady"), ok ? "ready" : "blocked");
    return ok ? data : null;
  } catch {
    $("rdPrepareClaim").disabled = true;
    message(say("notReady"), "blocked");
    return null;
  }
}

async function connectWallet() {
  const injected = globalThis.injectedWeb3;
  if (!injected || typeof injected !== "object") { message(say("noExtension"), "blocked"); return; }
  const providerSelect = $("rdWalletProvider");
  if (!providerSelect.value) {
    providersByName.clear(); providerSelect.replaceChildren();
    for (const [name, provider] of Object.entries(injected)) if (typeof provider?.enable === "function") providersByName.set(name, provider);
    if (!providersByName.size) { const option = document.createElement("option"); option.value = ""; option.textContent = say("chooseProvider"); providerSelect.append(option); providerSelect.disabled = true; message(say("noExtension"), "blocked"); return; }
    const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = say("chooseProvider"); providerSelect.append(placeholder);
    for (const name of providersByName.keys()) { const option = document.createElement("option"); option.value = name; option.textContent = name; providerSelect.append(option); }
    providerSelect.disabled = false; message(say("choosePrompt")); return;
  }
  const select = $("rdWalletAccount");
  accountsByKey.clear();
  const found = [];
  try {
    const source = providerSelect.value;
    const extension = await providersByName.get(source)?.enable("RedDragon FLOP");
    const accounts = await extension?.accounts?.get?.();
    for (const account of accounts || []) {
      if (typeof account?.address !== "string" || !account.address) continue;
      // Current injected accounts may expose name/genesisHash at top level without `meta`;
      // older extension releases expose `meta.name` and `meta.source`. Keep both compatible.
      const meta = account.meta && typeof account.meta === "object" ? account.meta : {};
      const normalized = { ...account, meta: {
        ...meta,
        name: typeof meta.name === "string" && meta.name ? meta.name : (typeof account.name === "string" && account.name ? account.name : account.address),
        source: typeof meta.source === "string" && meta.source ? meta.source : source
      } };
      const key = `${normalized.meta.source}:${normalized.address}`;
      accountsByKey.set(key, { account: normalized, signer: extension.signer, source });
      found.push({ key, account: normalized });
    }
  } catch { /* The selected extension can decline or be temporarily unavailable. */ }
  select.replaceChildren();
  for (const { key, account } of found) {
    const option = document.createElement("option"); option.value = key;
    option.textContent = `${account.meta.name || account.address} · ${account.meta.source} · ${account.address}`;
    select.append(option);
  }
  select.disabled = found.length === 0;
  if (!found.length) { const option = document.createElement("option"); option.value = ""; option.textContent = say("connectFirst"); select.append(option); message(say("denied"), "blocked"); return; }
  await refreshStatus();
  await refreshOnchain();
}

function renderTransfers() {
  const list = $("rdWalletHistoryList");
  list.replaceChildren();
  for (const row of activityRows) {
    const item = document.createElement("li");
    const summary = document.createElement("b");
    summary.textContent = `${say(row.direction)} ${row.amount} FLOP`;
    const details = document.createElement("small");
    details.textContent = `${say("block")} ${row.block} · ${row.txHash || "—"}`;
    item.append(summary, details);
    list.append(item);
  }
  if (!activityRows.length && activityAddress) $("rdWalletHistoryStatus").textContent = say("historyEmpty");
}

async function refreshOnchain({ older = false } = {}) {
  const selected = accountsByKey.get($("rdWalletAccount").value);
  if (!selected || activityBusy) return;
  const address = selected.account.address;
  const newAddress = address !== activityAddress;
  if (newAddress || !older) { activityAddress = address; activityCursor = null; activityRows = []; renderTransfers(); }
  activityBusy = true;
  $("rdWalletReadout").hidden = false;
  $("rdWalletBalance").textContent = say("balanceLoading");
  $("rdWalletHistoryStatus").textContent = say("historyLoading");
  $("rdWalletRefreshAccount").disabled = true;
  $("rdWalletHistoryMore").disabled = true;
  try {
    const result = await globalThis.RedDragonFlopReadOnly.connect(address);
    activityBalance = result.balance;
    $("rdWalletBalance").textContent = `${say("balance")}: ${activityBalance} FLOP`;
    $("rdWalletChainStatus").textContent = `${say("connected")} · runtime ${result.specVersion}`;
    const page = await globalThis.RedDragonFlopReadOnly.readTransfers(address, older ? activityCursor : null);
    activityRows = [...activityRows, ...page.rows];
    activityCursor = page.nextBeforeHeight;
    renderTransfers();
    $("rdWalletHistoryStatus").textContent = page.rows.length ? `${say("historyPartial")} · finalized ${page.finalizedHeight} · ${page.scannedFrom}–${page.scannedTo}` : say(activityCursor === null ? "historyEnd" : "historyEmpty");
    $("rdWalletHistoryMore").disabled = activityCursor === null;
  } catch {
    $("rdWalletBalance").textContent = say("chainError");
    $("rdWalletHistoryStatus").textContent = say("chainError");
    $("rdWalletChainStatus").textContent = say("chainError");
  } finally {
    activityBusy = false;
    $("rdWalletRefreshAccount").disabled = false;
    if (activityCursor !== null) $("rdWalletHistoryMore").disabled = false;
  }
}

async function forgetWallet() {
  accountsByKey.clear();
  activityRows = []; activityCursor = null; activityAddress = ""; activityBalance = "";
  $("rdWalletAccount").replaceChildren();
  const option = document.createElement("option"); option.value = ""; option.textContent = say("connectFirst"); $("rdWalletAccount").append(option);
  $("rdWalletAccount").disabled = true;
  $("rdWalletReadout").hidden = true;
  $("rdClaimOutput").hidden = true;
  $("rdPrepareClaim").disabled = true;
  try { await globalThis.RedDragonFlopReadOnly.disconnect(); } catch { /* Nothing else is retained by this page. */ }
  message(say("connectFirst"));
}

async function handleProviderChange() {
  accountsByKey.clear();
  activityRows = []; activityCursor = null; activityAddress = ""; activityBalance = "";
  $("rdWalletAccount").replaceChildren(); $("rdWalletAccount").disabled = true;
  $("rdWalletReadout").hidden = true; $("rdClaimOutput").hidden = true; $("rdPrepareClaim").disabled = true;
  try { await globalThis.RedDragonFlopReadOnly.disconnect(); } catch { /* Read-only RPC may already be closed. */ }
}

async function prepareClaim() {
  const selected = accountsByKey.get($("rdWalletAccount").value);
  if (!selected) { message(say("denied"), "blocked"); return; }
  const signer = selected.signer;
  if (typeof signer?.signRaw !== "function") { message(say("noSigner"), "blocked"); return; }
  const status = await refreshStatus();
  if (!status) return;
  const account = selected.account;
  const nonce = nonceFor(account.address);
  const button = $("rdPrepareClaim"); button.disabled = true;
  try {
    const signed = await makeSignedClaim({ status, account, signer, nonce });
    $("rdClaimPayload").value = JSON.stringify(signed.request, null, 2);
    $("rdClaimCommand").value = buildManualClaimCurl(signed.request);
    $("rdClaimMessage").textContent = signed.message;
    $("rdClaimOutput").hidden = false;
    $("rdClaimState").textContent = say("prepared");
  } catch (error) {
    message(error?.message === "Wallet extension does not support raw-message signing" ? say("noSigner") : say("signFailed"), "blocked");
  } finally {
    button.disabled = false;
  }
}

$("rdWalletConnect")?.addEventListener("click", connectWallet);
$("rdWalletProvider")?.addEventListener("change", handleProviderChange);
$("rdWalletAccount")?.addEventListener("change", async () => { await refreshStatus(); $("rdClaimOutput").hidden = true; });
$("rdWalletAccount")?.addEventListener("change", () => refreshOnchain());
$("rdWalletRefreshAccount")?.addEventListener("click", () => refreshOnchain());
$("rdWalletHistoryMore")?.addEventListener("click", () => refreshOnchain({ older: true }));
$("rdWalletForget")?.addEventListener("click", forgetWallet);
$("rdPrepareClaim")?.addEventListener("click", prepareClaim);
$("rdCopyClaim")?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("rdClaimPayload").value); $("rdClaimState").textContent = say("copied"); }
  catch { $("rdClaimPayload").focus(); $("rdClaimPayload").select(); $("rdClaimState").textContent = say("copyFailed"); }
});
$("rdCopyClaimCommand")?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("rdClaimCommand").value); $("rdClaimState").textContent = say("commandCopied"); }
  catch { $("rdClaimCommand").focus(); $("rdClaimCommand").select(); $("rdClaimState").textContent = say("copyFailed"); }
});
$("rdFlopLanguage")?.addEventListener("change", renderLanguage);
renderLanguage();
refreshStatus();
