// Abuse and cost controls. Uses KV when bound (durable across isolates);
// otherwise best-effort in-memory, which still stops casual hammering.

const memory = new Map<string, { count: number; resetAt: number }>();

export interface LimitEnv {
  RATE_LIMIT?: KVNamespace;
}

async function bump(env: LimitEnv, key: string, windowSeconds: number): Promise<number> {
  if (env.RATE_LIMIT) {
    const current = parseInt((await env.RATE_LIMIT.get(key)) ?? "0", 10) + 1;
    // expirationTtl keeps the window rolling without any cleanup job.
    await env.RATE_LIMIT.put(key, String(current), { expirationTtl: Math.max(60, windowSeconds) });
    return current;
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/** Per-IP rate limit. Returns true when the caller is over the limit. */
export async function isRateLimited(env: LimitEnv, ip: string, perMinute: number): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  return (await bump(env, `rl:${ip}:${minute}`, 120)) > perMinute;
}

/** Global daily cap, so a bad day can never become a surprise bill. */
export async function isOverDailyCap(env: LimitEnv, cap: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  return (await bump(env, `day:${day}`, 90_000)) > cap;
}
