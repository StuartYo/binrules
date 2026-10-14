import { beforeEach, describe, expect, it } from "vitest";
import { _reset, admit, limits, recordSpend, remaining } from "../lib/budget";

const lim = { perIpPerHour: 2, perIpPerDay: 3, globalQueriesPerDay: 4, globalUsdPerDay: 0.01 };
const t0 = new Date("2026-12-22T10:00:00Z");

describe("public demo caps", () => {
  beforeEach(() => _reset());

  it("limits one IP per hour and per day", () => {
    expect(admit("a", t0, lim).ok).toBe(true);
    expect(admit("a", t0, lim).ok).toBe(true);
    const third = admit("a", t0, lim);
    expect(third.ok).toBe(false);
    expect(!third.ok && third.kind).toBe("ip");
    expect(admit("a", new Date("2026-12-22T11:05:00Z"), lim).ok).toBe(true); // next hour
    const fourth = admit("a", new Date("2026-12-22T12:05:00Z"), lim);
    expect(!fourth.ok && fourth.kind).toBe("ip"); // day limit of 3 reached
    expect(admit("a", new Date("2026-12-23T00:05:00Z"), lim).ok).toBe(true); // next UTC day
  });

  it("falls back to the no-model path when the global query cap is spent", () => {
    for (const ip of ["a", "b", "c", "d"]) expect(admit(ip, t0, lim).ok).toBe(true);
    const r = admit("e", t0, lim);
    expect(!r.ok && r.kind).toBe("global");
  });

  it("falls back when the daily dollar cap is spent, and resets at UTC midnight", () => {
    expect(admit("a", t0, lim).ok).toBe(true);
    recordSpend(0.02, t0);
    const r = admit("b", t0, lim);
    expect(!r.ok && r.kind).toBe("global");
    expect(remaining(t0, lim).usd).toBe(0);
    expect(admit("b", new Date("2026-12-23T00:01:00Z"), lim).ok).toBe(true);
  });

  it("has defaults that keep a full day of queries inside the daily dollar cap", () => {
    const l = limits({});
    expect(l.globalUsdPerDay).toBeLessThanOrEqual(0.05);
    expect(l.globalQueriesPerDay * 0.0006).toBeLessThan(l.globalUsdPerDay * 2);
  });
});
