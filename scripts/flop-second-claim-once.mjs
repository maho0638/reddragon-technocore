import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {DID,ADDRESS,GENESIS,BASE,RPC,CLAIM,checkSigner,checkNetwork} from './flop-testnet-first-claim.mjs';
const nonce='1795699800000';
const headers={'content-type':'application/json'};
async function request(url,options={}){
  const r=await fetch(url,{...options,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const chunks=[];let size=0;
  for await(const chunk of r.body){size+=chunk.byteLength;if(size>131072)throw Error('Response too large');chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString('utf8');let body;
  try{body=JSON.parse(raw);}catch{body=null;}
  return {status:r.status,ok:r.ok,body,retryAfter:r.headers.get('retry-after')};
}
async function read(url,opts){const r=await request(url,opts);if(!r.ok||!r.body)throw Error('Preflight HTTP '+r.status+' '+url);return r.body;}
try{
  if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.GITHUB_EVENT_NAME!=='push')throw Error('Not authorized one-shot trigger');
  if(Date.now()<Date.parse('2026-11-26T12:48:00Z'))throw Error('24 hour minimum not elapsed');
  const key=createPrivateKey({key:Buffer.from(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64??'','base64'),format:'der',type:'pkcs8'});
  checkSigner(key,{did:DID,address:ADDRESS});
  const [profile,rpc,limits]=await Promise.all([read(BASE+'/chain'),read(RPC,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'chain_getBlockHash',params:[0]})}),read(BASE+'/limits')]);
  if(!checkNetwork(profile,rpc,limits,Date.now()))throw Error('Faucet not open or reserve preflight failed');
  const message=Buffer.from('flop-faucet-agent/v1|'+GENESIS+'|'+ADDRESS+'|'+nonce,'utf8');
  const signature=sign(null,message,key);
  if(!verify(null,message,createPublicKey(key),signature))throw Error('Local signature verification failed');
  console.log('FLOP_SECOND_ATTEMPT_POST_STARTED='+JSON.stringify({address:ADDRESS,nonce,previousTx:'0x77309e5dbf6bf2ec4179fc2c08ba05c0b52c418f464896c553d4b74ff739b83d',rolloverRequiresSpend:limits.faucet.agent.rolloverRequiresSpend,balanceFlop:limits.faucet.balanceFlop}));
  // One ordinary request only: the official service enforces its own eligibility rules.
  let result;
  try{result=await request(BASE+CLAIM,{method:'POST',headers,body:JSON.stringify({address:ADDRESS,nonce,signature:'0x'+signature.toString('hex')})});}
  catch{console.log('FLOP_SECOND_ATTEMPT_RESULT='+JSON.stringify({state:'submission-outcome-unknown',nonce}));process.exitCode=1;}
  if(result){const p=result.body??{};const out={http:result.status,nonce,state:result.ok&&/^0x[0-9a-f]{64}$/i.test(p.txHash??'')?'submitted-not-finalized':'not-confirmed'};
    for(const k of ['code','error','action','message','reason','retryAfterSeconds','txHash']){const v=p[k];if(typeof v==='string'||typeof v==='number')out[k]=typeof v==='string'?v.replace(/0x[0-9a-f]{128}/gi,'[redacted]').slice(0,240):v;}
    if(result.retryAfter)out.retryAfter=result.retryAfter;
    console.log('FLOP_SECOND_ATTEMPT_RESULT='+JSON.stringify(out));}
}catch(e){console.error('FLOP_SECOND_ATTEMPT_BLOCKED='+String(e.message).slice(0,200));process.exitCode=1;}
