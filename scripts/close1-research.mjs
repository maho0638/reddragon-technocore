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
