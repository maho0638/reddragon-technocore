import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { cryptoWaitReady, mnemonicGenerate } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { hashAdminPassword, verifyAdminPassword } from "../../api/admin-store.js";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const require=createRequire(import.meta.url); const {chromium,firefox,webkit}=require("playwright");
function base58(bytes) {
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value=0n;for(const byte of bytes)value=(value<<8n)+BigInt(byte);
  let encoded="";while(value>0n){encoded=alphabet[Number(value%58n)]+encoded;value/=58n;}
  for(const byte of bytes){if(byte===0)encoded="1"+encoded;else break;}return encoded||"1";
}
function testDid() {
  const keys=generateKeyPairSync("ed25519"),raw=keys.publicKey.export({format:"der",type:"spki"}).subarray(-32);
  return {did:"did:key:z"+base58(Buffer.concat([Buffer.from([0xed,0x01]),raw])),privateKey:keys.privateKey};
}
function signDid(identity,message){return sign(null,Buffer.from(message),identity.privateKey).toString("base64url");}
function signWallet(pair,message){return "0x"+Buffer.from(pair.sign(message)).toString("hex");}
const browserType={chromium,firefox,webkit}[process.env.PLAYWRIGHT_BROWSER||"chromium"];
assert.ok(browserType,"Unsupported PLAYWRIGHT_BROWSER");
assert.ok(browserType,"Unsupported PLAYWRIGHT_BROWSER");
async function assertLinkRecords(page, pageName) {
  const links = await page.locator("a[href]").evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ href: node.getAttribute("href"), target: node.getAttribute("target"), rel: node.getAttribute("rel") || "", text: (node.textContent || "").trim().slice(0, 60) })));
  for (const [index, link] of links.entries()) {
    assert.ok(link.href && !/^(javascript|data):/i.test(link.href), pageName + " link #" + (index + 1) + " has a usable href");
    if (/^https:/i.test(link.href) && link.target === "_blank") assert.match(link.rel, /noopener|noreferrer/i, pageName + " external link #" + (index + 1) + " protects opener");
    console.log("[QA] link acceptance PASS " + pageName + " #" + (index + 1) + ": " + JSON.stringify(link));
  }
}
let browser,server,origin;
before(async()=>{
  browser=await browserType.launch({headless:true});const port=42_000+Math.floor(Math.random()*1_000);origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,["scripts/local-preview-server.mjs"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ADMIN_DB_PATH:`/tmp/rd-admin-browser-${process.pid}.sqlite`},stdio:"ignore"});
  const deadline=Date.now()+8_000;while(Date.now()<deadline){try{const r=await fetch(origin);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error("Admin browser preview did not start");
});
after(async()=>{await browser?.close();if(server&&server.exitCode===null){server.kill("SIGTERM");await new Promise(r=>server.once("exit",r));}});

