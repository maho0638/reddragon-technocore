const RD_TESTNET_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";

function rdTestnetLang(){
  try{const v=localStorage.getItem("reddragon-lang");if(v==="tr"||v==="en")return v;}catch{}
  return String(navigator.language||"").toLowerCase().startsWith("tr")?"tr":"en";
}

const rdTestnetCopy={
  tr:{
    kicker:"FLOP TESTNET HAZIRLIK ARAÇLARI",
    title:"Testnet'e hazır mısın?",
    intro:"FLOP'un güncel taslak parametrelerini pratik kontrollere çevirir. Airdrop tahmini yapmaz; agent harcaması, miner donanımı ve validator hazırlığını ölçer.",
    badge:"taslak parametreler · garanti değil",
    spendTitle:"Agent spend-to-unlock hesaplayıcı",
    spendIntro:"Güncel taslakta agent airdropu başlangıçta kilitli; inference için harcanan her 3 FLOP, 1 airdrop FLOP'un kilidini açar.",
    allocation:"Varsayımsal airdrop miktarı",
    spent:"Inference için harcanan test FLOP",
    unlocked:"Kilidi açılabilecek",
    locked:"Kalan kilitli",
    required:"Tamamını açmak için gereken toplam spend",
    minerTitle:"Miner donanım kontrolü",
    minerIntro:"Resmî teaser şu an tek GPU veya GPU kümesini destekliyor ve GPU başına 16 GB+ VRAM öneriyor.",
    gpuCount:"GPU adedi",
    vram:"GPU başına VRAM (GB)",
    minerOk:"Önerilen VRAM eşiğini karşılıyor",
    minerBad:"Önerilen VRAM eşiğinin altında",
    minerNote:"Bu yalnızca güncel önerilen donanım kontrolüdür; mining ödülü veya kabul garantisi değildir.",
    validatorTitle:"Validator hazırlık kontrolü",
    validatorIntro:"Mevcut provisional öneri: 8+ CPU core, 64 GB RAM, 2 TB NVMe ve 1 Gbps redundant bağlantı.",
    cores:"CPU core",
    ram:"RAM (GB)",
    disk:"NVMe (TB)",
    net:"Bağlantı (Gbps)",
    validatorOk:"Güncel önerilen eşiği karşılıyor",
    validatorBad:"Bazı önerilen eşikler eksik",
    plan1:"1 · Aynı DID'yi koru",plan1d:"Technocore geçmişini ve katkı zincirini tek kimlikte sürdür.",
    plan2:"2 · Faucet açılınca claim",plan2d:"Test FLOP'u sadece toplama; testnet kullanımına hazır ol.",
    plan3:"3 · Inference harca",plan3d:"Agent airdrop ağırlığının büyük kısmı testnet inference spend'ine bağlanmış durumda.",
    plan4:"4 · Katkıyı kanıtla",plan4d:"Tool, connector ve diğer public katkıları aynı DID'nin signed manifest zincirine ekle.",
    source:"Kaynak: FLOP Network teaser v0.1. Parametreler taslak ve Yellow Paper kesinleşene kadar değişebilir.",
    redDid:"RedDragon aynı DID ile devam ediyor"
  },
  en:{
    kicker:"FLOP TESTNET READINESS TOOLS",
    title:"Are you testnet-ready?",
    intro:"Turns FLOP's current draft parameters into practical checks. It does not estimate an airdrop; it measures agent spend, miner hardware and validator readiness.",
    badge:"draft parameters · no guarantee",
    spendTitle:"Agent spend-to-unlock calculator",
    spendIntro:"Under the current draft, the agent airdrop starts locked; every 3 FLOP spent on inference unlocks 1 airdropped FLOP.",
    allocation:"Hypothetical airdrop amount",
    spent:"Test FLOP spent on inference",
    unlocked:"Potentially unlocked",
    locked:"Remaining locked",
    required:"Total spend required to unlock all",
    minerTitle:"Miner hardware check",
    minerIntro:"The official teaser currently supports a single GPU or a GPU cluster and recommends 16 GB+ VRAM per GPU.",
    gpuCount:"GPU count",
    vram:"VRAM per GPU (GB)",
    minerOk:"Meets the recommended VRAM threshold",
    minerBad:"Below the recommended VRAM threshold",
    minerNote:"This only checks the current recommended hardware; it does not guarantee mining rewards or acceptance.",
    validatorTitle:"Validator readiness check",
    validatorIntro:"Current provisional recommendation: 8+ CPU cores, 64 GB RAM, 2 TB NVMe and a 1 Gbps redundant connection.",
    cores:"CPU cores",
    ram:"RAM (GB)",
    disk:"NVMe (TB)",
    net:"Connection (Gbps)",
    validatorOk:"Meets the current recommended thresholds",
    validatorBad:"Some recommended thresholds are missing",
    plan1:"1 · Keep one DID",plan1d:"Preserve Technocore history and contribution proof under one identity.",
    plan2:"2 · Claim when faucet opens",plan2d:"Do not only collect test FLOP; be ready to use it on testnet.",
    plan3:"3 · Spend on inference",plan3d:"The current draft bases much of the agent airdrop on testnet inference spend.",
    plan4:"4 · Prove contributions",plan4d:"Bind tools, connectors and other public work to the same DID's signed manifest trail.",
    source:"Source: FLOP Network teaser v0.1. Parameters are draft and may change until the Yellow Paper is final.",
    redDid:"RedDragon continues with the same DID"
  }
};

