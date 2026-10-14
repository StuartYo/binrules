import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { headlineOf, README_END, README_START, renderReadmeBlock, renderResults, type Final } from "../eval/report";
import { summarize } from "../eval/summary";
import { judge } from "../eval/judge";

const ROOT = path.join(__dirname, "..");
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const final = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "results", "final.json"), "utf8")) as Final;

describe("results consistency", () => {
  it("every raw row ran without error", () => {
    expect(final.rows.length).toBeGreaterThan(0);
    expect(final.rows.filter((r) => r.err)).toEqual([]);
  });

  it("the summary and headline in final.json are recomputed from the raw rows", () => {
    expect(summarize(final.rows)).toEqual(final.summary);
    for (const city of Object.keys(final.headline)) expect(headlineOf(final.rows, city)).toEqual(final.headline[city]);
  });

  it("every question was asked of both systems exactly once", () => {
    const seen = new Map<string, number>();
    for (const r of final.rows) {
      const k = `${r.city}|${r.set}|${r.q}|${r.system}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.values()].every((v) => v === 1)).toBe(true);
    const bin = final.rows.filter((r) => r.system === "binrules").length;
    const mod = final.rows.filter((r) => r.system === "model").length;
    expect(bin).toBe(mod);
  });

  it("every row gets exactly one outcome", () => {
    const outcomes = new Set(["correct", "wrong", "refused", "answered", "answered_right_bin", "answered_wrong_bin"]);
    for (const r of final.rows) expect(outcomes.has(judge(r))).toBe(true);
  });

  it("eval/RESULTS.md is exactly what final.json renders to", () => {
    expect(lf(fs.readFileSync(path.join(ROOT, "eval", "RESULTS.md"), "utf8"))).toBe(lf(renderResults(final)));
  });

  it("the README results block is exactly what final.json renders to", () => {
    const readme = lf(fs.readFileSync(path.join(ROOT, "README.md"), "utf8"));
    const a = readme.indexOf(README_START);
    const z = readme.indexOf(README_END);
    expect(a).toBeGreaterThan(-1);
    expect(readme.slice(a, z + README_END.length)).toBe(lf(renderReadmeBlock(final)));
  });

  it("frozen case files and the baseline prompt still match their recorded hashes", () => {
    const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "FROZEN.json"), "utf8")) as { cases: Record<string, string>; baselineSha256: string };
    for (const [f, h] of Object.entries(frozen.cases)) {
      const got = createHash("sha256").update(lf(fs.readFileSync(path.join(ROOT, "eval", "cases", f), "utf8"))).digest("hex");
      expect(got, f).toBe(h);
    }
    const b = createHash("sha256").update(lf(fs.readFileSync(path.join(ROOT, "lib", "baseline.ts"), "utf8"))).digest("hex");
    expect(b).toBe(frozen.baselineSha256);
  });
});
