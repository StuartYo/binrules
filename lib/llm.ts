// Nemotron on Nebius Token Factory (OpenAI-compatible). One small fetch client, no SDK.
// The key is read from NEBIUS_API_KEY and is never logged or returned.

export const NEBIUS_BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/";
export const DEFAULT_MODEL = process.env.BINRULES_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

/** USD per million tokens [input, output], from the Token Factory catalog (checked 2026-10-14). */
export const PRICES: Record<string, [number, number]> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": [0.06, 0.24],
  "nvidia/Nemotron-3_5-Lightning": [0.06, 0.24],
  "nvidia/nemotron-3-super-120b-a12b": [0.3, 0.9],
  "nvidia/Nemotron-3-Ultra-550b-a55b": [1.0, 3.0],
};

export function costOf(model: string, promptTokens: number, completionTokens: number): number {
  const [pin, pout] = PRICES[model] ?? [1.0, 3.0]; // unknown model: assume the dearest price
  return (promptTokens * pin + completionTokens * pout) / 1_000_000;
}

export interface ChatResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export class LlmUnavailable extends Error {}

type Guard = { before?: () => void; after?: (r: ChatResult) => void };
let guard: Guard = {};
/** Evaluation harness and server budget hook in here to stop spend. */
export function setGuard(g: Guard) {
  guard = g;
}

export function llmConfigured(): boolean {
  return !!process.env.NEBIUS_API_KEY;
}

export async function chat(args: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new LlmUnavailable("NEBIUS_API_KEY is not set");
  const model = args.model ?? DEFAULT_MODEL;
  guard.before?.();
  const body = {
    model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    max_tokens: args.maxTokens ?? 300,
    temperature: 0,
    response_format: { type: "json_object" },
    chat_template_kwargs: { enable_thinking: false },
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 25_000);
    try {
      const res = await fetch(new URL("chat/completions", NEBIUS_BASE_URL), {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        throw new LlmUnavailable(`model API refused the request (HTTP ${res.status})`);
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = j.choices?.[0]?.message?.content ?? "";
      const pt = j.usage?.prompt_tokens ?? 0;
      const ct = j.usage?.completion_tokens ?? 0;
      const out: ChatResult = { content, model, promptTokens: pt, completionTokens: ct, costUsd: costOf(model, pt, ct) };
      guard.after?.(out);
      return out;
    } catch (err) {
      if (err instanceof LlmUnavailable) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LlmUnavailable(`model API failed: ${(lastErr as Error)?.message ?? "unknown error"}`);
}

/** Parse the first JSON object in a model reply; null if there is none. */
export function parseJson<T = Record<string, unknown>>(s: string): T | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
