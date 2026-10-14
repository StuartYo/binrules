// Pre-computes the example chips with the same pipeline the live site uses, so they cost nothing at runtime.
//   tsx scripts/precompute.ts
import fs from "node:fs";
import path from "node:path";
import { ask } from "../lib/engine";
import { askModelAlone } from "../lib/baseline";
import { setGuard } from "../lib/llm";
import { tokens } from "../lib/text";
import type { CityId } from "../lib/types";

export const EXAMPLES: [CityId, string][] = [
  ["brisbane", "pizza box"],
  ["brisbane", "tea bags"],
  ["brisbane", "business cards"],
  ["brisbane", "milk carton"],
  ["brisbane", "kitchen sponge"],
  ["brisbane", "bicycle helmet"],
  ["toronto", "pizza box"],
  ["toronto", "plastic straw"],
  ["toronto", "kitchen sponge"],
  ["toronto", "tea strainer"],
];

(async () => {
  let usd = 0;
  setGuard({ after: (r) => (usd += r.costUsd) });
  const out: Record<string, unknown> = {};
  for (const [city, q] of EXAMPLES) {
    const [answer, baseline] = await Promise.all([ask(city, q), askModelAlone(city, q)]);
    out[`${city}|${tokens(q).join(" ")}`] = { answer, baseline, computed: new Date().toISOString().slice(0, 10) };
    console.log(city, q, "->", answer.status, answer.entries.map((e) => e.name).join(" / ") || "-", "| model alone:", baseline.bin);
  }
  fs.writeFileSync(path.join(__dirname, "..", "data", "examples.json"), JSON.stringify(out, null, 1) + "\n");
  const sp = path.join(__dirname, "..", "eval", "results", "spend.json");
  const ledger = JSON.parse(fs.readFileSync(sp, "utf8"));
  ledger.runs.push({ ts: new Date().toISOString(), label: "precompute-examples", usd: +usd.toFixed(6), calls: 0, promptTokens: 0, completionTokens: 0 });
  fs.writeFileSync(sp, JSON.stringify(ledger, null, 1) + "\n");
  console.log("spent", usd.toFixed(5));
})();
