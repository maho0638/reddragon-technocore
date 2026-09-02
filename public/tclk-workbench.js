const RD_TCLK_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const RD_TCLK_PROOF_ROOM = "d-reddragon-lab";
const RD_TCLK_MARKER = "REDDRAGON_TCLK_DEMO_V1";
const RD_TCLK_PREFIX = "tclk1 ";
const RD_TCLK_REFRESH_MS = 60_000;

function rdTclkLang(){
  try{const v=localStorage.getItem("reddragon-lang");if(v==="tr"||v==="en")return v;}catch{}
  return String(navigator.language||"").toLowerCase().startsWith("tr")?"tr":"en";
}

const rdTclkCopy={
  tr:{
    kicker:"TCLK / AGENT-TO-AGENT KANIT",
    title:"RedDragon TCLK PAPER Workbench",
    intro:"Aynı RedDragon DID'nin payer olduğu doğrulanabilir agent-to-agent prova zincirini gösterir: offer → accept → lock → reveal → signed receipt.",
    badge:"PAPER · gerçek değer taşımaz",
    waiting:"Demo kanıtı bekleniyor",
    verified:"TCLK demo zinciri doğrulandı",
    partial:"Demo bulundu; bazı public kayıtlar şu anda okunamadı",
    payer:"Payer DID",payee:"Demo payee DID",contract:"Contract",room:"Deal room",
    offer:"Offer",accept:"Accept",lock:"Lock",reveal:"Reveal",receipt:"Receipt",
    missing:"bekleniyor",refresh:"Zinciri yenile",
    transcript:"İmzalı public transcript",
    transcriptIntro:"Uzaktaki mesajlar yalnızca veri olarak gösterilir; komut olarak çalıştırılmaz.",
    noTranscript:"Henüz transcript yok.",proof:"RedDragon proof marker",
    paperNote:"PAPER rail yalnızca protokol koreografisini prova eder; para/token tutmaz veya transfer etmez.",
    demoIdentity:"İkinci DID kasıtlı olarak public/deterministic PAPER demo kimliğidir; değer taşımak için kullanılmaz.",
    source:"Protokol: FLOP Labs tclk/1. RedDragon community-built bir araçtır; resmî FLOP Labs arayüzü değildir."
  },
  en:{
    kicker:"TCLK / AGENT-TO-AGENT PROOF",
    title:"RedDragon TCLK PAPER Workbench",
    intro:"Shows a verifiable agent-to-agent rehearsal where the same RedDragon DID is the payer: offer → accept → lock → reveal → signed receipt.",
    badge:"PAPER · carries no real value",
    waiting:"Waiting for demo proof",verified:"TCLK demo chain verified",
    partial:"Demo found; some public records are temporarily unavailable",
    payer:"Payer DID",payee:"Demo payee DID",contract:"Contract",room:"Deal room",
    offer:"Offer",accept:"Accept",lock:"Lock",reveal:"Reveal",receipt:"Receipt",
    missing:"waiting",refresh:"Refresh chain",transcript:"Signed public transcript",
    transcriptIntro:"Remote messages are rendered only as data and are never executed as instructions.",
    noTranscript:"No transcript yet.",proof:"RedDragon proof marker",
    paperNote:"The PAPER rail only rehearses protocol choreography; it holds or transfers no money/token.",
    demoIdentity:"The second DID is intentionally a public/deterministic PAPER demo identity and must never hold value.",
    source:"Protocol: FLOP Labs tclk/1. RedDragon is community-built and is not an official FLOP Labs interface."
  }
};
const rdTclkT=()=>rdTclkCopy[rdTclkLang()];
let rdTclkBusy=false;
let rdTclkTimer=null;

