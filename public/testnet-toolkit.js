const RD_TESTNET_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_TESTNET_LEDGER_KEY = `reddragon-flop-testnet-ledger:${RD_TESTNET_DID}`;
const RD_TESTNET_STATUS = Object.freeze({
  checkedAt: "2026-11-03",
  draftUpdated: "2026-09-24",
  planned: "3 Nov target · unconfirmed",
  testnetStatus: "planned / unreleased",
  devnetEarnsRewards: false,
  faucetLive: false,
  inferenceLive: false,
  source: "https://docs.flop.network/networks/testnet"
});

function rdTestnetLang(){
  try{const v=localStorage.getItem("reddragon-lang");if(v==="tr"||v==="en")return v;}catch{}
  return String(navigator.language||"").toLowerCase().startsWith("tr")?"tr":"en";
}

const rdTestnetCopy={
  tr:{
    kicker:"FLOP TESTNET HAZIRLIK ARAÇLARI",
    title:"Testnet'e hazır mısın?",
    intro:"FLOP'un güncel taslak parametrelerini pratik kontrollere çevirir. Airdrop tahmini yapmaz; agent harcaması, faucet/inference kaydı, miner donanımı ve validator hazırlığını ölçer.",
    badge:"taslak parametreler · garanti değil",
    statusTitle:"Resmî testnet durumu",statusPlanned:"Testnet planı",statusDraft:"Taslak güncelleme",statusChecked:"Son kontrol",statusOff:"Henüz canlı değil",statusOn:"Canlı",statusNoEndpoint:"3 Kasım 2026 kontrolü: resmî public Testnet planned/unreleased. Doğrulanmış genesis, RPC, faucet kaydı veya ajan katılımı yok. Devnet ödül kazandırmaz.",
    ledgerTitle:"DID-bağlı faucet + inference ledger",ledgerIntro:"Testnet açıldığında claim ve inference kullanımını aynı RedDragon DID altında kaydet. Kayıtlar yalnızca bu tarayıcıda tutulur; private key içermez.",
    faucetClaim:"Faucet claim kaydı",inferenceEntry:"Inference harcaması",amount:"Test FLOP miktarı",reference:"Session / tx / claim referansı",model:"Model / görev (opsiyonel)",recordClaim:"Claim kaydet",recordSpend:"Inference kaydet",exportProof:"Ledger JSON dışa aktar",clearLedger:"Ledger'ı temizle",confirmClear:"Bu tarayıcıdaki testnet ledger kayıtları silinsin mi?",needAmount:"Pozitif bir FLOP miktarı gir.",needRef:"Doğrulanabilir bir referans gir.",ledgerEmpty:"Henüz kayıt yok.",claimedTotal:"Toplam faucet claim",spentTotal:"Toplam inference spend",unlockEq:"Mainnet kilidi yerel kayıttan hesaplanamaz",entries:"kayıt",localOnly:"Yerel kayıt · zincir üstü kanıt değildir",
    spendTitle:"Mainnet Agent grant senaryosu",
    spendIntro:"Bu yalnızca mainnet'teki kilitli Agent grant için R8.7–R8.8 matematik örneğidir: kesinleşmiş ve itiraz süresi geçmiş kilitli-grant inference payable'ının her 3 FLOP'u 1 FLOP kilit açar; harcanabilecek anapara üst sınırı grant'in %75'idir. Testnet harcaması veya bu sayfaya elle yazılan kayıtlar mainnet kilidini açmaz.",
    allocation:"Varsayımsal mainnet Agent grant",spent:"Kilitli grant'ten ödenen uygun payable (mainnet)",unlocked:"Örnek kilidi açılan",locked:"Harcanmamış ve kilitli kalan",required:"Azami kilitli anapara spend (%75)",
    minerTitle:"Miner donanım kontrolü",minerIntro:"Resmî teaser şu an tek GPU veya GPU kümesini destekliyor ve GPU başına 16 GB+ VRAM öneriyor.",gpuCount:"GPU adedi",vram:"GPU başına VRAM (GB)",minerOk:"Önerilen VRAM eşiğini karşılıyor",minerBad:"Önerilen VRAM eşiğinin altında",minerNote:"Bu yalnızca güncel önerilen donanım kontrolüdür; mining ödülü veya kabul garantisi değildir.",
    validatorTitle:"Validator hazırlık kontrolü",validatorIntro:"Mevcut provisional öneri: 8+ CPU core, 64 GB RAM, 2 TB NVMe ve 1 Gbps redundant bağlantı.",cores:"CPU core",ram:"RAM (GB)",disk:"NVMe (TB)",net:"Bağlantı (Gbps)",validatorOk:"Güncel önerilen eşiği karşılıyor",validatorBad:"Bazı önerilen eşikler eksik",
    plan1:"1 · Aynı DID'yi koru",plan1d:"Technocore geçmişini ve katkı zincirini tek kimlikte sürdür.",plan2:"2 · Faucet açılınca claim",plan2d:"Test FLOP'u aynı DID altında kaydet ve kullanım için hazır tut.",plan3:"3 · Inference harca",plan3d:"Testnet puanının resmî harcama/settlement şartlarını doğrula; testnet harcaması ile mainnet kilit açılmasını birbirine karıştırma.",plan4:"4 · Katkıyı kanıtla",plan4d:"Tool, TCLK ve diğer public katkıları aynı DID'nin signed manifest zincirine ekle.",
    source:"Kaynak: FLOP Yellow Paper v0.5.0 R8.7–R8.8 ve resmî operator testnet durumu (3 Kasım 2026). Bu statik kontroldür; ağ açılışı için resmî bağlantıyı kontrol edin.",redDid:"RedDragon aynı DID ile devam ediyor"
  },
  en:{
    kicker:"FLOP TESTNET READINESS TOOLS",title:"Are you testnet-ready?",intro:"Turns FLOP's current draft parameters into practical checks. It does not estimate an airdrop; it tracks agent spend, faucet/inference activity, miner hardware and validator readiness.",badge:"draft parameters · no guarantee",
    statusTitle:"Official testnet status",statusPlanned:"Testnet plan",statusDraft:"Draft updated",statusChecked:"Last checked",statusOff:"Not live yet",statusOn:"Live",statusNoEndpoint:"As of 3 Nov 2026 the official public Testnet remains planned/unreleased: no verified genesis, RPC, faucet admission or agent onboarding. Devnet earns no rewards.",
    ledgerTitle:"DID-bound faucet + inference ledger",ledgerIntro:"When testnet opens, record claims and inference usage under the same RedDragon DID. Records stay in this browser only and contain no private key.",faucetClaim:"Faucet claim record",inferenceEntry:"Inference spend",amount:"Test FLOP amount",reference:"Session / tx / claim reference",model:"Model / task (optional)",recordClaim:"Record claim",recordSpend:"Record inference",exportProof:"Export ledger JSON",clearLedger:"Clear ledger",confirmClear:"Delete this browser's testnet ledger records?",needAmount:"Enter a positive FLOP amount.",needRef:"Enter a verifiable reference.",ledgerEmpty:"No records yet.",claimedTotal:"Total faucet claims",spentTotal:"Total inference spend",unlockEq:"No mainnet unlock proven by local entries",entries:"entries",localOnly:"Local record · not on-chain proof",
    spendTitle:"Mainnet Agent grant scenario",spendIntro:"An illustration of Yellow Paper R8.7–R8.8 for a mainnet locked Agent grant only: each 3 FLOP of eligible finalized payable sourced from locked principal unlocks 1 FLOP, subject to the dispute window and a 75% locked-spend cap. Testnet spending and manually entered ledger rows do not unlock mainnet grants.",allocation:"Hypothetical mainnet Agent grant",spent:"Eligible payable from locked grant (mainnet)",unlocked:"Illustrative unlocked",locked:"Unspent and still locked",required:"Maximum locked-principal spend (75%)",
    minerTitle:"Miner hardware check",minerIntro:"The official teaser currently supports a single GPU or a GPU cluster and recommends 16 GB+ VRAM per GPU.",gpuCount:"GPU count",vram:"VRAM per GPU (GB)",minerOk:"Meets the recommended VRAM threshold",minerBad:"Below the recommended VRAM threshold",minerNote:"This only checks current recommended hardware; it does not guarantee mining rewards or acceptance.",
    validatorTitle:"Validator readiness check",validatorIntro:"Current provisional recommendation: 8+ CPU cores, 64 GB RAM, 2 TB NVMe and a 1 Gbps redundant connection.",cores:"CPU cores",ram:"RAM (GB)",disk:"NVMe (TB)",net:"Connection (Gbps)",validatorOk:"Meets the current recommended thresholds",validatorBad:"Some recommended thresholds are missing",
    plan1:"1 · Keep one DID",plan1d:"Preserve Technocore history and contribution proof under one identity.",plan2:"2 · Claim when faucet opens",plan2d:"Record test FLOP under the same DID and keep it ready for usage.",plan3:"3 · Spend on inference",plan3d:"Follow official settled-compute scoring rules; testnet inference activity is not mainnet locked-grant unlocking.",plan4:"4 · Prove contributions",plan4d:"Bind tools, TCLK and other public work to the same DID's signed manifest trail.",
    source:"Source: FLOP Yellow Paper v0.5.0 R8.7–R8.8 and official operator testnet status (3 Nov 2026). This is a static snapshot; check the official network link for later changes.",redDid:"RedDragon continues with the same DID"
  }
};

