const BASE="https://technocore.chat";
async function get(room,limit=200){
  const r=await fetch(`${BASE}/r/${room}?format=json&limit=${limit}`,{headers:{accept:"application/json","cache-control":"no-cache"},signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error(room+" "+r.status);
  const j=await r.json();
  return Array.isArray(j)?j:(j.messages||j.items||[]);
}
function body(m){try{return JSON.parse(String(m?.text??m?.message??m?.body??""));}catch{return null;}}

const [pnlMsgs,posMsgs,priceMsgs]=await Promise.all([
  get("d-close1-pnl",200),
  get("d-close1-positions",200),
  get("d-close1-price",200)
]);
const pnls=pnlMsgs.map(body).filter(x=>x?.t==="pnl"&&Array.isArray(x.top)).sort((a,b)=>Number(a.n)-Number(b.n));
const poss=posMsgs.map(body).filter(x=>x?.t==="positions"&&Array.isArray(x.top)).sort((a,b)=>Number(a.n)-Number(b.n));
const prices=priceMsgs.map(body).filter(x=>x?.t==="price"&&x?.ref?.px).sort((a,b)=>Number(a.n)-Number(b.n));
const posByN=new Map(poss.map(x=>[Number(x.n),x]));
const priceByN=new Map(prices.map(x=>[Number(x.n),Number(x.ref.px)]));

const recent=pnls.slice(-24);
const ids=new Set();
for(const x of recent) for(const [did] of x.top.slice(0,12)) ids.add(did);
const rows=[];
for(const did of ids){
  const hist=[];
  for(const x of recent){
    const hit=x.top.find(([k])=>k===did);
    if(hit) hist.push({n:Number(x.n),score:Number(hit[1]),mark:Number(x.mark)});
  }
  if(hist.length<3) continue;
  const first=hist[0],last=hist.at(-1);
  let slopeNumer=0,slopeDenom=0;
  for(let i=1;i<hist.length;i++){
    const dp=hist[i].mark-hist[i-1].mark;
    const ds=hist[i].score-hist[i-1].score;
    if(Math.abs(dp)>1e-9){slopeNumer+=ds*dp;slopeDenom+=dp*dp;}
  }
  const beta=slopeDenom?slopeNumer/slopeDenom:0;
  const positionHints=[];
  for(const h of hist){
    const p=posByN.get(h.n);
    const ph=p?.top?.find(([k])=>k===did);
    if(ph) positionHints.push({n:h.n,pos:Number(ph[1])});
  }
  rows.push({
    did,
    observations:hist.length,
    firstN:first.n,lastN:last.n,
    score0:first.score,score1:last.score,scoreChange:last.score-first.score,
    mark0:first.mark,mark1:last.mark,markChange:last.mark-first.mark,
    inferredDelta:Number(beta.toFixed(2)),
    positionHints
  });
}
rows.sort((a,b)=>b.score1-a.score1);
console.log("LATEST_SWEEP="+(recent.at(-1)?.n??"?")+" MARK="+(recent.at(-1)?.mark??"?"));
console.log("LEADERS="+JSON.stringify(rows.slice(0,15)));
for(const x of recent.slice(-8)) console.log("BOARD "+x.n+" "+JSON.stringify(x.top.slice(0,8)));
for(const x of poss.slice(-8)) console.log("POSITIONS "+x.n+" open="+x.open+" longs="+x.longs+" shorts="+x.shorts+" top="+JSON.stringify(x.top.slice(0,12)));

const flowMsgs=await get("d-close1-flow",500);
const flows=flowMsgs.map(body).filter(x=>x?.t==="flow").sort((a,b)=>Number(a.n)-Number(b.n));
for(const x of flows.slice(-12)) console.log("FLOW "+x.n+" "+JSON.stringify(x));
const roomMsgs=await get("close1",2000);
for(const m of roomMsgs){
  const b=body(m);
  if(b?.t==="trade" && (b?.terms?.maker==="did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K" || b?.taker==="did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K")){
    console.log("OWN_TRADE "+JSON.stringify(b));
  }
}
