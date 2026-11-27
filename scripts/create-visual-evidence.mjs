import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
const require=createRequire(import.meta.url); const {chromium,firefox,webkit}=require("playwright");
const browserName=process.env.PLAYWRIGHT_BROWSER||"chromium", browserType={chromium,firefox,webkit}[browserName];
if(!browserType)throw new Error(`Unsupported PLAYWRIGHT_BROWSER: ${browserName}`);
const root=process.cwd(), out=path.join(root,"test-results/visual-evidence",browserName), shots=path.join(out,"screenshots"), videos=path.join(out,"videos");
await rm(shots,{recursive:true,force:true}); await rm(videos,{recursive:true,force:true}); await mkdir(shots,{recursive:true}); await mkdir(videos,{recursive:true});
const port=43871, origin=`http://127.0.0.1:${port}`;
const routes=[{name:"home",url:"/",selector:lang=>`#rdLangSwitcher button[data-lang="${lang}"]`},{name:"flop",url:"/flop",selector:()=>`#rdFlopLanguage`},{name:"apply",url:"/apply.html",selector:()=>`#pageLanguage`},{name:"admin",url:"/admin.html",selector:()=>`#pageLanguage`},{name:"not-found",url:"/__visual-evidence-not-found__",selector:()=>`#rd404Language`}];
const env={...process.env,PORT:String(port)}; for(const key of ["DATABASE_URL","NEON_INTEGRATION_DATABASE_URL","ADMIN_PASSWORD_HASH","ADMIN_SESSION_SECRET","ADMIN_ACTOR"]) delete env[key];
const server=spawn(process.execPath,["scripts/local-preview-server.mjs"],{cwd:root,env,stdio:"ignore"}); let browser;
try {
 let ready=false; const until=Date.now()+10000; while(Date.now()<until){try{if((await fetch(origin)).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));} if(server.exitCode!==null||!ready)throw Error("Local preview failed to start");
 browser=await browserType.launch({headless:true});
 for(const viewport of [{name:"320",width:320,height:740},{name:"390",width:390,height:844},{name:"768",width:768,height:900},{name:"1440",width:1440,height:900}]){
  const ctx=await browser.newContext({viewport,recordVideo:{dir:videos,size:viewport}}); const page=await ctx.newPage();
  await page.route("**/*",async route=>{const u=new URL(route.request().url()); if(u.hostname!=="127.0.0.1")return route.abort(); if(u.pathname==="/api/flop-status"||u.pathname==="/api/relay")return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Unavailable in isolated visual audit"})}); return route.continue();});
  for(const item of routes){await page.goto(origin+item.url,{waitUntil:"domcontentloaded"}); for(const lang of ["tr","en"]){const selector=item.selector(lang); if(item.name==="home") await page.locator(selector).click(); else await page.locator(selector).selectOption(lang); await page.waitForTimeout(250); await page.screenshot({path:path.join(shots,`${browserName}-${viewport.name}-${item.name}-${lang}.png`),fullPage:true});}}
  await page.close(); await ctx.close();
 }
} finally {if(browser)await browser.close(); server.kill("SIGTERM");}
console.log(`Visual evidence captured: ${browserName}; ${routes.length} pages x 2 languages x 4 viewports; 4 navigation videos.`);
