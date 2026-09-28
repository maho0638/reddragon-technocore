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

// REDDRAGON_STATE_ROOM_PROBE
for (const candidate of ["d-reddragon-835ae177","d-reddragon-lab","mb-reddragon-agent","close1"]) {
  try {
    const r = await fetch(BASE + "/r/" + encodeURIComponent(candidate) + "?format=json&limit=3", {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15000)
    });
    const body = await r.text();
    console.log("STATE_ROOM_CANDIDATE " + candidate + " status=" + r.status + " body=" + body.slice(0,1200));
  } catch (e) {
    console.log("STATE_ROOM_CANDIDATE " + candidate + " ERROR " + String(e));
  }
}


// OFFICIAL_CLOSE1_ARCHIVE_PROBE
const ARCHIVE = "https://challenges.technocore.chat/close-1";
async function archiveGet(name) {
  const r = await fetch(ARCHIVE + "/" + name, {
    headers: { accept: "application/json,text/plain", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(20000)
  });
  const text = await r.text();
  console.log("ARCHIVE_FETCH name=" + name + " status=" + r.status + " bytes=" + text.length);
  if (!r.ok) throw new Error("archive " + name + " -> " + r.status);
  return text;
}
try {
  const readme = await archiveGet("README.txt");
  console.log("ARCHIVE_README\n" + readme.slice(0,12000));
  const indexText = await archiveGet("index.json");
  const index = JSON.parse(indexText);
  console.log("ARCHIVE_INDEX_TYPE=" + (Array.isArray(index) ? "array" : typeof index));
  if (Array.isArray(index)) {
    console.log("ARCHIVE_INDEX_COUNT=" + index.length);
    console.log("ARCHIVE_INDEX_FIRST=" + JSON.stringify(index.slice(0,3), null, 2));
    console.log("ARCHIVE_INDEX_LAST=" + JSON.stringify(index.slice(-3), null, 2));
  } else {
    console.log("ARCHIVE_INDEX_KEYS=" + JSON.stringify(Object.keys(index).slice(0,50)));
    console.log("ARCHIVE_INDEX_SAMPLE=" + JSON.stringify(index, null, 2).slice(0,16000));
    const sweeps = Array.isArray(index.sweeps) ? index.sweeps : [];
    const redDragonDid = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
    for (const n of [38, 305, 306, 307, 575, 576, 577, 578, 672, 673, 674, 675, 676, 677, 678, 679, 680]) {
      const meta = sweeps.find((x) => Number(x.n) === n);
      if (!meta?.path) {
        console.log("ARCHIVE_SWEEP_MISSING n=" + n);
        continue;
      }
      const body = await archiveGet(meta.path);
      const record = JSON.parse(body);
      const minted = Array.isArray(record?.output?.minted) ? record.output.minted : [];
      const inputTrades = Array.isArray(record?.input?.trades) ? record.input.trades : [];
      const outputTrades = Array.isArray(record?.output?.trades) ? record.output.trades : [];
      console.log(
        "ARCHIVE_SWEEP n=" + n +
        " status=" + meta.status +
        " mintedRedDragon=" + minted.includes(redDragonDid) +
        " inputTrades=" + inputTrades.length +
        " outputTrades=" + outputTrades.length
      );
      for (let i = 0; i < Math.max(inputTrades.length, outputTrades.length); i++) {
        const pair = { input: inputTrades[i], output: outputTrades[i] };
        const raw = JSON.stringify(pair);
        if (raw.includes(redDragonDid) || raw.includes("rd4e-305-uifc397")) {
          console.log("ARCHIVE_REDDRAGON_TRADE n=" + n + " i=" + i + " " + raw.slice(0,6000));
        }
      }
    }
  }
} catch (e) {
  console.log("ARCHIVE_PROBE_ERROR " + String(e));
}


// REAL_NVDA_PUBLIC_MARKET_PROBE
try {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1m&range=1d&includePrePost=true";
  const rr = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 close1-market-probe"
    },
    signal: AbortSignal.timeout(20000)
  });
  const body = await rr.text();
  console.log("REAL_NVDA_FETCH status=" + rr.status + " bytes=" + body.length);
  if (rr.ok) {
    const y = JSON.parse(body);
    const q = y?.chart?.result?.[0];
    const ts = Array.isArray(q?.timestamp) ? q.timestamp : [];
    const closes = Array.isArray(q?.indicators?.quote?.[0]?.close) ? q.indicators.quote[0].close : [];
    const pts = [];
    for (let i=0;i<Math.min(ts.length,closes.length);i++) {
      const px = Number(closes[i]);
      if (Number.isFinite(px)) pts.push({ t:Number(ts[i]), px });
    }
    const last = pts.at(-1);
    const nowSec = Math.floor(Date.now()/1000);
    const age = last ? nowSec-last.t : null;
    const p5 = pts.length >= 6 ? pts.at(-6).px : null;
    const p30 = pts.length >= 31 ? pts.at(-31).px : null;
    console.log("REAL_NVDA_META " + JSON.stringify({
      marketState:q?.meta?.marketState,
      regularMarketPrice:q?.meta?.regularMarketPrice,
      previousClose:q?.meta?.previousClose,
      exchangeTimezoneName:q?.meta?.exchangeTimezoneName,
      last,
      age_s:age,
      move5:last&&p5?last.px-p5:null,
      move30:last&&p30?last.px-p30:null,
      points:pts.length
    }));
  }
} catch (e) {
  console.log("REAL_NVDA_PROBE_ERROR " + String(e));
}
