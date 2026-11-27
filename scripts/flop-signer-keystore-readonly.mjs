import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, createHash, sign, verify, randomBytes } from 'node:crypto';
import { mkdtemp, chmod, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const ADDRESS='5HBqG8RN2WMPKhwq4AfGEPRBGsn82JQc28JU5pKCYW2QZFtW';
const DID='did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K';
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes){let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=B58[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b)break;s='1'+s;}return s;}
function identity(key){const pub= createPublicKey(key).export({format:'der',type:'spki'}).subarray(12);const body=Buffer.concat([Buffer.from([42]),pub]);const checksum=createHash('blake2b512').update('SS58PRE').update(body).digest().subarray(0,2);const did='did:key:z'+b58(Buffer.concat([Buffer.from([0xed,1]),pub]));return {address:b58(Buffer.concat([body,checksum])),did};}

function run(file,args,env){
  const r=spawnSync(file,args,{env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  if(r.error)throw new Error('CLI could not start');
  if(r.status!==0)throw new Error('CLI exited '+r.status);
  return r.stdout??'';
}

let dir;
try{
  const encoded=process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64??'';
  if(!encoded||!/^[A-Za-z0-9+/]+=*$/.test(encoded))throw new Error('Existing Actions signer unavailable or malformed');
  const key=createPrivateKey({key:Buffer.from(encoded,'base64'),format:'der',type:'pkcs8'});
  const actual=identity(key);
  if(actual.address!==ADDRESS||actual.did!==DID||key.type!=='private')throw new Error('Existing signer identity mismatch: address='+ (actual.address===ADDRESS)+', did='+(actual.did===DID)+', private='+(key.type==='private'));
  const jwk=key.export({format:'jwk'}),seed=Buffer.from(jwk.d??'','base64url');
  if(key.asymmetricKeyType!=='ed25519'||seed.length!==32)throw new Error('Expected existing Ed25519 PKCS8 signer');
  const message=Buffer.from('reddragon-flop-keystore-check/v1');
  const signature=sign(null,message,key);
  assert.equal(verify(null,message,createPublicKey(key),signature),true);
  const password=randomBytes(32).toString('base64url');
  dir=await mkdtemp(join(tmpdir(),'flop-keystore-check-'));
  await chmod(dir,0o700);
  const keystore=join(dir,'existing-agent.json');
  const cli=process.env.FLOP_CLI_PATH;
  if(!cli)throw new Error('Pinned FLOP CLI executable missing');
  const env={...process.env,FLOP_IMPORTED_SECRET:'0x'+seed.toString('hex'),FLOP_KEY_PASSWORD:password};
  run(cli,['keys','import','--type','ed25519','--secret-env','FLOP_IMPORTED_SECRET','--out',keystore,'--password-env','FLOP_KEY_PASSWORD'],env);
  const file=await readFile(keystore,'utf8');
  const json=JSON.parse(file);
  if(json.address!==ADDRESS)throw new Error('Imported keystore address mismatch');
  if(((await stat(keystore)).mode&0o777)!==0o600)throw new Error('Keystore file permissions are not 0600');
  const inspection=run(cli,['keys','inspect',keystore],env);
  if(!inspection.includes(ADDRESS))throw new Error('CLI could not inspect the existing signer address');
  delete env.FLOP_IMPORTED_SECRET;
  delete env.FLOP_KEY_PASSWORD;
  console.log('FLOP_SIGNER_KEYSTORE_CHECK='+JSON.stringify({address:ADDRESS,keyType:'ed25519',existingKeyMatched:true,encryptedKeystore:true,fileMode:'0600',cliCanRead:true,chainWrite:false}));
}catch(e){
  console.error('FLOP_SIGNER_KEYSTORE_BLOCKED='+String(e.message).replace(/0x[0-9a-f]{64,}/gi,'[redacted]').slice(0,180));
  process.exitCode=1;
}finally{
  delete process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64;
  if(dir)await rm(dir,{recursive:true,force:true});
}
