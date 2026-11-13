// Offline actual app.js crypto / backup / DID / proof tests; no real HTTP calls or persistent writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {isPublicEd25519Did} from '../public/flop-did-utils.js';

const path = new URL('../public/app.js', import.meta.url);
const source = readFileSync(path, 'utf8');
const elements = new Map();
const mk = () => ({value:'',textContent:'',href:'',src:'',disabled:false,dataset:{},onclick:null,onchange:null,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},setAttribute(){},getAttribute(){return null},appendChild(){},querySelector(){return mk()},addEventListener(){},click(){},scrollIntoView(){},innerHTML:''});
function element(sel){if(!elements.has(sel))elements.set(sel,mk());return elements.get(sel);}
let promptReturn = '', fetchCalls=[], clicks=[], toasts=[];
const storage = new Map();
const dom={querySelector:element,querySelectorAll(){return []},createElement(type){const el=mk();if(type==='a'){el.click=function(){clicks.push({name:el.download})}}return el}};
const context=vm.createContext({
  document:dom, window:{APP_CONFIG:{brandName:'RedDragon'},RD_I18N:{t:(key)=>key,language:()=> 'tr'}},
  crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Date,BigInt,Blob,URL,console:{error(){}},
  btoa,atob,prompt(){return promptReturn},confirm(){return true},
  setTimeout(){return 1},clearTimeout(){},navigator:{clipboard:{writeText:async()=>{}}},
  localStorage:{getItem:(k)=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:(k)=>storage.delete(k)},
  fetch:async(url,opts)=>{fetchCalls.push({url,method:opts?.method||'GET',data:opts?.body?JSON.parse(opts.body):null});return {ok:true,text:async()=>'{"seq":12345}'}},
  location:{reload(){}},
});
vm.runInContext(source,context,{filename:'public/app.js'});
const run=code=>vm.runInContext(code,context);
const getState=()=>run('state');
const results=[];
async function check(name,fn){await test(name,fn);}
function setup(pass='demo-only-not-secret-2026'){element('#pass1').value=pass;element('#pass2').value=pass}
function getDidKey(did){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of did.slice('did:key:z'.length))n=n*58n+BigInt(alphabet.indexOf(c));const bytes=[];while(n>0n){bytes.unshift(Number(n&255n));n>>=8n;}return new Uint8Array(bytes.slice(2));}
const clone=val=>JSON.parse(JSON.stringify(val));
setup();
await check('Ed25519 DID üretimi ve biçim',async()=>{await run('createIdentity()');const s=getState();assert.match(s.did,/^did:key:z6Mk/);assert.equal(isPublicEd25519Did(s.did),true);assert.equal(s.publicKeyRaw.length,32);assert.equal(s.privateKeyPkcs8.length,48);return 'Gerçek uygulama createIdentity() çalıştı';});
const originalDid=getState().did;
const backup=clone(getState().backup);
await check('AES-256-GCM + PBKDF2 yedek alanları',()=>{assert.equal(backup.kdf,'PBKDF2-SHA256-310000');assert.equal(backup.cipher,'AES-256-GCM');assert.equal(backup.version,3);assert.equal(backup.did,originalDid);assert.equal(run('fromB64u')(backup.saltB64u).length,16);assert.equal(run('fromB64u')(backup.ivB64u).length,12);assert.ok(!JSON.stringify(backup).includes(Buffer.from(getState().privateKeyPkcs8).toString('base64')));});
await check('Ed25519 imzası doğru DID public key ile doğrulanıyor',async()=>{const v=await run('sign("lobby", "test message")');const key=await webcrypto.subtle.importKey('raw',getDidKey(v.did),{name:'Ed25519'},false,['verify']);const payload=new TextEncoder().encode(`lobby|${v.nonce}|${v.text}`);assert.equal(await webcrypto.subtle.verify({name:'Ed25519'},key,run('fromB64u')(v.sig),payload),true);assert.equal(await webcrypto.subtle.verify({name:'Ed25519'},key,run('fromB64u')(v.sig),new TextEncoder().encode('lobby|wrong|test message')),false);});
await check('Yedek indirme akışı',()=>{run('document.querySelector("#backupBtn").onclick()');assert.ok(clicks.length>0);assert.match(clicks.at(-1).name,/reddragon-technocore-.*\.json/);});
const file=(o)=>({text:async()=>JSON.stringify(o)});
await check('Doğru parola ile yedek geri yükleme',async()=>{getState().did='';promptReturn='demo-only-not-secret-2026';await run('restore')(file(backup));assert.equal(getState().did,originalDid);});
await check('Yanlış parola yedeği açamaz',async()=>{getState().did='sentinel';promptReturn='bad-pass';await run('restore')(file(backup));assert.equal(getState().did,'sentinel');});
await check('Değiştirilmiş şifreli içerik reddedilir',async()=>{const bad=clone(backup);const c=run('fromB64u')(bad.ciphertextB64u);c[3]^=0x01;bad.ciphertextB64u=run('b64u')(c);promptReturn='demo-only-not-secret-2026';getState().did='sentinel2';await run('restore')(file(bad));assert.equal(getState().did,'sentinel2');});
await check('Bozuk JSON yedek reddedilir',async()=>{getState().did='sentinel3';await run('restore')({text:async()=>'{bad-json'});assert.equal(getState().did,'sentinel3');});
await check('Geçersiz DID biçimleri reddedilir',()=>{for(const invalid of ['did:example:123','did:key:z6Mk0invalid','did:key:z6Mkabc','did:key:z6MkiIinvalid'])assert.equal(isPublicEd25519Did(invalid),false);});
await check('İmzalı hello akışı gerçek API yazmadan test edilebilir',async()=>{promptReturn='demo-only-not-secret-2026';await run('restore')(file(backup));fetchCalls=[];const v=await run('postSigned("lobby", "hello test")');assert.equal(v.room,'lobby');assert.equal(v.seq,12345);assert.equal(fetchCalls[0].data.action,'signedPost');assert.equal(fetchCalls[0].url,'/api/relay');});
await check('Public Proof gerçek app state alanlarını oluşturuyor',()=>{getState().contrib={room:'lobby',seq:12345};const p=run('makeProof()');assert.equal(p.did,originalDid);assert.equal(p.contribution.record.seq,12345);assert.ok(!JSON.stringify(p).includes('privateKeyPkcs8'));assert.ok(!JSON.stringify(p).includes('ciphertextB64u'));});
await check('Tahrif edilmiş public-key alanı geri yüklemede reddediliyor mu?',async()=>{const kp=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);const bogusRaw=new Uint8Array(await webcrypto.subtle.exportKey('raw',kp.publicKey));const bad=clone(backup);bad.publicKeyRawB64u=run('b64u')(bogusRaw);const expectedDid=originalDid;getState().did='restore-guard';promptReturn='demo-only-not-secret-2026';await run('restore')(file(bad));assert.equal(getState().did,'restore-guard','UYARI: Restore, encrypted private key ile eşleşmeyen public key alanını kabul ediyor!');});

await check('Yedekteki DID metni değiştirilirse reddedilir',async()=>{
  const bad=clone(backup);bad.did='did:key:z6MkfakePublicDid';
  getState().did='guard-did';promptReturn='demo-only-not-secret-2026';
  await run('restore')(file(bad));assert.equal(getState().did,'guard-did');
});
await check('Yedekteki fingerprint değiştirilirse reddedilir',async()=>{
  const bad=clone(backup);bad.fingerprint='0000000000000000';
  getState().did='guard-fingerprint';promptReturn='demo-only-not-secret-2026';
  await run('restore')(file(bad));assert.equal(getState().did,'guard-fingerprint');
});
await check('Yanlış backup formatı reddedilir',async()=>{
  const bad=clone(backup);bad.format='untrusted-format';
  getState().did='guard-format';promptReturn='demo-only-not-secret-2026';
  await run('restore')(file(bad));assert.equal(getState().did,'guard-format');
});

