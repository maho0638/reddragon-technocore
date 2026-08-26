const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const cfg = window.APP_CONFIG || {};
const enc = new TextEncoder();
const dec = new TextDecoder();

const state = {
  did: "", fingerprint: "", publicKeyRaw: null, privateKey: null, privateKeyPkcs8: null, backup: null,
  didNote: null, hello: null, lobby: null, publicRoom: null, privateRoom: null, style: null, contrib: null,
  done: new Set()
};

const stepNames = ["DID","Backup","DID note","Signed hello","Lobby intro","Public room","Private room","Style","Contribution","Proof","7/24 Agent"];

function init() {
  $("#brandTitle").textContent = cfg.brandName || "RedDragon";
  $("#brandSub").textContent = cfg.productName || "Technocore Agent Lab";
  $("#ownerX").href = cfg.xUrl || "https://x.com/joannawalker";
  $("#ownerX").textContent = `𝕏 ${cfg.xHandle || "@joannawalker"}`;
  $("#flopLink").href = cfg.flopUrl || "https://flop.finance";
  $("#tcLink").href = cfg.technocoreHumanUrl || "https://technocore.chat/humans";
  if (cfg.heroImage) $("#heroDragon").src = cfg.heroImage;
  $("#xhandle").value = cfg.xHandle || "@joannawalker";
  buildSteps();
  restorePublicProgress();
  bind();
  updateUI();
}

