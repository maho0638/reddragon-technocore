import {
  createPrivateKey, createPublicKey, sign as nodeSign, createHash,
  diffieHellman, hkdfSync, createDecipheriv
} from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE="https://technocore.chat";
const ROOM="close1";
const STATE_ROOM="mb-reddragon-agent";
const SEASON="close-1";
const MARKER="REDDRAGON_CLOSE1_TRADER_V3";
const LOCK_MS=Date.parse("2026-10-04T09:00:00Z");
const EXPECTED_DID="did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const keyB64=String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64||"").trim();
const execute=String(process.env.CLOSE1_EXECUTE||"false").toLowerCase()==="true";
if(!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");

function base58(bytes){
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x=0n; for(const b of bytes) x=(x<<8n)+BigInt(b);
  let out=""; while(x>0n){out=alphabet[Number(x%58n)]+out;x/=58n;}
  for(const b of bytes){if(b===0)out="1"+out;else break;}
  return out||"1";
}
function deriveDid(key){
  const spki=createPublicKey(key).export({format:"der",type:"spki"});
  const raw=spki.subarray(spki.length-32);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0xed,0x01]),raw]))}`;
}
const privateKey=createPrivateKey({key:Buffer.from(keyB64,"base64"),format:"der",type:"pkcs8"});
const did=deriveDid(privateKey);
if(did!==EXPECTED_DID) throw new Error("Private key does not match RedDragon DID");

function b64u(s){return Buffer.from(s,"base64url");}
async function loadDecisionFunction(){
  const blob=JSON.parse(await readFile(new URL("./close1-strategy.enc.json",import.meta.url),"utf8"));
  if(blob.v!==1) throw new Error("Unsupported encrypted strategy version");
  const jwk=privateKey.export({format:"jwk"});
  const seed=Buffer.from(jwk.d,"base64url");
  const h=createHash("sha512").update(seed).digest();
  const scalar=Buffer.from(h.subarray(0,32));
  scalar[0]&=248; scalar[31]&=127; scalar[31]|=64;
  const xPrivDer=Buffer.concat([Buffer.from("302e020100300506032b656e04220420","hex"),scalar]);
  const xPriv=createPrivateKey({key:xPrivDer,format:"der",type:"pkcs8"});
  const xPubDer=Buffer.concat([Buffer.from("302a300506032b656e032100","hex"),b64u(blob.epk)]);
  const ephPub=createPublicKey({key:xPubDer,format:"der",type:"spki"});
  const shared=diffieHellman({privateKey:xPriv,publicKey:ephPub});
  const key=Buffer.from(hkdfSync("sha256",shared,Buffer.from("reddragon-close1-strategy-v1"),Buffer.from("close1-strategy-js"),32));
  const all=b64u(blob.ct), tag=all.subarray(all.length-16), ciphertext=all.subarray(0,all.length-16);
  const dec=createDecipheriv("aes-256-gcm",key,b64u(blob.nonce));
  dec.setAAD(Buffer.from("close1-strategy-v1"));
  dec.setAuthTag(tag);
  const source=Buffer.concat([dec.update(ciphertext),dec.final()]).toString("utf8");
  return new Function("ctx",source+"\nreturn decide(ctx);");
}
const decide=await loadDecisionFunction();

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,options={},attempts=3){
  let last;
  for(let i=1;i<=attempts;i++){
    try{
      const r=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});
      const text=await r.text();
      if(r.ok||(r.status<500&&r.status!==429)) return {r,text};
      last=new Error(`HTTP ${r.status}: ${text.slice(0,300)}`);
    }catch(e){last=e;}
    if(i<attempts) await sleep(i*1500);
  }
  throw last||new Error("request failed");
}
function messagesFrom(v){return Array.isArray(v)?v:Array.isArray(v?.messages)?v.messages:Array.isArray(v?.items)?v.items:[];}
function mtext(m){return String(m?.text??m?.message??m?.body??"");}
function mdid(m){const f=String(m?.from||"");return String(m?.did||(f.startsWith("did:key:")?f:""));}
function parseBody(m){try{return JSON.parse(mtext(m));}catch{return null;}}
async function readRoom(room,limit=200){
  const {r,text}=await request(`${BASE}/r/${encodeURIComponent(room)}?format=json&limit=${Math.min(200,limit)}`,{headers:{accept:"application/json","cache-control":"no-cache"}});
  if(!r.ok) throw new Error(`read ${room} failed ${r.status}`);
  return messagesFrom(JSON.parse(text));
}
async function readExport(room){
  const {r,text}=await request(`${BASE}/r/${encodeURIComponent(room)}/export`,{headers:{accept:"application/x-ndjson,application/json,text/plain","cache-control":"no-cache"}});
  if(!r.ok) throw new Error(`export ${room} failed ${r.status}`);
  const t=text.trim(); if(!t) return [];
  try{const p=JSON.parse(t);const m=messagesFrom(p);if(m.length||Array.isArray(p))return m;}catch{}
  const out=[]; for(const line of t.split(/\r?\n/)){if(!line.trim())continue;try{out.push(JSON.parse(line));}catch{}}
  return out;
}

let lastNonce=0;
function nextNonce(){lastNonce=Math.max(Date.now(),lastNonce+1);return String(lastNonce);}
function signPayload(v){return nodeSign(null,Buffer.from(v,"utf8"),privateKey).toString("base64url");}
async function signedPost(room,text){
  const nonce=nextNonce(),sig=signPayload(`${room}|${nonce}|${text}`);
  const {r,text:body}=await request(`${BASE}/r/${encodeURIComponent(room)}?format=json`,{
    method:"POST",headers:{"content-type":"application/json",accept:"application/json,text/plain"},
    body:JSON.stringify({did,sig,nonce,text})
  },1);
  if(!r.ok) throw new Error(`post failed ${r.status}: ${body.slice(0,500)}`);
  let seq=null;try{const p=JSON.parse(body);seq=Number(p?.posted?.seq||p?.seq||0)||null;}catch{}
  return {seq};
}

async function latestState(){
  const msgs=await readRoom(STATE_ROOM,200);
  const own=msgs.filter(m=>mdid(m)===did&&mtext(m).startsWith(MARKER+" "));
  if(!own.length)return {state:"idle"};
  try{return JSON.parse(mtext(own.at(-1)).slice(MARKER.length+1));}catch{return {state:"idle"};}
}
async function saveState(st){
  const text=MARKER+" "+JSON.stringify(st);
  if(!execute){console.log("DRY_STATE="+JSON.stringify(st));return;}
  const p=await signedPost(STATE_ROOM,text);
  console.log("STATE_SAVED seq="+(p.seq||"?")+" state="+st.state);
}

async function priceSeries(){
  const msgs=await readRoom("d-close1-price",200),out=[];
  for(const m of msgs){const b=parseBody(m);if(b?.t==="price"&&b?.ref?.px&&b?.ref?.time)out.push({n:Number(b.n),px:Number(b.ref.px),time:String(b.ref.time),tid:String(b.ref.tid||"")});}
  out.sort((a,b)=>a.n-b.n);return out;
}
function distinctRefs(series){
  const out=[];for(const x of series){const l=out.at(-1);if(!l||l.tid!==x.tid||l.time!==x.time||l.px!==x.px)out.push(x);}return out;
}
async function pnlSnapshots(){
  const msgs=await readRoom("d-close1-pnl",200),out=[];
  for(const m of msgs){const b=parseBody(m);if(b?.t==="pnl"&&b?.mark&&Array.isArray(b.top))out.push({n:Number(b.n),mark:Number(b.mark),top:b.top});}
  out.sort((a,b)=>a.n-b.n);return out;
}
function makeOffer(d,latest){
  const qty=Number(d.qty);
  if(!["buy","sell"].includes(d.side)||!Number.isFinite(qty)||qty<0.1||qty>44)throw new Error("strategy returned invalid trade");
  const id="rd3-"+String(latest.n)+"-"+Date.now().toString(36).slice(-7);
  const until=Number(latest.n)+3;
  const terms={id,maker:did,px:Number(latest.px).toFixed(2),qty:qty.toFixed(2),side:d.side,taker:"any",until};
  const tj=JSON.stringify(terms);
  const maker_sig=signPayload(`${SEASON}|terms|${tj}`);
  return {id,until,terms,text:JSON.stringify({t:"trade",season:SEASON,terms,taker:"any",maker_sig})};
}
async function findAcceptance(id){
  const msgs=await readExport(ROOM);
  for(let i=msgs.length-1;i>=0;i--){const b=parseBody(msgs[i]);if(b?.t==="trade"&&b?.season===SEASON&&b?.terms?.id===id&&b?.terms?.maker===did&&b?.taker_sig&&b?.taker&&b.taker!=="any")return {seq:Number(msgs[i]?.seq||0)||null,taker:b.taker};}
  return null;
}
async function findOutcome(id){
  const msgs=await readRoom("d-close1-flow",100);
  for(let i=msgs.length-1;i>=0;i--){const b=parseBody(msgs[i]);if(b?.t!=="flow")continue;if(Array.isArray(b.settled)&&b.settled.includes(id))return {outcome:"settled",n:Number(b.n)};if(Array.isArray(b.void)){const hit=b.void.find(v=>Array.isArray(v)&&v[0]===id);if(hit)return {outcome:"void",reason:hit[1],n:Number(b.n)};}}
  return null;
}

const now=Date.now();
if(now>=LOCK_MS){console.log("LOCKED");process.exit(0);}
const series=await priceSeries(),distinct=distinctRefs(series),pnl=await pnlSnapshots(),latest=series.at(-1);
if(!latest)throw new Error("No price");
let state=await latestState();
console.log("STATUS execute="+execute+" n="+latest.n+" ref="+latest.px+" state="+state.state+" pnlSnaps="+pnl.length);

if(["settled","accepted_unverified"].includes(state.state)){console.log("HOLD_ONE_BET");process.exit(0);}
if(state.state==="accepted"){
  const o=await findOutcome(state.id);
  if(o?.outcome==="settled"){const next={...state,state:"settled",settledSweep:o.n,settledAt:new Date().toISOString()};await saveState(next);console.log("TRADE_SETTLED id="+state.id);process.exit(0);}
  if(o?.outcome==="void"){state={state:"idle",lastId:state.id,lastVoid:o.reason,lastVoidSweep:o.n,at:new Date().toISOString()};await saveState(state);console.log("TRADE_VOID reason="+o.reason);}
  else if(Number(latest.n)>=Number(state.acceptedAtSweep||latest.n)+3){const next={...state,state:"accepted_unverified",checkedThroughSweep:latest.n};await saveState(next);console.log("ACCEPTED_OUTCOME_OMITTED");process.exit(0);}
  else {console.log("ACCEPTED_PENDING");process.exit(0);}
}
if(state.state==="offer"){
  const a=await findAcceptance(state.id);
  if(a){const next={...state,state:"accepted",acceptedSeq:a.seq,acceptedAtSweep:latest.n,acceptedAt:new Date().toISOString(),taker:a.taker};await saveState(next);console.log("OFFER_ACCEPTED id="+state.id);process.exit(0);}
  if(Number(latest.n)<=Number(state.until||0)){console.log("OFFER_LIVE");process.exit(0);}
  state={state:"idle",reason:"offer_expired",lastId:state.id,at:new Date().toISOString()};await saveState(state);console.log("OFFER_EXPIRED");
}

const decision=decide({now,distinct,pnlSnapshots:pnl,state});
if(!decision){console.log("NO_TRADE");process.exit(0);}
const offer=makeOffer(decision,latest);
console.log("SIGNAL side="+decision.side+" qty="+Number(decision.qty).toFixed(2)+" confidence="+String(decision.confidence||"")+" reason="+String(decision.reason||""));
if(!execute){console.log("DRY_RUN_ONLY");process.exit(0);}
const posted=await signedPost(ROOM,offer.text);
const next={state:"offer",id:offer.id,side:decision.side,qty:Number(decision.qty),px:latest.px,until:offer.until,postedSeq:posted.seq,reason:decision.reason,confidence:decision.confidence,postedAt:new Date().toISOString()};
await saveState(next);
console.log("OFFER_POSTED seq="+(posted.seq||"?")+" id="+offer.id);