const rdTT=()=>rdTestnetCopy[rdTestnetLang()];
const rdNum=(id)=>Math.max(0,Number(document.getElementById(id)?.value||0)||0);
const rdFmt=(n)=>Number.isFinite(n)?n.toLocaleString(rdTestnetLang()==="tr"?"tr-TR":"en-US",{maximumFractionDigits:2}):"0";

function rdSpendCalc(){
  const allocation=rdNum("rdSpendAllocation");
  const spent=rdNum("rdSpendAmount");
  const unlocked=Math.min(allocation,spent/3);
  const locked=Math.max(0,allocation-unlocked);
  const required=allocation*3;
  document.getElementById("rdSpendUnlocked").textContent=rdFmt(unlocked);
  document.getElementById("rdSpendLocked").textContent=rdFmt(locked);
  document.getElementById("rdSpendRequired").textContent=rdFmt(required);
  const box=document.getElementById("rdSpendResult");
  if(box)box.dataset.state=allocation>0&&locked===0?"ok":spent>0?"warn":"";
}

function rdMinerCalc(){
  const t=rdTT();
  const count=Math.max(1,Math.round(rdNum("rdMinerCount")||1));
  const vram=rdNum("rdMinerVram");
  const ok=vram>=16;
  const box=document.getElementById("rdMinerResult");
  if(!box)return;
  box.dataset.state=ok?"ok":"warn";
  box.querySelector("b").textContent=ok?t.minerOk:t.minerBad;
  box.querySelector("small").textContent=`${count} GPU · ${rdFmt(vram)} GB/GPU · ${rdFmt(count*vram)} GB total VRAM. ${t.minerNote}`;
}

function rdSetCheck(id,ok,value){
  const row=document.getElementById(id);if(!row)return;
  row.dataset.state=ok?"ok":"bad";
  row.querySelector("small").textContent=value;
}

function rdValidatorCalc(){
  const t=rdTT();
  const cores=rdNum("rdValCores"),ram=rdNum("rdValRam"),disk=rdNum("rdValDisk"),net=rdNum("rdValNet");
  const checks=[cores>=8,ram>=64,disk>=2,net>=1];
  rdSetCheck("rdCheckCores",checks[0],`${rdFmt(cores)} / 8+`);
  rdSetCheck("rdCheckRam",checks[1],`${rdFmt(ram)} / 64+ GB`);
  rdSetCheck("rdCheckDisk",checks[2],`${rdFmt(disk)} / 2+ TB`);
  rdSetCheck("rdCheckNet",checks[3],`${rdFmt(net)} / 1+ Gbps`);
  const box=document.getElementById("rdValidatorResult");if(!box)return;
  const ok=checks.every(Boolean);box.dataset.state=ok?"ok":"warn";
  box.querySelector("b").textContent=ok?t.validatorOk:t.validatorBad;
  box.querySelector("small").textContent=`${checks.filter(Boolean).length}/4`;
}