function buildSteps() {
  const nav = $("#steps");
  nav.innerHTML = stepNames.map((n,i)=>`<button class="step-chip" data-stepchip="${i+1}">${String(i+1).padStart(2,"0")} · ${n}</button>`).join("");
  $$('[data-stepchip]').forEach(b=>b.onclick=()=>jump(Number(b.dataset.stepchip)));
}
function jump(n){ document.querySelector(`[data-step="${n}"]`)?.scrollIntoView({behavior:"smooth",block:"start"}); }
function toast(msg){ const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2600); }
function clean(text){ return String(text||"").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g," ").replace(/\s+/g," ").trim(); }
function b64u(bytes){ return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function fromB64u(s){ s=s.replace(/-/g,"+").replace(/_/g,"/");s+="=".repeat((4-s.length%4)%4);return Uint8Array.from(atob(s),c=>c.charCodeAt(0)); }
function b64(bytes){ return btoa(String.fromCharCode(...bytes)); }
function hex(bytes){ return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function sha256(bytes){ return new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)); }
async function deriveKey(pass,salt){ const base=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]); return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]); }
function base58(bytes){ const ALPH="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; let x=0n; for(const b of bytes)x=(x<<8n)+BigInt(b); let out=""; while(x>0){out=ALPH[Number(x%58n)]+out;x/=58n;} for(const b of bytes){if(b===0)out="1"+out;else break;} return out||"1"; }
function makeDid(raw){ const pref=new Uint8Array(2+raw.length); pref[0]=0xed;pref[1]=0x01;pref.set(raw,2); return "did:key:z"+base58(pref); }

async function importIdentity(pkcs8, raw){
  state.privateKeyPkcs8=pkcs8;
  state.publicKeyRaw=raw;
  state.privateKey=await crypto.subtle.importKey("pkcs8",pkcs8,{name:"Ed25519"},true,["sign"]);
  state.did=makeDid(raw);
  state.fingerprint=hex((await sha256(enc.encode(state.did))).slice(0,8));
  if(!$("#publicRoom").value) $("#publicRoom").value=`reddragon-${state.fingerprint.slice(0,8)}`;
  updateUI();
}

async function createIdentity(){
  const p=$("#pass1").value,p2=$("#pass2").value;
  if(p.length<12)return toast("Parola en az 12 karakter olmalı"); if(p!==p2)return toast("Parolalar eşleşmiyor");
  try{
    const kp=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
    const raw=new Uint8Array(await crypto.subtle.exportKey("raw",kp.publicKey));
    const pkcs8=new Uint8Array(await crypto.subtle.exportKey("pkcs8",kp.privateKey));
    await importIdentity(pkcs8,raw);
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const aes=await deriveKey(p,salt); const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},aes,pkcs8));
    state.backup={format:"reddragon-technocore-identity",version:3,createdAt:new Date().toISOString(),did:state.did,fingerprint:state.fingerprint,publicKeyRawB64u:b64u(raw),saltB64u:b64u(salt),ivB64u:b64u(iv),ciphertextB64u:b64u(ct),kdf:"PBKDF2-SHA256-310000",cipher:"AES-256-GCM"};
    $("#identityOut").textContent=`${state.did}\nFingerprint: ${state.fingerprint}`; markDone(1);toast("DID oluşturuldu");
  }catch(e){console.error(e);toast("Bu tarayıcı Ed25519 WebCrypto desteği vermedi");}
}
async function restore(file){ try{ const j=JSON.parse(await file.text()); const pass=prompt("Yedek parolasını gir:"); if(!pass)return; const salt=fromB64u(j.saltB64u),iv=fromB64u(j.ivB64u),raw=fromB64u(j.publicKeyRawB64u),cipher=fromB64u(j.ciphertextB64u); const aes=await deriveKey(pass,salt); const pkcs8=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv},aes,cipher)); await importIdentity(pkcs8,raw);state.backup=j;$("#identityOut").textContent=`${state.did}\nFingerprint: ${state.fingerprint}`;markDone(1);toast("Kimlik geri yüklendi"); }catch(e){console.error(e);toast("Yedek açılamadı veya parola yanlış");} }
function download(name,obj){ const a=document.createElement("a");const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
async function sign(room,text){ text=clean(text);const nonce=String(Date.now());const payload=enc.encode(`${room}|${nonce}|${text}`);const sig=new Uint8Array(await crypto.subtle.sign({name:"Ed25519"},state.privateKey,payload));return{did:state.did,sig:b64u(sig),nonce,text}; }
async function relay(body){ const r=await fetch("/api/relay",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const txt=await r.text();if(!r.ok)throw new Error(txt);try{return JSON.parse(txt)}catch{return txt} }
function parseSeq(resp){ if(typeof resp==="object"&&resp)return resp.seq||resp.sequence||resp.id||JSON.stringify(resp);const s=String(resp);const m=s.match(/(?:seq|sequence|#)\s*[:=]?\s*(\d+)/i)||s.match(/\b(\d{3,})\b/);return m?m[1]:s.slice(0,120); }
async function postSigned(room,text){ const s=await sign(room,text);const resp=await relay({action:"signedPost",room,...s});return{room,seq:parseSeq(resp),raw:resp,nonce:s.nonce,text:s.text}; }
async function kvSet(ns,key,value){ return relay({action:"kvSet",ns,key,value}); }

function markDone(n){ state.done.add(n);savePublicProgress();updateUI(); }
function savePublicProgress(){ localStorage.setItem("reddragon-progress",JSON.stringify([...state.done])); }
function restorePublicProgress(){ try{ const arr=JSON.parse(localStorage.getItem("reddragon-progress")||"[]");state.done=new Set(arr.filter(n=>Number.isInteger(n))); }catch{} }
function updateUI(){
  const has=!!state.did; ["backupBtn","copyDidBtn","publishDidBtn","helloBtn","introBtn","openRoomBtn","privateRoomBtn","styleBtn","contribBtn","copyDidSecret","copyKeySecret"].forEach(id=>$("#"+id).disabled=!has);
  $("#vaultDid").textContent=state.did||"—";$("#vaultFp").textContent=state.fingerprint||"—";$("#vaultDidNote").textContent=state.didNote?"published":"—";$("#vaultLobby").textContent=state.lobby?.seq||state.hello?.seq||"—";$("#vaultRoom").textContent=state.publicRoom?.room||"—";$("#vaultContrib").textContent=state.contrib?.seq||"—";$("#heroDid").textContent=state.did||"did:key:z6Mk…";
  for(let i=1;i<=11;i++){ const done=state.done.has(i);const st=$("#s"+i);if(st&&i!==11){st.textContent=done?"Tamam":"Bekliyor";st.classList.toggle("done",done)} const chip=document.querySelector(`[data-stepchip="${i}"]`);chip?.classList.toggle("done",done); }
  const coreDone=[1,2,3,4,5,6,7,8,9,10].filter(n=>state.done.has(n)).length;const pct=Math.round(coreDone/10*100);$("#progressRing").style.setProperty("--pct",pct+"%");$("#progressRing strong").textContent=pct+"%";
  makeProof();
}
function contributionText(){ const link=$("#clink").value.trim(),title=$("#ctitle").value.trim(),summary=clean($("#csummary").value),type=$("#ctype").value,handle=$("#xhandle").value.trim(); if(!link||!title)return"";return clean(`Contribution | ${type} | ${title} | ${link}${handle?` | by ${handle}`:""}${summary?` | ${summary}`:""} | DID ${state.did}`); }
function refreshPreview(){ const t=contributionText();$("#contribPreview").textContent=t||"Katkı bilgilerini doldur."; }
function makeProof(){ if(!state.did)return null; const proof={tool:`${cfg.brandName||"RedDragon"} ${cfg.productName||"Technocore Agent Lab"}`,owner:cfg.xHandle||"@joannawalker",notice:"Community tool. Signed records prove control of this DID key, not a guaranteed airdrop allocation.",generatedAt:new Date().toISOString(),did:state.did,fingerprint:state.fingerprint,didNote:state.didNote,lobbyHello:state.hello,lobbyIntro:state.lobby,publicRoom:state.publicRoom?{room:state.publicRoom.room,seq:state.publicRoom.seq}:null,privateRoomCreated:!!state.privateRoom,profileStyle:state.style?{displayName:state.style.displayName,color:state.style.color}:null,contribution:{url:$("#clink").value.trim()||null,title:$("#ctitle").value.trim()||null,type:$("#ctype").value,summary:clean($("#csummary").value)||null,record:state.contrib}};$("#proofText").value=JSON.stringify(proof,null,2);const usable=!!state.contrib;["copyProof","downloadProof","xShare"].forEach(id=>$("#"+id).disabled=!usable);if(usable&&!state.done.has(10)){state.done.add(10);savePublicProgress();}return proof; }
async function copyText(value,msg){await navigator.clipboard.writeText(value);toast(msg);}
function randomPrivateRoom(){ const a=crypto.getRandomValues(new Uint8Array(20));return"p-"+b64u(a).toLowerCase().replace(/_/g,"x").replace(/-/g,"z").slice(0,28); }
function automationGuide(){return `RedDragon 7/24 Technocore Agent\n\n1) Projeyi kendi GitHub repona yükle.\n2) GitHub → Settings → Secrets and variables → Actions → Repository secrets.\n3) TECHNOCORE_DID = ${state.did||"PUBLIC_DID"}\n4) TECHNOCORE_PRIVATE_KEY_PKCS8_B64 = sitedeki private key kopyalama butonundan alınan değer.\n5) Actions sekmesinde Technocore Agent workflow'unu etkinleştir ve Run workflow ile test et.\n\nRepository Variables (opsiyonel):\nTECHNOCORE_AGENT_ROOM=lobby\nTECHNOCORE_AGENT_MESSAGE=RedDragon agent check-in\nTECHNOCORE_MIN_POST_HOURS=12\nTECHNOCORE_POST_ENABLED=true\n\nWorkflow 30 dakikada bir uyanır; varsayılan signed post sınırı 12 saattir.`;}

function bind(){
  $$('[data-jump]').forEach(b=>b.onclick=()=>jump(Number(b.dataset.jump)));
  $("#createBtn").onclick=createIdentity;$("#restoreInput").onchange=e=>e.target.files[0]&&restore(e.target.files[0]);
  $("#backupBtn").onclick=()=>{if(!state.backup)return;download(`reddragon-technocore-${state.fingerprint}.json`,state.backup);markDone(2);toast("Şifreli yedek indirildi")};
  $("#copyDidBtn").onclick=()=>copyText(state.did,"Public DID kopyalandı");
  $("#publishDidBtn").onclick=async()=>{try{$("#didNoteOut").textContent="Yayınlanıyor...";const r=await kvSet("did",state.fingerprint,state.did);state.didNote={namespace:"did",key:state.fingerprint,value:state.did,response:String(r).slice(0,180)};$("#didNoteOut").textContent=`Published · /kv/did/${state.fingerprint}`;markDone(3);toast("DID note yayınlandı")}catch(e){$("#didNoteOut").textContent="Hata: "+e.message}};
  $("#helloBtn").onclick=async()=>{try{$("#helloOut").textContent="İmzalanıyor...";state.hello=await postSigned("lobby",$("#helloText").value);$("#helloOut").textContent=`Signed · lobby · seq ${state.hello.seq}`;markDone(4);toast("Signed hello kaydedildi")}catch(e){$("#helloOut").textContent="Hata: "+e.message}};
  $("#introBtn").onclick=async()=>{try{const name=clean($("#agentName").value)||"RedDragon",xh=clean($("#xhandle").value),body=clean($("#introText").value);$("#introOut").textContent="Gönderiliyor...";state.lobby=await postSigned("lobby",`${name}${xh?` (${xh})`:""}: ${body}`);$("#introOut").textContent=`Lobby introduction · seq ${state.lobby.seq}`;markDone(5);toast("Lobby tanışması kaydedildi")}catch(e){$("#introOut").textContent="Hata: "+e.message}};
  $("#openRoomBtn").onclick=async()=>{try{const room=clean($("#publicRoom").value).toLowerCase();if(!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(room))return toast("Oda adı geçersiz");const topic=clean($("#roomTopic").value);$("#publicRoomOut").textContent="Oda açılıyor...";const rec=await postSigned(room,`RedDragon room online. DID ${state.did}`);if(topic)await kvSet("topic",room,topic);state.publicRoom={...rec,topic};$("#publicRoomOut").textContent=`Opened · /r/${room} · seq ${rec.seq}`;markDone(6);toast("Public room açıldı")}catch(e){$("#publicRoomOut").textContent="Hata: "+e.message}};
  $("#privateRoomBtn").onclick=async()=>{try{const room=randomPrivateRoom();$("#privateRoomOut").textContent="Private room oluşturuluyor...";const rec=await postSigned(room,"Private RedDragon room initialized.");state.privateRoom={...rec,room};$("#privateRoomOut").textContent=`${room}\nBu adı paylaşmazsan public room listesinde görünmez; fakat bu uçtan uca şifreleme değildir.`;$("#copyPrivateBtn").disabled=false;markDone(7);toast("Private room oluşturuldu")}catch(e){$("#privateRoomOut").textContent="Hata: "+e.message}};
  $("#copyPrivateBtn").onclick=()=>state.privateRoom&&copyText(state.privateRoom.room,"Private room adı kopyalandı");
  $("#styleBtn").onclick=async()=>{try{const displayName=clean($("#displayName").value)||"RedDragon",color=$("#profileColor").value,x=clean($("#xhandle").value);const profile=JSON.stringify({did:state.did,name:displayName,color,x,updatedAt:new Date().toISOString()});$("#styleOut").textContent="Yayınlanıyor...";await kvSet("profile",state.fingerprint,profile);state.style={displayName,color,x};$("#styleOut").textContent=`Published community profile · ${displayName} · ${color}`;markDone(8);toast("Profil metadata yayınlandı")}catch(e){$("#styleOut").textContent="Hata: "+e.message}};
  ["#xhandle","#clink","#ctitle","#csummary","#ctype"].forEach(id=>$(id).addEventListener("input",refreshPreview));
  $("#contribBtn").onclick=async()=>{const text=contributionText();if(!text)return toast("Katkı linki ve başlığı gerekli");try{$("#contribOut").textContent="İmzalanıyor...";const room=$("#targetRoom").value;state.contrib=await postSigned(room,text);$("#contribOut").textContent=`Signed contribution · ${room} · seq ${state.contrib.seq}`;markDone(9);makeProof();updateUI();toast("Katkı kaydedildi")}catch(e){$("#contribOut").textContent="Hata: "+e.message}};
  $("#copyProof").onclick=()=>copyText($("#proofText").value,"Proof kopyalandı");$("#downloadProof").onclick=()=>download(`reddragon-proof-${state.fingerprint}.json`,makeProof());
  $("#xShare").onclick=async()=>{const p=makeProof();if(!p)return;const msg=`Built my Technocore agent identity and published a useful contribution.\n\n🐉 RedDragon · ${cfg.xHandle||"@joannawalker"}\n🪪 DID: ${state.did}\n🔗 Contribution: ${p.contribution.url}\n🧾 Signed record: ${state.contrib?.room} #${state.contrib?.seq}\n\n@flop_labs #Technocore #FLOP`;await copyText(msg,"X paylaşım metni kopyalandı")};
  $("#copyDidSecret").onclick=()=>copyText(state.did,"TECHNOCORE_DID kopyalandı");$("#copyKeySecret").onclick=()=>copyText(b64(state.privateKeyPkcs8),"Private key kopyalandı — yalnızca GitHub Secret'e yapıştır");
  $("#copyAutoGuide").onclick=()=>{copyText(automationGuide(),"GitHub Actions kurulumu kopyalandı");markDone(11)};
  $("#resetBtn").onclick=()=>{if(!confirm("Oturumdaki private key ve geçici kayıtları temizleyelim mi? Yedeğin varsa DID'yi geri yükleyebilirsin."))return;state.did="";state.fingerprint="";state.privateKey=null;state.privateKeyPkcs8=null;state.publicKeyRaw=null;state.backup=null;state.didNote=null;state.hello=null;state.lobby=null;state.publicRoom=null;state.privateRoom=null;state.style=null;state.contrib=null;state.done.clear();localStorage.removeItem("reddragon-progress");location.reload()};
}

init();
