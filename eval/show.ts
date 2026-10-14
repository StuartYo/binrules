// Quick console view of one or more raw result files: tsx eval/show.ts eval/results/dev-1.json [--wrong]
import fs from "node:fs";
import { judge, type Row } from "./judge";
import { line, summarize } from "./summary";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const wrong = process.argv.includes("--wrong");
const rows: Row[] = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).rows as Row[]);
const s = summarize(rows);
for (const [key, v] of Object.entries(s)) {
  console.log(`== ${key}`);
  for (const sys of ["binrules", "model"] as const) if (v[sys].n) console.log("  " + line(sys, v[sys]));
}
const errs = rows.filter((r) => r.err).length;
console.log(`rows ${rows.length}, errors ${errs}, usd ${rows.reduce((a, r) => a + r.usd, 0).toFixed(4)}`);
if (wrong) {
  for (const r of rows) {
    const o = judge(r);
    const bad = (r.set === "official" || r.set === "messy") ? o === "wrong" || (r.system === "binrules" && o === "refused") : o === "answered" || o === "answered_right_bin" || o === "answered_wrong_bin";
    if (bad) console.log(`[${r.system}] ${r.set} ${o} :: ${r.q}  => ${r.system === "binrules" ? (r.entries ?? []).join(",") + " " + (r.reason ?? "") : (r.bin ?? "") + " (acceptable: " + r.acceptBins.join(",") + ")"}`);
  }
}
