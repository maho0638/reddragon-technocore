import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {identity,run,makeClaim,GENESIS,NONCE,BASE,RPC,CLAIM,ADDRESS} from './flop-testnet-first-claim.mjs';
const {privateKey:key,publicKey}=generateKeyPairSync('ed25519'); // Test fixture only.
const expected=identity(key),now=Date.now();
const profile={network:'testnet',genesisHash:GENESIS},rpc={result:GENESIS};
const limits={network:'testnet',stale:false,asOf:new Date(now).toISOString(),faucet:{status:'open',balanceFlop:'6000',minBalanceFlop:'5000',agent:{claimPath:CLAIM,grantFlop:10,rolling24HourCapFlop:10,cooldownSeconds:86400,rolloverRequiresSpend:true}}};
const txHash='0x'+'a'.repeat(64);
function fixture({p=profile,r=rpc,l=limits,reply={txHash},status=200,headers={},fail=false}={}){let calls=[];const fetchFn=async(url,options)=>{calls.push({url,options});if(url===BASE+'/chain')return Response.json(p);if(url===RPC)return Response.json(r);if(url===BASE+'/limits')return Response.json(l);if(url===BASE+CLAIM){if(fail)throw Error('network lost');return Response.json(reply,{status,headers});}throw Error('Unexpected URL');};return {calls,fetchFn};}
async function execute(f,opts={}){return run({key,expected,now,fetchFn:f.fetchFn,...opts});}
const posts=f=>f.calls.filter(c=>c.url===BASE+CLAIM);
test('known address differs from test fixture',()=>assert.notEqual(expected.address,ADDRESS));
test('wrong existing key stops before network',async()=>{const f=fixture();await assert.rejects(()=>execute(f,{expected:{address:ADDRESS,did:expected.did}}));assert.equal(f.calls.length,0);});
test('wrong genesis cannot submit',async()=>{const f=fixture({r:{result:'wrong'}});await assert.rejects(()=>execute(f));assert.equal(posts(f).length,0);});
test('wrong network cannot submit',async()=>{const f=fixture({p:{...profile,network:'devnet'}});await assert.rejects(()=>execute(f));assert.equal(posts(f).length,0);});
test('low balance cannot submit',async()=>{const f=fixture({l:{...limits,faucet:{...limits.faucet,status:'low_balance',balanceFlop:'0'}}});assert.equal((await execute(f)).state,'faucet-unavailable');assert.equal(posts(f).length,0);});
test('stale limits cannot submit',async()=>{const f=fixture({l:{...limits,stale:true}});await assert.rejects(()=>execute(f));assert.equal(posts(f).length,0);});
test('changed grant cannot submit',async()=>{const f=fixture({l:{...limits,faucet:{...limits.faucet,agent:{...limits.faucet.agent,grantFlop:25}}}});await assert.rejects(()=>execute(f));assert.equal(posts(f).length,0);});
test('dry run signs without posting',async()=>{const f=fixture();assert.equal((await execute(f,{dryRun:true})).state,'preflight-ready');assert.equal(posts(f).length,0);});
test('one exact signed first claim, never finality',async()=>{const f=fixture();const out=await execute(f);assert.equal(out.state,'submitted-not-finalized');assert.equal(out.finalized,false);assert.equal(posts(f).length,1);const payload=JSON.parse(posts(f)[0].options.body);assert.equal(payload.nonce,NONCE);assert.equal(payload.address,expected.address);assert(verify(null,Buffer.from('flop-faucet-agent/v1|'+GENESIS+'|'+expected.address+'|'+NONCE),publicKey,Buffer.from(payload.signature.slice(2),'hex')));assert.equal(posts(f)[0].options.redirect,'error');assert(!JSON.stringify(out).includes(payload.signature));});
test('same nonce and signature on retry',()=>assert.deepEqual(makeClaim(key,expected),makeClaim(key,expected)));
test('known receipt suppresses repeat',async()=>{const f=fixture();const state=(await execute(f)).persist;const g=fixture();assert.equal((await execute(g,{state})).state,'receipt-awaiting-independent-finality');assert.equal(g.calls.length,0);});
test('lost response holds; no new nonce',async()=>{const f=fixture({fail:true});const out=await execute(f);assert.equal(out.state,'submission-outcome-unknown');const g=fixture();assert.equal((await execute(g,{state:out.persist})).state,'backoff');assert.equal(g.calls.length,0);});
test('429 honors retry delay',async()=>{const f=fixture({status:429,reply:{action:'retry_later',retryAfterSeconds:86400}});const out=await execute(f);assert.equal(out.persist.until,now+86400000);assert.equal(posts(f).length,1);});
test('permanent refusal stops subsequent calls',async()=>{const f=fixture({status:403,reply:{action:'fix_request'}});const out=await execute(f);const g=fixture();assert.equal((await execute(g,{state:out.persist})).state,'operator-review-required');assert.equal(g.calls.length,0);});
test('unknown 2xx does not fabricate a grant',async()=>{const f=fixture({reply:{status:'included'}});const out=await execute(f);assert.equal(out.finalized,false);assert.equal(out.state,'not-confirmed-backoff');assert.equal(out.txHash,undefined);});