test("application and administrator flows fail closed without wallet/service configuration",async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${origin}/apply.html`);await assertLinkRecords(page,"apply");assert.equal(await page.title(),"RedDragon · Apply for permissions");await page.getByRole("button",{name:"Request one-time challenge"}).click();await assert.doesNotReject(page.getByRole("status").waitFor({state:"visible"}));assert.match(await page.locator("#status").textContent(),/DID and connect/);
  await page.goto(`${origin}/admin.html`);await assertLinkRecords(page,"admin");await page.getByLabel("Administrator password").fill("not-a-configured-secret");await page.getByRole("button",{name:"Sign in"}).click();await page.getByRole("status").waitFor();assert.match(await page.locator("#loginStatus").textContent(),/not configured/i);assert.equal(await page.locator("#adminPanel").isVisible(),false);assert.deepEqual(errors,[]);await page.close();
});

test("application challenge interface rejects invalid public identifiers without making an external request",async()=>{
  const page=await browser.newPage();await page.goto(`${origin}/apply.html`);await page.locator('[name="did"]').fill("invalid");await page.locator('[name="wallet"]').fill("invalid");await page.locator("#account").evaluate(el=>{el.disabled=false;const o=document.createElement("option");o.value="invalid";el.append(o);el.value="invalid";});await page.getByRole("button",{name:"Request one-time challenge"}).click();await page.waitForFunction(()=>document.querySelector("#status").textContent.includes("Valid DID"));assert.equal(await page.locator("#challenge").isVisible(),false);await page.close();
});

test("new application and admin screens switch between Turkish and English",async()=>{
  const page=await browser.newPage();await page.goto(`${origin}/apply.html`);await page.locator("#pageLanguage").selectOption("tr");assert.equal(await page.locator("h1").textContent(),"Topluluk izni başvurusu");await page.goto(`${origin}/admin.html`);await page.locator("#pageLanguage").selectOption("tr");assert.equal(await page.locator("h1").textContent(),"Yönetici");await page.close();
});

test("configured administrator can approve and reject, revoke, stop, inspect audit and log out",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"rd-admin-actions-")),dbPath=join(dir,"admin.sqlite"),port=43_000+Math.floor(Math.random()*1_000),testOrigin=`http://127.0.0.1:${port}`;
  const password="temporary browser test password 2026",sessionSecret=randomBytes(32).toString("base64url");
  const childEnv={...process.env,PORT:String(port),ADMIN_DB_PATH:dbPath,ADMIN_PASSWORD_HASH:hashAdminPassword(password),ADMIN_SESSION_SECRET:sessionSecret,ADMIN_ACTOR:"browser-test-admin",NODE_ENV:"test"};
  delete childEnv.DATABASE_URL;delete childEnv.UPSTASH_REDIS_REST_URL;delete childEnv.UPSTASH_REDIS_REST_TOKEN;
  const appId=`browser-${randomBytes(8).toString("hex")}`,approvedDid="did:key:z6Mkuq5Jc7KZki3G98xZVW8fLkqV2oyNNM6FQGgYgq8ZQJYq",rejectedDid=`did:key:browser-reject-${randomBytes(4).toString("hex")}`;let adminServer;let page;let context;
  try {
    adminServer=spawn(process.execPath,["scripts/local-preview-server.mjs"],{cwd:process.cwd(),env:childEnv,stdio:"ignore"});
    const deadline=Date.now()+8_000;let ready=false;while(Date.now()<deadline){try{const r=await fetch(`${testOrigin}/api/admin?action=session`);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true,"configured admin test API should become available");
    const db=new DatabaseSync(dbPath);const seed=db.prepare("INSERT INTO applications(id,did,wallet,created_at) VALUES(?,?,?,?)");seed.run(appId,approvedDid,"5GrwvaEF5zXb26Fz9rcQpDWSV3mH4YfJ7JY5j9j2QZ3g8d2",Date.now());seed.run(`${appId}-reject`,rejectedDid,"5DAAnWgY9AEuP9dyb1XqZUZm7R8Y9K6M7K2uR7P3x2Q1x8Z1",Date.now()+1);db.close();
    const shouldRecord=!!process.env.FUNCTIONAL_VIDEO_DIR&&process.env.PLAYWRIGHT_BROWSER!=="firefox"&&process.env.PLAYWRIGHT_BROWSER!=="webkit";
    if(shouldRecord)mkdirSync(process.env.FUNCTIONAL_VIDEO_DIR,{recursive:true});
    context=await browser.newContext({viewport:{width:1280,height:900},...(shouldRecord?{recordVideo:{dir:process.env.FUNCTIONAL_VIDEO_DIR,size:{width:1280,height:900}}}:{})});page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(`${testOrigin}/admin.html`);await page.getByLabel("Administrator password").fill(password);await page.getByRole("button",{name:"Sign in"}).click();
    await page.locator("#adminPanel:not([hidden])").waitFor();const approvedCard=page.locator(".application").filter({hasText:approvedDid});await approvedCard.getByRole("checkbox",{name:"Faucet permission"}).check();await approvedCard.getByRole("checkbox",{name:"Inference permission"}).check();
    await approvedCard.getByRole("button",{name:"Approve"}).click();await approvedCard.getByText(/approved/).waitFor();
    const rejectedCard=page.locator(".application").filter({hasText:rejectedDid});await rejectedCard.getByRole("button",{name:"Reject"}).click();await rejectedCard.getByText(/rejected/).waitFor();assert.equal(await rejectedCard.getByRole("button").count(),0,"rejected application must not expose permission controls");
    await page.getByRole("button",{name:"Enable emergency stop"}).click();await page.waitForFunction(()=>document.querySelector("#stopStatus").textContent.includes("ON"));
    await page.getByRole("button",{name:"Disable emergency stop"}).click();await page.waitForFunction(()=>document.querySelector("#stopStatus").textContent.includes("OFF"));
    await page.getByRole("button",{name:"Refresh queue and audit"}).click();await approvedCard.getByRole("button",{name:"Revoke faucet"}).click();await approvedCard.getByRole("button",{name:"Revoke faucet"}).waitFor({state:"detached"});
    await approvedCard.getByRole("button",{name:"Revoke inference"}).click();await approvedCard.getByRole("button",{name:"Revoke inference"}).waitFor({state:"detached"});
    assert.match(await page.locator("#audit").textContent(),/application\.reject/);assert.match(await page.locator("#audit").textContent(),/permission\.inference\.revoked|system\.emergency_stop/);
    await page.getByRole("button",{name:"Sign out"}).click();await page.locator("#loginPanel:not([hidden])").waitFor();assert.deepEqual(errors,[]);
  } finally {
    await page?.close();await context?.close();if(adminServer&&adminServer.exitCode===null){adminServer.kill("SIGTERM");await new Promise(resolve=>adminServer.once("exit",resolve));}rmSync(dir,{recursive:true,force:true});
  }
});

