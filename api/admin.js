import { createPublicKey, verify as verifySignature, timingSafeEqual, createHmac } from "node:crypto";
import { isPublicEd25519Did } from "../public/flop-did-utils.js";
import { AdminInputError, AdminStore, verifyAdminPassword } from "./admin-store.js";
import { makePostgresAdminStore } from "./admin-postgres-store.js";
import { distributedLimit } from "./rate-limit.js";

let store;
async function getStore() {
  if (process.env.DATABASE_URL) return await makePostgresAdminStore();
  if (process.env.NODE_ENV === "production") throw new Error("Production admin storage is unavailable until DATABASE_URL is configured");
  return store ||= new AdminStore();
}
function send(res, status, body) { res.setHeader("cache-control", "no-store"); res.setHeader("x-content-type-options", "nosniff"); res.setHeader("referrer-policy", "no-referrer"); return res.status(status).json(body); }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || "").split(";").map(v=>v.trim().split("=")).filter(([k,v])=>k&&v).map(([k,...v])=>[k,decodeURIComponent(v.join("="))])); }
function tokenHash(token) { return createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(token).digest("hex"); }
function secureCookie(req) { return req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production"; }
function checkOrigin(req) { const origin = req.headers.origin; const host = req.headers["x-forwarded-host"] || req.headers.host; if (!host) return false; if (!origin) return req.headers["sec-fetch-site"] === "same-origin"; try { return new URL(origin).host === host; } catch { return false; } }
function didKey(did) {
  if (!isPublicEd25519Did(did)) return null;
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; let n=0n;
  for(const c of did.slice(9)){ const d=alphabet.indexOf(c); if(d<0)return null; n=n*58n+BigInt(d); }
  const bytes=[]; while(n){bytes.unshift(Number(n&255n));n>>=8n;} for(const c of did.slice(9)){if(c!=="1")break;bytes.unshift(0);}
  if(bytes.length!==34||bytes[0]!==0xed||bytes[1]!==1)return null;
  return createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),Buffer.from(bytes.slice(2))]),format:"der",type:"spki"});
}
function verifyDid(did, message, signature) {
  try { const key=didKey(did); const sig=Buffer.from(signature,"base64url"); return !!key&&sig.length===64&&sig.toString("base64url")===signature&&verifySignature(null,Buffer.from(message),key,sig); } catch { return false; }
}
async function verifyWallet(address, message, signature) {
  try { const { signatureVerify } = await import("@polkadot/util-crypto"); const result=signatureVerify(message,signature,address); return result.isValid===true&&result.crypto!="none"; } catch { return false; }
}
async function getSession(req, db) { const c=cookies(req); if(!c.rd_admin||!c.rd_csrf)return null; const session=await db.session(c.rd_admin); if(!session)return null; const expected=createHmac("sha256",c.rd_admin).update("csrf").digest("hex"); const a=Buffer.from(c.rd_csrf),b=Buffer.from(expected); return a.length===b.length&&timingSafeEqual(a,b)?{token:c.rd_admin}:null; }

