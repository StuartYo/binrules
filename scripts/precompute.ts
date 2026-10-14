// Pre-computes the example chips with the same pipeline the live site uses, so they cost nothing at runtime.
//   tsx scripts/precompute.ts
import fs from "node:fs";
import path from "node:path";
import { ask } from "../lib/engine";
import { askModelAlone } from "../lib/baseline";
import { tokens } from "../lib/text";
import type { CityId } from "../lib/types";

const EXAMPLES: [CityId, string][] = [
  ["brisbane", "pizza box"],
  ["brisbane", "takeaway coffee cup"],
  ["brisbane", "yoghurt tubs"],
  ["brisbane", "old iPhone"],
  ["brisbane", "kitchen sponge"],
  ["brisbane", "bicycle helmet"],
  ["toronto", "pizza box"],
  ["toronto", "plastic straw"],
  ["toronto", "kitchen sponge"],
  ["toronto", "tea strainer"],
];

(async () => {
  const out: Record<string, unknown> = {};
  for (const [city, q] of EXAMPLES) {
    const [answer, baseline] = await Promise.all([ask(city, q), askModelAlone(city, q)]);
    out[`${city}|${tokens(q).join(" ")}`] = { answer, baseline, computed: new Date().toISOString().slice(0, 10) };
    console.log(city, q, "->", answer.status, answer.entries.map((e) => e.name).join(" / ") || "-", "| model alone:", baseline.bin);
  }
  fs.writeFileSync(path.join(__dirname, "..", "data", "examples.json"), JSON.stringify(out, null, 1) + "\n");
})();