const rdTT=()=>rdTestnetCopy[rdTestnetLang()];
const rdNum=(id)=>Math.max(0,Number(document.getElementById(id)?.value||0)||0);
const rdFmt=(n)=>Number.isFinite(n)?n.toLocaleString(rdTestnetLang()==="tr"?"tr-TR":"en-US",{maximumFractionDigits:4}):"0";
const rdEsc=(v)=>String(v||"").replace(/[\u0000-\u001f\u007f-\u009f]/g," ").trim().slice(0,220);

function rdLedgerLoad(){
  try{
    const raw=JSON.parse(localStorage.getItem(RD_TESTNET_LEDGER_KEY)||"null");
    if(raw&&raw.version===1&&raw.did===RD_TESTNET_DID&&Array.isArray(raw.entries))return raw;
  }catch{}
  return {version:1,did:RD_TESTNET_DID,createdAt:new Date().toISOString(),entries:[]};
}
function rdLedgerSave(ledger){try{localStorage.setItem(RD_TESTNET_LEDGER_KEY,JSON.stringify(ledger));}catch{}}
function rdLedgerTotals(ledger){
  let claimed=0,spent=0;for(const e of ledger.entries){const a=Math.max(0,Number(e.amount)||0);if(e.type==="faucet")claimed+=a;if(e.type==="inference")spent+=a;}
  return {claimed,spent,unlock:null}; // A local, self-entered testnet ledger cannot establish mainnet vesting credit.
}
function rdLedgerRecord(type){
  const t=rdTT();const amount=rdNum(type==="faucet"?"rdFaucetAmount":"rdInferenceAmount");
  const ref=rdEsc(document.getElementById(type==="faucet"?"rdFaucetRef":"rdInferenceRef")?.value);
  const model=type==="inference"?rdEsc(document.getElementById("rdInferenceModel")?.value):"";
  if(!(amount>0)){alert(t.needAmount);return;}if(!ref){alert(t.needRef);return;}
  const ledger=rdLedgerLoad();ledger.entries.push({type,amount,reference:ref,...(model?{model}:{}),recordedAt:new Date().toISOString(),officialEndpointLiveAtRecord:type==="faucet"?RD_TESTNET_STATUS.faucetLive:RD_TESTNET_STATUS.inferenceLive});
  rdLedgerSave(ledger);
  for(const id of type==="faucet"?["rdFaucetAmount","rdFaucetRef"]:["rdInferenceAmount","rdInferenceRef","rdInferenceModel"]){const el=document.getElementById(id);if(el)el.value="";}
  rdLedgerRender();
}
function rdLedgerRemove(index){const ledger=rdLedgerLoad();if(index<0||index>=ledger.entries.length)return;ledger.entries.splice(index,1);rdLedgerSave(ledger);rdLedgerRender();}
function rdLedgerClear(){if(!confirm(rdTT().confirmClear))return;rdLedgerSave({version:1,did:RD_TESTNET_DID,createdAt:new Date().toISOString(),entries:[]});rdLedgerRender();}
function rdLedgerExport(){
  const ledger=rdLedgerLoad();const totals=rdLedgerTotals(ledger);const payload={schema:"reddragon-flop-testnet-ledger/v1",did:RD_TESTNET_DID,exportedAt:new Date().toISOString(),officialStatus:RD_TESTNET_STATUS,totals,entries:ledger.entries,disclaimer:"Self-entered browser-local log, not on-chain evidence. Testnet activity does not establish eligibility or unlocked mainnet FLOP. No private key is included."};
  const blob=new Blob([JSON.stringify(payload,null,2)+"\n"],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`reddragon-flop-ledger-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function rdLedgerRender(){
  const ledger=rdLedgerLoad();const totals=rdLedgerTotals(ledger);const t=rdTT();
  const claimed=document.getElementById("rdLedgerClaimed"),spent=document.getElementById("rdLedgerSpent"),unlock=document.getElementById("rdLedgerUnlock"),count=document.getElementById("rdLedgerCount");
  if(claimed)claimed.textContent=rdFmt(totals.claimed);if(spent)spent.textContent=rdFmt(totals.spent);if(unlock)unlock.textContent="—";if(count)count.textContent=`${ledger.entries.length} ${t.entries}`;
  // Do not copy recorded testnet spend into the separate mainnet locked-grant example.
  rdSpendCalc();
  const host=document.getElementById("rdLedgerRows");if(!host)return;host.textContent="";
  if(!ledger.entries.length){const e=document.createElement("div");e.className="rd-ledger-empty";e.textContent=t.ledgerEmpty;host.appendChild(e);return;}
  ledger.entries.slice().reverse().forEach((entry,reverseIndex)=>{
    const actualIndex=ledger.entries.length-1-reverseIndex;const row=document.createElement("div");row.className="rd-ledger-row";
    const main=document.createElement("div");const b=document.createElement("b");b.textContent=`${entry.type==="faucet"?"FAUCET":"INFERENCE"} · ${rdFmt(Number(entry.amount)||0)} FLOP`;const small=document.createElement("small");small.textContent=`${entry.reference}${entry.model?` · ${entry.model}`:""}`;main.append(b,small);
    const meta=document.createElement("div");const time=document.createElement("span");time.textContent=new Date(entry.recordedAt).toLocaleString(rdTestnetLang()==="tr"?"tr-TR":"en-US");const del=document.createElement("button");del.type="button";del.textContent="×";del.setAttribute("aria-label","remove");del.addEventListener("click",()=>rdLedgerRemove(actualIndex));meta.append(time,del);row.append(main,meta);host.appendChild(row);
  });
}

function rdSpendCalc(){
  const allocation=rdNum("rdSpendAllocation");const spent=rdNum("rdSpendAmount");const required=allocation*0.75;const eligibleSpent=Math.min(spent,required);const unlocked=Math.min(allocation*0.25,eligibleSpent/3);const locked=Math.max(0,allocation-eligibleSpent-unlocked);
  const u=document.getElementById("rdSpendUnlocked"),l=document.getElementById("rdSpendLocked"),r=document.getElementById("rdSpendRequired");if(u)u.textContent=rdFmt(unlocked);if(l)l.textContent=rdFmt(locked);if(r)r.textContent=rdFmt(required);
  const box=document.getElementById("rdSpendResult");if(box)box.dataset.state=allocation>0&&eligibleSpent>=required?"ok":spent>0?"warn":"";
}
function rdMinerCalc(){const t=rdTT();const count=Math.max(1,Math.round(rdNum("rdMinerCount")||1));const vram=rdNum("rdMinerVram");const ok=vram>=16;const box=document.getElementById("rdMinerResult");if(!box)return;box.dataset.state=ok?"ok":"warn";box.querySelector("b").textContent=ok?t.minerOk:t.minerBad;box.querySelector("small").textContent=`${count} GPU · ${rdFmt(vram)} GB/GPU · ${rdFmt(count*vram)} GB total VRAM. ${t.minerNote}`;}
function rdSetCheck(id,ok,value){const row=document.getElementById(id);if(!row)return;row.dataset.state=ok?"ok":"bad";row.querySelector("small").textContent=value;}
function rdValidatorCalc(){const t=rdTT();const cores=rdNum("rdValCores"),ram=rdNum("rdValRam"),disk=rdNum("rdValDisk"),net=rdNum("rdValNet");const checks=[cores>=8,ram>=64,disk>=2,net>=1];rdSetCheck("rdCheckCores",checks[0],`${rdFmt(cores)} / 8+`);rdSetCheck("rdCheckRam",checks[1],`${rdFmt(ram)} / 64+ GB`);rdSetCheck("rdCheckDisk",checks[2],`${rdFmt(disk)} / 2+ TB`);rdSetCheck("rdCheckNet",checks[3],`${rdFmt(net)} / 1+ Gbps`);const box=document.getElementById("rdValidatorResult");if(!box)return;const ok=checks.every(Boolean);box.dataset.state=ok?"ok":"warn";box.querySelector("b").textContent=ok?t.validatorOk:t.validatorBad;box.querySelector("small").textContent=`${checks.filter(Boolean).length}/4`;}

function rdTestnetBuild(){
  if(document.getElementById("rdTestnetToolkit"))return true;const anchor=document.getElementById("did-provenance")||document.getElementById("live-observatory");if(!anchor)return false;const t=rdTT();const sec=document.createElement("section");sec.id="testnet-toolkit";sec.className="rd-testnet-section";
  sec.innerHTML=`<div id="rdTestnetToolkit" class="rd-testnet-shell">
    <div class="rd-testnet-head"><div><span class="rd-testnet-kicker">${t.kicker}</span><h2>${t.title}</h2><p>${t.intro}</p></div><span class="rd-testnet-badge">${t.badge}</span></div>
    <article class="rd-testnet-status"><div><span>${t.statusTitle}</span><b data-state="off">${t.statusOff}</b></div><div><small>${t.statusPlanned}</small><strong>${RD_TESTNET_STATUS.planned}</strong></div><div><small>${t.statusDraft}</small><strong>${RD_TESTNET_STATUS.draftUpdated}</strong></div><div><small>${t.statusChecked}</small><strong>${RD_TESTNET_STATUS.checkedAt}</strong></div><p>${t.statusNoEndpoint}</p></article>
    <article class="rd-testnet-ledger"><div class="rd-ledger-head"><div><h3>${t.ledgerTitle}</h3><p>${t.ledgerIntro}</p></div><code>${RD_TESTNET_DID}</code></div>
      <div class="rd-ledger-summary"><div><small>${t.claimedTotal}</small><b><span id="rdLedgerClaimed">0</span> FLOP</b></div><div><small>${t.spentTotal}</small><b><span id="rdLedgerSpent">0</span> FLOP</b></div><div><small>${t.unlockEq}</small><b><span id="rdLedgerUnlock">—</span></b></div><div><small>${t.localOnly}</small><b id="rdLedgerCount">0 ${t.entries}</b></div></div>
      <div class="rd-ledger-forms"><div><h4>${t.faucetClaim}</h4><label for="rdFaucetAmount">${t.amount}</label><input id="rdFaucetAmount" type="number" min="0" step="0.0001" placeholder="0"><label for="rdFaucetRef">${t.reference}</label><input id="rdFaucetRef" type="text" maxlength="220" placeholder="claim / tx / session id"><button id="rdRecordFaucet" type="button">${t.recordClaim}</button></div><div><h4>${t.inferenceEntry}</h4><label for="rdInferenceAmount">${t.amount}</label><input id="rdInferenceAmount" type="number" min="0" step="0.0001" placeholder="0"><label for="rdInferenceRef">${t.reference}</label><input id="rdInferenceRef" type="text" maxlength="220" placeholder="session / tx id"><label for="rdInferenceModel">${t.model}</label><input id="rdInferenceModel" type="text" maxlength="220" placeholder="model / task"><button id="rdRecordInference" type="button">${t.recordSpend}</button></div></div>
      <div id="rdLedgerRows" class="rd-ledger-rows"></div><div class="rd-ledger-actions"><button id="rdExportLedger" type="button">${t.exportProof}</button><button id="rdClearLedger" type="button" class="rd-ledger-danger">${t.clearLedger}</button></div>
    </article>
    <div class="rd-testnet-grid">
      <article class="rd-testnet-card"><h3>${t.spendTitle}</h3><p>${t.spendIntro}</p><label for="rdSpendAllocation">${t.allocation}</label><input id="rdSpendAllocation" type="number" min="0" step="1" value="1000"><label for="rdSpendAmount">${t.spent}</label><input id="rdSpendAmount" type="number" min="0" step="0.0001" value="0"><div id="rdSpendResult" class="rd-testnet-result"><b><span id="rdSpendUnlocked">0</span> FLOP</b><small>${t.unlocked} · ${t.locked}: <span id="rdSpendLocked">0</span> · ${t.required}: <span id="rdSpendRequired">0</span></small></div></article>
      <article class="rd-testnet-card"><h3>${t.minerTitle}</h3><p>${t.minerIntro}</p><div class="rd-testnet-minirow"><div><label for="rdMinerCount">${t.gpuCount}</label><input id="rdMinerCount" type="number" min="1" step="1" value="1"></div><div><label for="rdMinerVram">${t.vram}</label><input id="rdMinerVram" type="number" min="0" step="1" value="16"></div></div><div id="rdMinerResult" class="rd-testnet-result"><b></b><small></small></div></article>
      <article class="rd-testnet-card"><h3>${t.validatorTitle}</h3><p>${t.validatorIntro}</p><div class="rd-testnet-minirow"><div><label for="rdValCores">${t.cores}</label><input id="rdValCores" type="number" min="0" value="8"></div><div><label for="rdValRam">${t.ram}</label><input id="rdValRam" type="number" min="0" value="64"></div><div><label for="rdValDisk">${t.disk}</label><input id="rdValDisk" type="number" min="0" step="0.1" value="2"></div><div><label for="rdValNet">${t.net}</label><input id="rdValNet" type="number" min="0" step="0.1" value="1"></div></div><div class="rd-testnet-checks"><div id="rdCheckCores" class="rd-testnet-check"><i></i><span>CPU</span><small></small></div><div id="rdCheckRam" class="rd-testnet-check"><i></i><span>RAM</span><small></small></div><div id="rdCheckDisk" class="rd-testnet-check"><i></i><span>NVMe</span><small></small></div><div id="rdCheckNet" class="rd-testnet-check"><i></i><span>Network</span><small></small></div></div><div id="rdValidatorResult" class="rd-testnet-result"><b></b><small></small></div></article>
    </div>
    <div class="rd-testnet-plan"><div class="rd-testnet-step"><b>${t.plan1}</b><span>${t.plan1d}</span></div><div class="rd-testnet-step"><b>${t.plan2}</b><span>${t.plan2d}</span></div><div class="rd-testnet-step"><b>${t.plan3}</b><span>${t.plan3d}</span></div><div class="rd-testnet-step"><b>${t.plan4}</b><span>${t.plan4d}</span></div></div>
    <div class="rd-testnet-note">${t.redDid}: <code>${RD_TESTNET_DID}</code><br>${t.source} <a href="${RD_TESTNET_STATUS.source}" target="_blank" rel="noopener noreferrer">Official FLOP Testnet status</a></div>
  </div>`;
  anchor.insertAdjacentElement("afterend",sec);
  ["rdSpendAllocation","rdSpendAmount"].forEach(id=>document.getElementById(id)?.addEventListener("input",rdSpendCalc));["rdMinerCount","rdMinerVram"].forEach(id=>document.getElementById(id)?.addEventListener("input",rdMinerCalc));["rdValCores","rdValRam","rdValDisk","rdValNet"].forEach(id=>document.getElementById(id)?.addEventListener("input",rdValidatorCalc));
  document.getElementById("rdRecordFaucet")?.addEventListener("click",()=>rdLedgerRecord("faucet"));document.getElementById("rdRecordInference")?.addEventListener("click",()=>rdLedgerRecord("inference"));document.getElementById("rdExportLedger")?.addEventListener("click",rdLedgerExport);document.getElementById("rdClearLedger")?.addEventListener("click",rdLedgerClear);
  rdSpendCalc();rdMinerCalc();rdValidatorCalc();rdLedgerRender();return true;
}
function rdTestnetStart(){if(!rdTestnetBuild())setTimeout(rdTestnetStart,300);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",rdTestnetStart,{once:true});else rdTestnetStart();
