// Public-demo protection. In-memory per server instance, which is good enough for a hackathon demo
// on one region: the worst case is (instances x daily cap), and the README says so.

export interface Limits {
  perIpPerHour: number;
  perIpPerDay: number;
  globalQueriesPerDay: number;
  globalUsdPerDay: number;
}

export function limits(env: Record<string, string | undefined> = process.env): Limits {
  const n = (k: string, d: number) => {
    const v = Number(env[k]);
    return Number.isFinite(v) && v >= 0 && env[k] !== undefined && env[k] !== "" ? v : d;
  };
  return {
    perIpPerHour: n("BINRULES_PER_IP_PER_HOUR", 15),
    perIpPerDay: n("BINRULES_PER_IP_PER_DAY", 40),
    globalQueriesPerDay: n("BINRULES_GLOBAL_QUERIES_PER_DAY", 150),
    globalUsdPerDay: n("BINRULES_GLOBAL_USD_PER_DAY", 0.05),
  };
}

interface Bucket {
  hour: number;
  hourCount: number;
  day: string;
  dayCount: number;
}

const ipBuckets = new Map<string, Bucket>();
let global = { day: "", queries: 0, usd: 0 };

const today = (now: Date) => now.toISOString().slice(0, 10);

function roll(now: Date) {
  const d = today(now);
  if (global.day !== d) global = { day: d, queries: 0, usd: 0 };
}

export type Admission =
  | { ok: true }
  | { ok: false; kind: "ip"; reason: string; retryAfterSec: number }
  | { ok: false; kind: "global"; reason: string };

/** Counts one model-backed query for this IP. "global" means: answer from the no-model fallback instead. */
export function admit(ip: string, now = new Date(), lim: Limits = limits()): Admission {
  roll(now);
  const hour = Math.floor(now.getTime() / 3_600_000);
  const d = today(now);
  const b = ipBuckets.get(ip) ?? { hour, hourCount: 0, day: d, dayCount: 0 };
  if (b.hour !== hour) {
    b.hour = hour;
    b.hourCount = 0;
  }
  if (b.day !== d) {
    b.day = d;
    b.dayCount = 0;
  }
  if (b.hourCount >= lim.perIpPerHour) {
    return { ok: false, kind: "ip", reason: `Limit of ${lim.perIpPerHour} checks per hour reached. Try again later.`, retryAfterSec: 3600 - (Math.floor(now.getTime() / 1000) % 3600) };
  }
  if (b.dayCount >= lim.perIpPerDay) {
    return { ok: false, kind: "ip", reason: `Limit of ${lim.perIpPerDay} checks per day reached. Try again tomorrow (UTC).`, retryAfterSec: 3600 };
  }
  if (global.queries >= lim.globalQueriesPerDay) {
    return { ok: false, kind: "global", reason: "The public demo reached today's model query limit (it resets at 00:00 UTC)." };
  }
  if (global.usd >= lim.globalUsdPerDay) {
    return { ok: false, kind: "global", reason: "The public demo reached today's model budget (it resets at 00:00 UTC)." };
  }
  b.hourCount++;
  b.dayCount++;
  ipBuckets.set(ip, b);
  global.queries++;
  if (ipBuckets.size > 10_000) ipBuckets.clear();
  return { ok: true };
}

export function recordSpend(usd: number, now = new Date()) {
  roll(now);
  global.usd += usd;
}

export function remaining(now = new Date(), lim: Limits = limits()) {
  roll(now);
  return {
    queries: Math.max(0, lim.globalQueriesPerDay - global.queries),
    usd: Math.max(0, +(lim.globalUsdPerDay - global.usd).toFixed(4)),
  };
}

/** Test helper. */
export function _reset() {
  ipBuckets.clear();
  global = { day: "", queries: 0, usd: 0 };
}
