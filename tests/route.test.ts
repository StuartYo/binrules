import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/llm", async (orig) => {
  const actual = await orig<typeof import("../lib/llm")>();
  return {
    ...actual,
    chat: vi.fn(async () => ({ content: "{}", model: "test", promptTokens: 1, completionTokens: 1, costUsd: 0 })),
  };
});

import { POST } from "../app/api/ask/route";
import { _reset } from "../lib/budget";

const call = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://x/api/ask", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  _reset();
  delete process.env.NEBIUS_API_KEY;
  delete process.env.BINRULES_PER_IP_PER_HOUR;
});

describe("POST /api/ask", () => {
  it("rejects bad input", async () => {
    expect((await call({ city: "paris", item: "pizza box" })).status).toBe(400);
    expect((await call({ city: "brisbane" })).status).toBe(400);
    expect((await call({ city: "brisbane", item: "  " })).status).toBe(400);
  });

  it("serves a saved example without touching the model", async () => {
    const r = await call({ city: "brisbane", item: "pizza box" });
    const j = await r.json();
    expect(j.source).toBe("saved-example");
    expect(j.answer.entries[0].links.length).toBeGreaterThan(0);
  });

  it("without a model key it answers word for word and says so", async () => {
    const r = await call({ city: "brisbane", item: "Cling wrap (and snack, sandwich and freezer bags)" });
    const j = await r.json();
    expect(j.source).toBe("fallback");
    expect(j.answer.mode).toBe("lexical-fallback");
    expect(j.fallbackReason).toMatch(/not configured/);
  });

  it("without a model key, a paraphrase is not guessed", async () => {
    const j = await (await call({ city: "brisbane", item: "that greasy box my pizza came in last night" })).json();
    expect(j.source).toBe("fallback");
    expect(j.answer.status).toBe("not_covered");
  });

  it("limits one IP, then lets another IP through", async () => {
    process.env.NEBIUS_API_KEY = "test-key-not-real";
    process.env.BINRULES_PER_IP_PER_HOUR = "1";
    const first = await call({ city: "brisbane", item: "zzz first item" }, "9.9.9.9");
    expect(first.status).toBe(200);
    expect((await first.json()).source).toBe("live");
    const second = await call({ city: "brisbane", item: "zzz second item" }, "9.9.9.9");
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    const other = await call({ city: "brisbane", item: "zzz third item" }, "8.8.8.8");
    expect(other.status).toBe(200);
  });
});
