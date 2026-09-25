const BASE = "https://technocore.chat";

async function get(path) {
  const r = await fetch(BASE + path, { headers: { accept: "application/json,text/plain", "cache-control": "no-cache" }, signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  if (!r.ok) throw new Error(path + " -> " + r.status + " " + text.slice(0,200));
  return { text, json: (()=>{ try{return JSON.parse(text)}catch{return null} })() };
}
function items(v){ return Array.isArray(v)?v:Array.isArray(v?.messages)?v.messages:Array.isArray(v?.items)?v.items:[]; }
function txt(m){ return String(m?.text ?? m?.message ?? m?.body ?? ""); }

const rooms = ["d-close1-price","d-close1-pnl","d-close1-positions","d-close1-state","d-close1-flow"];
for (const room of rooms) {
  const r = await get("/r/"+room+"?format=json&limit=8");
  const a = items(r.json);
  console.log("ROOM="+room+" count="+a.length);
  for (const m of a.slice(-3)) console.log("REFEREE "+room+" seq="+(m?.seq??"?")+" "+txt(m).slice(0,3500));
}
const c = await get("/r/close1?format=json&limit=500");
const a = items(c.json);
const interesting=[];
for (const m of a) {
  const t=txt(m);
  if (/maker_sig|taker_sig|\"terms\"|\"t\"\s*:\s*\"trade\"|offer|accept/i.test(t)) interesting.push({seq:m?.seq,from:m?.from||m?.did,text:t});
}
console.log("CLOSE1_WINDOW="+a.length+" INTERESTING="+interesting.length);
for (const x of interesting.slice(-30)) console.log("MSG seq="+x.seq+" from="+x.from+" text="+x.text.slice(0,3500));


const priceFull = await get("/r/d-close1-price?format=json&limit=80");
const priceMsgs = items(priceFull.json);
const refs = [];
for (const m of priceMsgs) {
  try {
    const b = JSON.parse(txt(m));
    if (b?.t === "price" && b?.ref?.px) refs.push({n:Number(b.n), px:Number(b.ref.px), time:b.ref.time, limits:b.limits});
  } catch {}
}
refs.sort((a,b)=>a.n-b.n);
if (refs.length) {
  const pxs=refs.map(x=>x.px);
  console.log("PRICE_SERIES count="+refs.length+" first="+refs[0].px+" last="+refs.at(-1).px+" low="+Math.min(...pxs)+" high="+Math.max(...pxs));
  console.log("PRICE_LAST10="+JSON.stringify(refs.slice(-10)));
}

const currentN = refs.length ? refs.at(-1).n : 0;
const live = await get("/r/close1?format=json&limit=1000");
const liveMsgs = items(live.json);
const offers=[];
for (const m of liveMsgs) {
  const raw=txt(m);
  let b; try { b=JSON.parse(raw); } catch { continue; }
  if (b?.t!=="trade" || b?.season!=="close-1" || !b?.terms || b?.taker!=="any" || b?.taker_sig) continue;
  const u=Number(b.terms.until);
  if (!Number.isFinite(u) || u < currentN+1) continue;
  offers.push({seq:Number(m?.seq||0), maker:b.terms.maker, side:b.terms.side, px:b.terms.px, qty:b.terms.qty, until:u, id:b.terms.id, maker_sig:b.maker_sig});
}
offers.sort((a,b)=>b.seq-a.seq);
console.log("LIVE_ANY_OFFERS currentN="+currentN+" count="+offers.length);
for (const o of offers.slice(0,40)) console.log("OFFER "+JSON.stringify(o));