function rdTestnetBuild(){
  if(document.getElementById("rdTestnetToolkit"))return true;
  const anchor=document.getElementById("did-provenance")||document.getElementById("live-observatory");
  if(!anchor)return false;
  const t=rdTT();
  const sec=document.createElement("section");
  sec.id="testnet-toolkit";sec.className="rd-testnet-section";
  sec.innerHTML=`<div id="rdTestnetToolkit" class="rd-testnet-shell">
    <div class="rd-testnet-head"><div><span class="rd-testnet-kicker">${t.kicker}</span><h2>${t.title}</h2><p>${t.intro}</p></div><span class="rd-testnet-badge">${t.badge}</span></div>
    <div class="rd-testnet-grid">
      <article class="rd-testnet-card"><h3>${t.spendTitle}</h3><p>${t.spendIntro}</p><label for="rdSpendAllocation">${t.allocation}</label><input id="rdSpendAllocation" type="number" min="0" step="1" value="1000"><label for="rdSpendAmount">${t.spent}</label><input id="rdSpendAmount" type="number" min="0" step="1" value="0"><div id="rdSpendResult" class="rd-testnet-result"><b><span id="rdSpendUnlocked">0</span> FLOP</b><small>${t.unlocked} · ${t.locked}: <span id="rdSpendLocked">0</span> · ${t.required}: <span id="rdSpendRequired">0</span></small></div></article>
      <article class="rd-testnet-card"><h3>${t.minerTitle}</h3><p>${t.minerIntro}</p><div class="rd-testnet-minirow"><div><label for="rdMinerCount">${t.gpuCount}</label><input id="rdMinerCount" type="number" min="1" step="1" value="1"></div><div><label for="rdMinerVram">${t.vram}</label><input id="rdMinerVram" type="number" min="0" step="1" value="16"></div></div><div id="rdMinerResult" class="rd-testnet-result"><b></b><small></small></div></article>
      <article class="rd-testnet-card"><h3>${t.validatorTitle}</h3><p>${t.validatorIntro}</p><div class="rd-testnet-minirow"><div><label for="rdValCores">${t.cores}</label><input id="rdValCores" type="number" min="0" value="8"></div><div><label for="rdValRam">${t.ram}</label><input id="rdValRam" type="number" min="0" value="64"></div><div><label for="rdValDisk">${t.disk}</label><input id="rdValDisk" type="number" min="0" step="0.1" value="2"></div><div><label for="rdValNet">${t.net}</label><input id="rdValNet" type="number" min="0" step="0.1" value="1"></div></div><div class="rd-testnet-checks"><div id="rdCheckCores" class="rd-testnet-check"><i></i><span>CPU</span><small></small></div><div id="rdCheckRam" class="rd-testnet-check"><i></i><span>RAM</span><small></small></div><div id="rdCheckDisk" class="rd-testnet-check"><i></i><span>NVMe</span><small></small></div><div id="rdCheckNet" class="rd-testnet-check"><i></i><span>Network</span><small></small></div></div><div id="rdValidatorResult" class="rd-testnet-result"><b></b><small></small></div></article>
    </div>
    <div class="rd-testnet-plan"><div class="rd-testnet-step"><b>${t.plan1}</b><span>${t.plan1d}</span></div><div class="rd-testnet-step"><b>${t.plan2}</b><span>${t.plan2d}</span></div><div class="rd-testnet-step"><b>${t.plan3}</b><span>${t.plan3d}</span></div><div class="rd-testnet-step"><b>${t.plan4}</b><span>${t.plan4d}</span></div></div>
    <div class="rd-testnet-note">${t.redDid}: <code>${RD_TESTNET_DID}</code><br>${t.source} <a href="https://flop.finance/teaser/" target="_blank" rel="noopener noreferrer">flop.finance/teaser</a></div>
  </div>`;
  anchor.insertAdjacentElement("afterend",sec);
  ["rdSpendAllocation","rdSpendAmount"].forEach(id=>document.getElementById(id)?.addEventListener("input",rdSpendCalc));
  ["rdMinerCount","rdMinerVram"].forEach(id=>document.getElementById(id)?.addEventListener("input",rdMinerCalc));
  ["rdValCores","rdValRam","rdValDisk","rdValNet"].forEach(id=>document.getElementById(id)?.addEventListener("input",rdValidatorCalc));
  rdSpendCalc();rdMinerCalc();rdValidatorCalc();
  return true;
}

function rdTestnetStart(){if(!rdTestnetBuild())setTimeout(rdTestnetStart,300);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",rdTestnetStart,{once:true});else rdTestnetStart();