test("applicant form completes real DID and sr25519 wallet signatures through the local API", { timeout: 30000 }, async () => {
  await cryptoWaitReady();
  const dir=mkdtempSync(join(tmpdir(),"rd-apply-ui-")),dbPath=join(dir,"apply.sqlite"),port=45_000+Math.floor(Math.random()*1_000),testOrigin=`http://127.0.0.1:${port}`;
  const childEnv={...process.env,PORT:String(port),ADMIN_DB_PATH:dbPath,ADMIN_PASSWORD_HASH:hashAdminPassword("temporary applicant test password"),ADMIN_SESSION_SECRET:randomBytes(48).toString("base64url"),ADMIN_ACTOR:"ephemeral-ui-applicant",NODE_ENV:"test"};
  delete childEnv.DATABASE_URL;delete childEnv.NEON_INTEGRATION_DATABASE_URL;delete childEnv.UPSTASH_REDIS_REST_URL;delete childEnv.UPSTASH_REDIS_REST_TOKEN;
  const identity=testDid(),wallet=new Keyring({type:"sr25519"}).addFromMnemonic(mnemonicGenerate());let child,page,context;
  try{
    child=spawn(process.execPath,["scripts/local-preview-server.mjs"],{cwd:process.cwd(),env:childEnv,stdio:"ignore"});
    const deadline=Date.now()+8_000;let ready=false;
    while(Date.now()<deadline){try{const response=await fetch(`${testOrigin}/api/admin?action=session`);if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(ready,true,"application API must start against isolated SQLite");
    context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();
    await page.exposeFunction("__rdSignWalletChallenge",data=>signWallet(wallet,Buffer.from(String(data).replace(/^0x/,""),"hex")));
    await page.addInitScript(({address})=>{globalThis.injectedWeb3={qaEphemeralWallet:{enable:async()=>({signer:{signRaw:async({data})=>({signature:await globalThis.__rdSignWalletChallenge(data)})},accounts:{get:async()=>[{address,meta:{name:"Ephemeral QA wallet"}}]}})}}},{address:wallet.address});
    await page.goto(`${testOrigin}/apply.html`);await assertLinkRecords(page,"apply-success");
    await page.locator('[name="did"]').fill(identity.did);
    await page.getByRole("button",{name:"Connect wallet extension"}).click();
    await page.getByRole("status").filter({hasText:"Wallet connected"}).waitFor();
    assert.equal(await page.locator('[name="wallet"]').inputValue(),wallet.address,"selected extension account populates the wallet field");
    await page.getByRole("button",{name:"Request one-time challenge"}).click();
    await page.locator("#challenge:not([hidden])").waitFor();
    const message=await page.locator("#challenge").textContent();
    await page.locator('[name="didSignature"]').fill(signDid(identity,message));
    assert.equal(await page.locator("#submit").isEnabled(),true,"challenge enables the submit control");
    await page.getByRole("button",{name:"Submit application"}).click();
    await page.getByRole("status").filter({hasText:/Application submitted\. Reference:/}).waitFor();
    const db=new DatabaseSync(dbPath);
    const row=db.prepare("SELECT did,wallet,status FROM applications WHERE did=?").get(identity.did);
    db.close();
    assert.ok(row,"API must persist the application");assert.equal(row.did,identity.did);assert.equal(row.wallet,wallet.address);assert.equal(row.status,"pending");
    assert.equal(await page.locator('[name="did"]').inputValue(),"","successful application clears the form");
  }finally{
    await page?.close();await context?.close();
    if(child&&child.exitCode===null){child.kill("SIGTERM");await new Promise(resolve=>child.once("exit",resolve));}
    rmSync(dir,{recursive:true,force:true});
  }
});


test("offline password input and hash action stay local and produce an API-compatible hash",async()=>{
  const page=await browser.newPage();
  const requests=[];page.on("request",request=>{if(/^https?:/i.test(request.url()))requests.push(request.url());});
  const password="temporary offline password test only";
  try{
    await page.goto(pathToFileURL(join(process.cwd(),"../../tools/admin-credentials-offline.html")).href);
    assert.equal(await page.evaluate(()=>location.protocol),"file:");
    assert.equal(await page.evaluate(()=>!!crypto.subtle),true,"offline helper requires Web Crypto");
    await page.locator("#adminPassword").fill(password);
    await page.getByRole("button",{name:"Hash oluştur"}).click();
    await page.waitForFunction(()=>document.querySelector("#passwordHash").value.startsWith("pbkdf2-sha256$"));
    const encoded=await page.locator("#passwordHash").inputValue();
    assert.equal(verifyAdminPassword(password,encoded),true,"browser-generated hash must authenticate through server verifier");
    assert.equal(verifyAdminPassword(password+"x",encoded),false,"wrong password must not match");
    assert.equal(await page.locator("#adminPassword").inputValue(),"","password is cleared after hashing");
    assert.deepEqual(requests,[],"offline credential helper must make no network requests");
  }finally{await page.close();}
});

test("offline session-secret control generates a fresh 384-bit URL-safe value",async()=>{
  const page=await browser.newPage();
  const requests=[];page.on("request",request=>{if(/^https?:/i.test(request.url()))requests.push(request.url());});
  try{
    await page.goto(pathToFileURL(join(process.cwd(),"../../tools/admin-credentials-offline.html")).href);
    await page.getByRole("button",{name:"Oturum sırrı üret"}).click();
    const secret=await page.locator("#sessionSecret").inputValue();
    assert.match(secret,/^[A-Za-z0-9_-]{64}$/);
    await page.getByRole("button",{name:"Oturum sırrı üret"}).click();
    assert.notEqual(await page.locator("#sessionSecret").inputValue(),secret,"each generated session secret must be fresh");
    assert.deepEqual(requests,[],"offline credential helper must make no network requests");
  }finally{await page.close();}
});
