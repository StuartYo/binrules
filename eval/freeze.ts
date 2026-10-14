// Records a SHA-256 of every frozen case file so later edits are visible in git history.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const dir = path.join(__dirname, "cases");
const out: Record<string, string> = {};
for (const f of fs.readdirSync(dir).sort()) out[f] = createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
const prompts = fs.readFileSync(path.join(__dirname, "..", "lib", "baseline.ts"), "utf8");
fs.writeFileSync(path.join(__dirname, "FROZEN.json"), JSON.stringify({ note: "Case files and the model-alone baseline prompt are frozen at this commit. Tuning uses only the dev split.", cases: out, baselineSha256: createHash("sha256").update(prompts).digest("hex") }, null, 1) + "\n");
console.log(out);
