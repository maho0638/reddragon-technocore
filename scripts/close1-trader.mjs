import { createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";

const BASE = "https://technocore.chat";
const ROOM = "close1";
const STATE_ROOM = "mb-reddragon-agent";
const SEASON = "close-1";
const MARKER = "REDDRAGON_CLOSE1_TRADER_V1";
const LOCK_MS = Date.parse("2026-10-04T09:00:00Z");
const FORCE_TREND_MS = Date.parse("2026-10-02T12:00:00Z");
const LATE_RISK_MS = Date.parse("2026-10-03T12:00:00Z");
const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
const execute = String(process.env.CLOSE1_EXECUTE || "false").toLowerCase() === "true";

if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = 0n;
  for (const b of bytes) x = (x << 8n) + BigInt(b);
  let out = "";
  while (x > 0n) { out = alphabet[Number(x % 58n)] + out; x /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out || "1";
}
function deriveDid(key) {
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  const raw = spki.subarray(spki.length - 32);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0xed,0x01]), raw]))}`;
}
const privateKey = createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" });
const did = deriveDid(privateKey);
const EXPECTED_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
if (did !== EXPECTED_DID) throw new Error("Private key does not match RedDragon DID");

const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function request(url, options={}, attempts=3) {
  let err;
  for (let i=1;i<=attempts;i++) {
    try {
      const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
      const text=await r.text();
      if (r.ok || (r.status<500 && r.status!==429)) return {r,text};
      err=new Error(`HTTP ${r.status}: ${text.slice(0,300)}`);
    } catch(e){ err=e; }
    if(i<attempts) await sleep(i*1500);
  }
  throw err || new Error("request failed");
}
function items(v){ return Array.isArray(v)?v:Array.isArray(v?.messages)?v.messages:Array.isArray(v?.items)?v.items:[]; }
function mtext(m){ return String(m?.text ?? m?.message ?? m?.body ?? ""); }
function mdid(m){ const f=String(m?.from||""); return String(m?.did || (f.startsWith("did:key:")?f:"")); }
async function readRoom(room,limit=200){
  const {r,text}=await request(`${BASE}/r/${encodeURIComponent(room)}?format=json&limit=${limit}`,{headers:{accept:"application/json","cache-control":"no-cache"}});
  if(!r.ok) throw new Error(`read ${room} failed ${r.status}`);
  return items(JSON.parse(text));
}
let lastNonce=0;
function nextNonce(){ lastNonce=Math.max(Date.now(),lastNonce+1); return String(lastNonce); }
function signPayload(s){ return nodeSign(null,Buffer.from(s,"utf8"),privateKey).toString("base64url"); }
async function signedPost(room,text){
  const nonce=nextNonce();
  const sig=signPayload(`${room}|${nonce}|${text}`);
  const {r,text:body}=await request(`${BASE}/r/${encodeURIComponent(room)}?format=json`,{
    method:"POST",headers:{"content-type":"application/json",accept:"application/json,text/plain"},
    body:JSON.stringify({did,sig,nonce,text})
  },1);
  if(!r.ok) throw new Error(`signed post failed ${r.status}: ${body.slice(0,500)}`);
  let seq=null; try{const p=JSON.parse(body);seq=Number(p?.posted?.seq||p?.seq||0)||null}catch{}
  return {seq,nonce};
}
function parseBody(m){ try{return JSON.parse(mtext(m))}catch{return null} }

async function latestState(){
  const msgs=await readRoom(STATE_ROOM,200);
  const own=msgs.filter(m=>mdid(m)===did && mtext(m).startsWith(MARKER+" "));
  if(!own.length) return {state:"idle"};
  const raw=mtext(own.at(-1)).slice(MARKER.length+1);
  try{return JSON.parse(raw)}catch{return {state:"idle"}}
}
async function saveState(st){
  const text=MARKER+" "+JSON.stringify(st);
  if(!execute){ console.log("DRY_STATE="+text); return; }
  const p=await signedPost(STATE_ROOM,text);
  console.log("STATE_SAVED seq="+(p.seq||"?")+" "+JSON.stringify(st));
}

async function priceSeries(){
  const msgs=await readRoom("d-close1-price",100);
  const out=[];
  for(const m of msgs){
    const b=parseBody(m);
    if(b?.t==="price" && b?.ref?.px && b?.ref?.time){
      out.push({n:Number(b.n),px:Number(b.ref.px),time:b.ref.time,tid:String(b.ref.tid||""),limits:b.limits});
    }
  }
  out.sort((a,b)=>a.n-b.n);
  return out;
}
function distinctRefs(series){
  const out=[];
  for(const x of series){
    const last=out.at(-1);
    if(!last || last.tid!==x.tid || last.time!==x.time || last.px!==x.px) out.push(x);
  }
  return out;
}
function signalFor(distinct, now){
  const last=distinct.at(-1), prev=distinct.at(-2), prev2=distinct.at(-3);
  if(!last||!prev) return null;
  const age=now-Date.parse(last.time);
  if(!Number.isFinite(age)||age>10*60_000) return null;

  // Key levels from current NVDA/contest research: 221-223 support, 229-230 resistance.
  if(last.px>=230.00 && prev.px>=229.50 && last.px>=prev.px)
    return {side:"buy",reason:"confirmed_breakout_230",confidence:"high"};
  if(Math.min(...distinct.slice(-4).map(x=>x.px))<=222.50 && last.px>=223.50 && last.px>prev.px)
    return {side:"buy",reason:"support_reclaim_223",confidence:"medium"};
  if(last.px<=220.50 && prev.px<=221.00 && last.px<=prev.px)
    return {side:"sell",reason:"confirmed_breakdown_221",confidence:"high"};
  if(Math.max(...distinct.slice(-4).map(x=>x.px))>=229.50 && last.px<=228.00 && last.px<prev.px)
    return {side:"sell",reason:"rejection_from_230",confidence:"medium"};

  if(now>=FORCE_TREND_MS && distinct.length>=4){
    const base=distinct.at(-4).px;
    const move=(last.px/base)-1;
    if(move>=0.012) return {side:"buy",reason:"late_contest_uptrend",confidence:"medium"};
    if(move<=-0.012) return {side:"sell",reason:"late_contest_downtrend",confidence:"medium"};
  }
  if(now>=LATE_RISK_MS && distinct.length>=2){
    const base=distinct[0].px;
    const move=(last.px/base)-1;
    if(move>=0.003) return {side:"buy",reason:"final_day_positive_bias",confidence:"low"};
    if(move<=-0.003) return {side:"sell",reason:"final_day_negative_bias",confidence:"low"};
  }
  return null;
}
function offerText(side,px,qty,until,id){
  const terms={id,maker:did,px:px.toFixed(2),qty:qty.toFixed(2),side,taker:"any",until};
  const termsJson=JSON.stringify(terms);
  const maker_sig=signPayload(`${SEASON}|terms|${termsJson}`);
  return {terms,text:JSON.stringify({t:"trade",season:SEASON,terms,taker:"any",maker_sig})};
}
async function findAcceptance(id){
  const msgs=await readRoom(ROOM,1000);
  for(let i=msgs.length-1;i>=0;i--){
    const b=parseBody(msgs[i]);
    if(b?.t==="trade" && b?.season===SEASON && b?.terms?.id===id && b?.terms?.maker===did && b?.taker_sig && b?.taker && b.taker!=="any"){
      return {seq:Number(msgs[i]?.seq||0)||null,body:b};
    }
  }
  return null;
}

const now=Date.now();
if(now>=LOCK_MS){ console.log("LOCKED: contest trading window ended."); process.exit(0); }
const series=await priceSeries();
const distinct=distinctRefs(series);
const latest=series.at(-1);
console.log("DID="+did+" execute="+execute+" currentN="+(latest?.n??"?")+" ref="+(latest?.px??"?")+" distinctRefs="+distinct.length);
console.log("RECENT_DISTINCT="+JSON.stringify(distinct.slice(-8)));

let state=await latestState();
console.log("STATE="+JSON.stringify(state));

if(state.state==="offer"){
  const accepted=await findAcceptance(state.id);
  if(accepted){
    const filled={state:"filled",id:state.id,side:state.side,qty:state.qty,entryPx:state.px,acceptedSeq:accepted.seq,filledAt:new Date().toISOString(),stage:Number(state.stage||1)};
    await saveState(filled);
    console.log("ACCEPTED="+JSON.stringify(filled));
    process.exit(0);
  }
  if(Number(latest?.n||0) <= Number(state.until||0)){
    console.log("Existing offer still live; no duplicate.");
    process.exit(0);
  }
  await saveState({state:"idle",reason:"offer_expired",lastId:state.id,at:new Date().toISOString()});
  state={state:"idle"};
}

if(state.state==="filled"){
  const entry=Number(state.entryPx), qty=Number(state.qty), stage=Number(state.stage||1);
  const favorable=state.side==="buy" ? latest.px/entry-1 : entry/latest.px-1;
  console.log("FILLED_HOLD side="+state.side+" qty="+qty+" entry="+entry+" favorable="+favorable.toFixed(4));
  if(stage===1 && qty<40 && favorable>=0.008){
    const addQty=18;
    const id="rd1a-"+String(latest.n)+"-"+Date.now().toString(36).slice(-6);
    const o=offerText(state.side,latest.px,addQty,Number(latest.n)+3,id);
    if(execute){
      const p=await signedPost(ROOM,o.text);
      await saveState({state:"offer",id,side:state.side,qty:addQty,px:latest.px,until:Number(latest.n)+3,stage:2,parent:{entryPx:entry,qty},postedSeq:p.seq,reason:"add_on_confirmation"});
      console.log("ADD_OFFER_POSTED seq="+(p.seq||"?")+" "+o.text);
    } else console.log("DRY_ADD_OFFER "+o.text);
  }
  process.exit(0);
}

const sig=signalFor(distinct,now);
if(!sig){ console.log("NO_TRADE: no high-quality signal; fee-aware wait."); process.exit(0); }
const qty=sig.confidence==="high" ? 28 : 24;
const id="rd1-"+String(latest.n)+"-"+Date.now().toString(36).slice(-6);
const o=offerText(sig.side,latest.px,qty,Number(latest.n)+3,id);
console.log("SIGNAL="+JSON.stringify(sig)+" OFFER="+o.text);
if(!execute){ console.log("DRY_RUN_ONLY"); process.exit(0); }
const p=await signedPost(ROOM,o.text);
await saveState({state:"offer",id,side:sig.side,qty,px:latest.px,until:Number(latest.n)+3,stage:1,postedSeq:p.seq,reason:sig.reason,confidence:sig.confidence,at:new Date().toISOString()});
console.log("OFFER_POSTED seq="+(p.seq||"?"));