export default async function handler(req,res) {
  let db;
  try { db=await getStore(); } catch { return send(res,503,{error:"Admin database unavailable"}); }
  try {
  const path=new URL(req.url||"/api/admin","http://localhost").searchParams;
  const action=path.get("action")||req.body?.action||"";
  if(req.method==="POST"&&action==="login") {
    if(!checkOrigin(req)) return send(res,403,{error:"Request origin rejected"});
    if(!process.env.ADMIN_PASSWORD_HASH||!process.env.ADMIN_SESSION_SECRET) return send(res,503,{error:"Admin authentication is not configured"});
    if(!await distributedLimit(`login:${String(req.headers["x-real-ip"]||req.socket?.remoteAddress||"unknown").slice(0,96)}`,5,15*60_000,()=>db.allowRate(`login:${String(req.headers["x-real-ip"]||req.socket?.remoteAddress||"unknown").slice(0,96)}`,5,15*60_000))) return send(res,429,{error:"Try again later"});
    if(!verifyAdminPassword(req.body?.password,process.env.ADMIN_PASSWORD_HASH)) return send(res,401,{error:"Invalid credentials"});
    const token=await db.createSession(process.env.ADMIN_ACTOR||"admin"); const csrf=createHmac("sha256",token).update("csrf").digest("hex"); const secure=secureCookie(req)?"; Secure":"";
    res.setHeader("set-cookie",[`rd_admin=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict${secure}`,`rd_csrf=${csrf}; Path=/; SameSite=Strict${secure}`]);
    return send(res,200,{ok:true});
  }
  if(req.method==="POST"&&action==="application-challenge") {
    if(!await distributedLimit(`apply:${String(req.headers["x-real-ip"]||req.socket?.remoteAddress||"unknown").slice(0,96)}`,10,60*60_000,()=>db.allowRate(`apply:${String(req.headers["x-real-ip"]||req.socket?.remoteAddress||"unknown").slice(0,96)}`,10,60*60_000))) return send(res,429,{error:"Application rate limit exceeded"});
    try { return send(res,200,await db.issueChallenge({did:req.body?.did,wallet:req.body?.wallet})); } catch(e) { if(e instanceof AdminInputError) return send(res,400,{error:e.message}); throw e; }
  }
  if(req.method==="POST"&&action==="application-submit") {
    if(!await distributedLimit(`submit:${String(req.headers["x-real-ip"]||req.socket?.remoteAddress||"unknown").slice(0,96)}`,5,60*60_000,()=>db.allowRate(`submit:${String(req.headers["x-real-ip"]||req.socket?.remoteAddress||"unknown").slice(0,96)}`,5,60*60_000))) return send(res,429,{error:"Application submission rate limit exceeded"});
    try { return send(res,201,await db.submitApplication({challengeId:req.body?.challengeId,didSignature:req.body?.didSignature,walletSignature:req.body?.walletSignature,verifyDid,verifyWallet})); } catch(e) { if(e instanceof AdminInputError) return send(res,400,{error:e.message}); throw e; }
  }
  const session=await getSession(req,db);
  if(req.method==="POST"&&action==="logout") { if(!session||!checkOrigin(req)) return send(res,403,{error:"Admin session required"}); await db.revokeSession(session.token,process.env.ADMIN_ACTOR||"admin"); res.setHeader("set-cookie",["rd_admin=; Path=/api/admin; Max-Age=0; HttpOnly; SameSite=Strict","rd_csrf=; Path=/; Max-Age=0; SameSite=Strict"]); return send(res,200,{ok:true}); }
  if(req.method==="GET"&&action==="session") return send(res,200,{authenticated:!!session,emergencyStop:await db.isStopped()});
  if(!session||!checkOrigin(req)||req.headers["x-csrf-token"]!==cookies(req).rd_csrf) return send(res,403,{error:"Admin session and CSRF protection required"});
  const actor=process.env.ADMIN_ACTOR||"admin";
  if(req.method==="GET"&&action==="applications") return send(res,200,{applications:await db.listApplications(),audit:await db.auditLog(),emergencyStop:await db.isStopped()});
  if(req.method==="POST"&&action==="review") { try{return send(res,200,{application:await db.reviewApplication({...req.body,actor})});}catch(e){if(e instanceof AdminInputError)return send(res,400,{error:e.message});throw e;} }
  if(req.method==="POST"&&action==="revoke") { try{return send(res,200,{application:await db.revoke({...req.body,actor})});}catch(e){if(e instanceof AdminInputError)return send(res,400,{error:e.message});throw e;} }
  if(req.method==="POST"&&action==="emergency-stop") return send(res,200,{emergencyStop:await db.emergencyStop({enabled:req.body?.enabled===true,actor})});
  return send(res,404,{error:"Unknown admin action"});
  } catch {
    return send(res,503,{error:"Admin database operation failed"});
  } finally {
    if (process.env.DATABASE_URL) { try { await db.close(); } catch {} }
  }
}

export const __adminTest={getStore,verifyDid,verifyWallet,reset(){store?.close();store=undefined;}};
