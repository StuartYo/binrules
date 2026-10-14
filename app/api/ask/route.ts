import { NextResponse } from "next/server";
import { ask, lexicalAsk } from "@/lib/engine";
import { askModelAlone } from "@/lib/baseline";
import { getCity, isCity, sourceLinks } from "@/lib/cities";
import { admit, remaining } from "@/lib/budget";
import { installSpendGuard } from "@/lib/guard";
import { llmConfigured, LlmUnavailable } from "@/lib/llm";
import { cleanQuery, tokens } from "@/lib/text";
import type { Answer, BaselineAnswer, CityId } from "@/lib/types";
import examples from "@/data/examples.json";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Saved = { answer: Answer; baseline: BaselineAnswer | null; computed: string };
const EXAMPLES = examples as unknown as Record<string, Saved>;

const cache = new Map<string, { at: number; value: Saved }>();
const TTL = 24 * 3600 * 1000;

const keyOf = (city: CityId, q: string) => `${city}|${tokens(q).join(" ")}`;

function clientIp(req: Request): string {
  const f = req.headers.get("x-forwarded-for");
  return (f ? f.split(",")[0] : req.headers.get("x-real-ip") || "unknown").trim();
}

function decorate(city: CityId, answer: Answer) {
  const c = getCity(city);
  return {
    ...answer,
    entries: answer.entries.map((e) => ({ ...e, links: sourceLinks(c, e) })),
  };
}

export async function POST(req: Request) {
  installSpendGuard();
  let body: { city?: unknown; item?: unknown; compare?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON like {\"city\":\"brisbane\",\"item\":\"pizza box\"}." }, { status: 400 });
  }
  if (!isCity(body.city)) return NextResponse.json({ error: "Unknown city." }, { status: 400 });
  if (typeof body.item !== "string") return NextResponse.json({ error: "Missing item." }, { status: 400 });
  const city = body.city;
  const item = cleanQuery(body.item);
  if (tokens(item).length === 0) return NextResponse.json({ error: "Type the name of an item, for example \"pizza box\"." }, { status: 400 });
  const compare = body.compare !== false;
  const key = keyOf(city, item);
  const out = (s: Saved, extra: Record<string, unknown>) =>
    NextResponse.json({ answer: decorate(city, s.answer), baseline: compare ? s.baseline : null, computed: s.computed, remaining: remaining(), ...extra });

  // 1. saved examples and the 24 h cache cost nothing
  const saved = EXAMPLES[key];
  if (saved && (saved.baseline || !compare)) return out(saved, { source: "saved-example" });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL && (hit.value.baseline || !compare)) return out(hit.value, { source: "cache" });

  // 2. model-backed answer, inside the daily caps
  const adm = llmConfigured() ? admit(clientIp(req)) : ({ ok: false, kind: "global", reason: "The language model is not configured on this deployment." } as const);
  if (!adm.ok && adm.kind === "ip") {
    return NextResponse.json({ error: adm.reason }, { status: 429, headers: { "Retry-After": String(adm.retryAfterSec) } });
  }
  if (adm.ok) {
    try {
      const [answer, baseline] = await Promise.all([
        ask(city, item),
        compare ? askModelAlone(city, item).catch(() => null) : Promise.resolve(null),
      ]);
      const value: Saved = { answer, baseline, computed: new Date().toISOString().slice(0, 10) };
      if (cache.size > 500) cache.clear();
      cache.set(key, { at: Date.now(), value });
      return out(value, { source: "live" });
    } catch (e) {
      if (!(e instanceof LlmUnavailable)) {
        return NextResponse.json({ error: "Something went wrong while checking that item. Try again in a moment." }, { status: 502 });
      }
      // fall through to the labelled fallback
    }
  }

  // 3. labelled fallback: word-for-word lookup, no model
  const answer = lexicalAsk(city, item);
  const reason = adm.ok ? "The language model is unavailable right now." : adm.reason;
  return out({ answer, baseline: null, computed: new Date().toISOString().slice(0, 10) }, { source: "fallback", fallbackReason: reason });
}

export async function GET() {
  return NextResponse.json({ ok: true, llm: llmConfigured(), remaining: remaining() });
}
