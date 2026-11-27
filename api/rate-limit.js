const SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";

export async function distributedLimit(key, limit, windowMs, fallback) {
  // A configured PostgreSQL store is both the durable state and the shared
  // rate-limit backend. Keep admin state and counters in one free service.
  if (process.env.DATABASE_URL) return fallback();
  const url=process.env.UPSTASH_REDIS_REST_URL, token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return fallback();
  if (!url || !token) throw new Error("Upstash rate-limit configuration is incomplete");
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||!parsed.hostname.endsWith(".upstash.io")||parsed.username||parsed.password) throw new Error("Unsafe Upstash REST URL");
  const response=await fetch(parsed.href,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(["EVAL",SCRIPT,1,`rdrl:${key}`,String(windowMs)]) ,signal:AbortSignal.timeout(2500)});
  if(!response.ok) throw new Error(`Upstash rate-limit returned HTTP ${response.status}`);
  const result=await response.json(); const count=Number(result?.result);
  if(!Number.isSafeInteger(count)||count<1) throw new Error("Invalid Upstash rate-limit response");
  return count<=limit;
}