async function rdTclkRelay(body,timeoutMs=18_000){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch("/api/relay",{method:"POST",headers:{"content-type":"application/json",accept:"application/json,text/plain"},body:JSON.stringify(body),cache:"no-store",signal:controller.signal});
    const text=await response.text();
    if(!response.ok){const e=new Error(`HTTP ${response.status}: ${text.slice(0,160)}`);e.status=response.status;throw e;}
    try{return JSON.parse(text);}catch{return text;}
  }finally{clearTimeout(timeout);}
}
function rdTclkMessages(data){if(Array.isArray(data))return data;if(Array.isArray(data?.messages))return data.messages;if(Array.isArray(data?.items))return data.items;return[];}
function rdTclkDid(m){const f=String(m?.from||"");return String(m?.did||(f.startsWith("did:key:")?f:""));}
function rdTclkText(m){return String(m?.text??m?.message??m?.body??"");}
function rdTclkSeq(m){return Number(m?.seq||0)||0;}
function rdTclkShort(v){const s=String(v||"");return s.length>34?`${s.slice(0,20)}…${s.slice(-10)}`:(s||"—");}
function rdTclkParseMarker(text){
  const src=String(text||"");if(!src.includes(RD_TCLK_MARKER))return null;
  const out={};for(const token of src.split(/\s+/)){const i=token.indexOf("=");if(i>0)out[token.slice(0,i)]=token.slice(i+1);}
  if(!/^0x[0-9a-f]{64}$/.test(out.contract||""))return null;
  if(!/^0x[0-9a-f]{64}$/.test(out.offer_id||""))return null;
  if(!/^mb-p-tclk-[0-9a-f]{16}$/.test(out.deal_room||""))return null;
  return out;
}
function rdTclkFrame(m){const text=rdTclkText(m);if(!text.startsWith(RD_TCLK_PREFIX))return null;try{const f=JSON.parse(text.slice(RD_TCLK_PREFIX.length));return f&&typeof f==="object"?f:null;}catch{return null;}}
function rdTclkSetStage(id,ok,detail){const row=document.getElementById(id);if(!row)return;row.dataset.state=ok?"ok":"wait";row.querySelector("small").textContent=detail;}
function rdTclkBuild(){
  if(document.getElementById("rdTclkWorkbench"))return true;
  const anchor=document.getElementById("testnet-toolkit")||document.getElementById("did-provenance")||document.getElementById("live-observatory");if(!anchor)return false;
  const t=rdTclkT();const sec=document.createElement("section");sec.id="tclk-workbench";sec.className="rd-tclk-section";
  sec.innerHTML=`<div id="rdTclkWorkbench" class="rd-tclk-shell">
    <div class="rd-tclk-head"><div><span class="rd-tclk-kicker">${t.kicker}</span><h2>${t.title}</h2><p>${t.intro}</p></div><span class="rd-tclk-badge">${t.badge}</span></div>
    <div class="rd-tclk-summary"><div><b id="rdTclkStatus">${t.waiting}</b><small id="rdTclkStatusDetail">${RD_TCLK_PROOF_ROOM}</small></div><button id="rdTclkRefresh" type="button">${t.refresh}</button></div>
    <div class="rd-tclk-grid">
      <article class="rd-tclk-card"><h3>tclk/1 · PAPER</h3><div class="rd-tclk-stages">
        <div id="rdTclkOffer" class="rd-tclk-stage" data-state="wait"><i></i><span>${t.offer}</span><small>${t.missing}</small></div>
        <div id="rdTclkAccept" class="rd-tclk-stage" data-state="wait"><i></i><span>${t.accept}</span><small>${t.missing}</small></div>
        <div id="rdTclkLock" class="rd-tclk-stage" data-state="wait"><i></i><span>${t.lock}</span><small>${t.missing}</small></div>
        <div id="rdTclkReveal" class="rd-tclk-stage" data-state="wait"><i></i><span>${t.reveal}</span><small>${t.missing}</small></div>
        <div id="rdTclkReceipt" class="rd-tclk-stage" data-state="wait"><i></i><span>${t.receipt}</span><small>${t.missing}</small></div>
      </div><div class="rd-tclk-kv"><span>${t.payer}</span><code id="rdTclkPayer">${RD_TCLK_DID}</code><span>${t.payee}</span><code id="rdTclkPayee">—</code><span>${t.contract}</span><code id="rdTclkContract">—</code><span>${t.room}</span><code id="rdTclkRoom">—</code></div><p class="rd-tclk-warning">${t.paperNote}</p><p class="rd-tclk-muted">${t.demoIdentity}</p></article>
      <article class="rd-tclk-card"><h3>${t.transcript}</h3><p>${t.transcriptIntro}</p><div id="rdTclkTranscript" class="rd-tclk-transcript"><div class="rd-tclk-empty">${t.noTranscript}</div></div></article>
    </div><div class="rd-tclk-proof"><b>${t.proof}</b><code id="rdTclkProof">—</code></div><div class="rd-tclk-note">${t.source}</div>
  </div>`;
  anchor.insertAdjacentElement("afterend",sec);document.getElementById("rdTclkRefresh")?.addEventListener("click",rdTclkRefresh);return true;
}
function rdTclkRenderTranscript(messages){
  const host=document.getElementById("rdTclkTranscript");if(!host)return;host.textContent="";const t=rdTclkT();
  if(!messages.length){const e=document.createElement("div");e.className="rd-tclk-empty";e.textContent=t.noTranscript;host.appendChild(e);return;}
  for(const m of messages.sort((a,b)=>rdTclkSeq(a)-rdTclkSeq(b))){const frame=rdTclkFrame(m);if(!frame)continue;const row=document.createElement("div");row.className="rd-tclk-line";const top=document.createElement("div");const type=document.createElement("b");type.textContent=String(frame.type||"frame").toUpperCase();const meta=document.createElement("span");meta.textContent=`SIGNED · seq ${rdTclkSeq(m)||"—"} · ${rdTclkShort(rdTclkDid(m))}`;top.append(type,meta);const code=document.createElement("code");code.textContent=rdTclkText(m);row.append(top,code);host.appendChild(row);}
}
async function rdTclkRefresh(){
  if(rdTclkBusy)return;rdTclkBusy=true;const button=document.getElementById("rdTclkRefresh");if(button)button.disabled=true;const t=rdTclkT();
  try{
    const proofData=await rdTclkRelay({action:"read",room:RD_TCLK_PROOF_ROOM});const proofMsg=rdTclkMessages(proofData).filter(m=>rdTclkDid(m)===RD_TCLK_DID&&rdTclkText(m).includes(RD_TCLK_MARKER)).sort((a,b)=>rdTclkSeq(b)-rdTclkSeq(a))[0];
    const marker=rdTclkParseMarker(rdTclkText(proofMsg));if(!marker){document.getElementById("rdTclkStatus").textContent=t.waiting;return;}
    document.getElementById("rdTclkPayer").textContent=marker.payer||RD_TCLK_DID;document.getElementById("rdTclkPayee").textContent=marker.payee||"—";document.getElementById("rdTclkContract").textContent=marker.contract;document.getElementById("rdTclkRoom").textContent=marker.deal_room;document.getElementById("rdTclkProof").textContent=rdTclkText(proofMsg);
    const [boardResult,dealResult]=await Promise.allSettled([rdTclkRelay({action:"tclkFind",offerId:marker.offer_id,contract:marker.contract}),rdTclkRelay({action:"read",room:marker.deal_room})]);
    const board=boardResult.status==="fulfilled"?rdTclkMessages(boardResult.value):[];const dealMsgs=dealResult.status==="fulfilled"?rdTclkMessages(dealResult.value):[];
    const offerMsg=board.find(m=>rdTclkFrame(m)?.type==="offer"&&rdTclkFrame(m)?.id===marker.offer_id);const acceptMsg=board.find(m=>rdTclkFrame(m)?.type==="accept"&&rdTclkFrame(m)?.contract===marker.contract);
    const lockMsg=dealMsgs.find(m=>rdTclkFrame(m)?.type==="lock"&&rdTclkFrame(m)?.contract===marker.contract);const revealMsg=dealMsgs.find(m=>rdTclkFrame(m)?.type==="reveal"&&rdTclkFrame(m)?.contract===marker.contract);const receiptMsg=dealMsgs.find(m=>rdTclkFrame(m)?.type==="receipt"&&rdTclkFrame(m)?.contract===marker.contract&&rdTclkFrame(m)?.outcome==="claimed");
    rdTclkSetStage("rdTclkOffer",Boolean(offerMsg),offerMsg?`seq ${rdTclkSeq(offerMsg)}`:t.missing);rdTclkSetStage("rdTclkAccept",Boolean(acceptMsg),acceptMsg?`seq ${rdTclkSeq(acceptMsg)}`:t.missing);rdTclkSetStage("rdTclkLock",Boolean(lockMsg),lockMsg?`seq ${rdTclkSeq(lockMsg)}`:t.missing);rdTclkSetStage("rdTclkReveal",Boolean(revealMsg),revealMsg?`seq ${rdTclkSeq(revealMsg)}`:t.missing);rdTclkSetStage("rdTclkReceipt",Boolean(receiptMsg),receiptMsg?`seq ${rdTclkSeq(receiptMsg)}`:t.missing);
    const all=Boolean(offerMsg&&acceptMsg&&lockMsg&&revealMsg&&receiptMsg);document.getElementById("rdTclkStatus").textContent=all?t.verified:t.partial;document.getElementById("rdTclkStatusDetail").textContent=`${marker.contract.slice(0,18)}… · PAPER`;
    rdTclkRenderTranscript([offerMsg,acceptMsg,lockMsg,revealMsg,receiptMsg].filter(Boolean));
  }catch{document.getElementById("rdTclkStatus").textContent=t.partial;}finally{rdTclkBusy=false;if(button)button.disabled=false;}
}
function rdTclkStart(){if(!rdTclkBuild()){setTimeout(rdTclkStart,300);return;}rdTclkRefresh();if(rdTclkTimer)clearInterval(rdTclkTimer);rdTclkTimer=setInterval(()=>{if(document.visibilityState==="visible")rdTclkRefresh();},RD_TCLK_REFRESH_MS);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",rdTclkStart,{once:true});else rdTclkStart();
