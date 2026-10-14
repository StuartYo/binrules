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
  ["brisbane", "shoes"],
  ["brisbane", "kitchen sponge"],
  ["brisbane", "bicycle helmet"],
];

(async () => {
  let usd = 0;
  setGuard({ after: (r) => (usd += r.costUsd) });
  // Only the examples named on the command line are (re)computed; the rest of data/examples.json is kept as it is.
  //   tsx scripts/precompute.ts            computes any example that has no saved answer yet
  //   tsx scripts/precompute.ts --all      recomputes every example
  const file = path.join(__dirname, "..", "data", "examples.json");
  const out: Record<string, unknown> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const all = process.argv.includes("--all");
  for (const [city, q] of EXAMPLES) {
    if (!all && out[`${city}|${tokens(q).join(" ")}`]) continue;
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
