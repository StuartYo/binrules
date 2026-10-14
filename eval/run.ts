// Runs the evaluation and writes one raw-results JSON. Usage:
//   tsx eval/run.ts --city brisbane --split dev --sets official,messy,oos,heldout --systems binrules,model --out eval/results/dev-1.json
// Spend is capped per run (--budget) and across the project (eval/results/spend.json, US$2 total).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { ask, ENGINE_DEFAULTS, EXPAND_SYSTEM, expandUser, PICK_SYSTEM, pickUser, verifyUser } from "../lib/engine";
import { askModelAlone, BASELINE_SYSTEM } from "../lib/baseline";
import { DEFAULT_MODEL, setGuard } from "../lib/llm";
import { getCity } from "../lib/cities";
import type { CityId } from "../lib/types";
import { allCases, casesHash, type Case, type SetName, type Split } from "./cases";
import type { Row, System } from "./judge";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => {
  const i = argv.indexOf("--" + k);
  return i > -1 ? argv[i + 1] : d;
};

const city = (arg("city", "brisbane") as CityId);
const split = arg("split", "dev") as Split;
const sets = (arg("sets", "official,messy,oos,heldout") as string).split(",") as SetName[];
const systems = (arg("systems", "binrules,model") as string).split(",") as System[];
const sample = arg("sample") ? Number(arg("sample")) : undefined;
const votes = (Number(arg("votes", String(ENGINE_DEFAULTS.votes))) as 1 | 2);
const k = Number(arg("k", String(ENGINE_DEFAULTS.k)));
const verify = arg("verify", String(ENGINE_DEFAULTS.verify)) === "true";
const model = arg("model", DEFAULT_MODEL)!;
const budget = Number(arg("budget", "0.3"));
const conc = Number(arg("concurrency", "5"));
const limit = arg("limit") ? Number(arg("limit")) : undefined;
const label = arg("label", `${city}-${split}`)!;
const out = arg("out", path.join("eval", "results", `scratch-${label}.json`))!;

const SPEND = path.join(__dirname, "results", "spend.json");
const PROJECT_CAP = 2.0;
const EVAL_STOP = 1.35; // eval never spends past this; the rest is the public demo's allowance

interface SpendFile {
  projectCapUsd: number;
  evalStopUsd: number;
  runs: { ts: string; label: string; usd: number; calls: number; promptTokens: number; completionTokens: number }[];
}
function readSpend(): SpendFile {
  try {
    return JSON.parse(fs.readFileSync(SPEND, "utf8"));
  } catch {
    return { projectCapUsd: PROJECT_CAP, evalStopUsd: EVAL_STOP, runs: [] };
  }
}

function configHash(): string {
  const parts = [
    EXPAND_SYSTEM,
    expandUser("Q"),
    PICK_SYSTEM,
    pickUser("Q", "A", ["x", "y"]),
    verifyUser("Q", "E"),
    BASELINE_SYSTEM("c", "a", ["o"]),
    JSON.stringify({ votes, k, verify, model }),
    fs.readFileSync(path.join(__dirname, "..", "lib", "retrieve.ts"), "utf8"),
    fs.readFileSync(path.join(__dirname, "..", "lib", "text.ts"), "utf8"),
  ];
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: path.join(__dirname, ".."), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

async function main() {
  const spent = readSpend().runs.reduce((s, r) => s + r.usd, 0);
  if (spent + budget > EVAL_STOP + 1e-9) {
    console.error(`Refusing to start: spent so far ${spent.toFixed(4)} + this run's budget ${budget} exceeds the eval stop ${EVAL_STOP}.`);
    process.exit(2);
  }
  let runUsd = 0;
  let runCalls = 0;
  let runPT = 0;
  let runCT = 0;
  setGuard({
    before: () => {
      if (runUsd >= budget) throw new Error("run budget reached");
    },
    after: (r) => {
      runUsd += r.costUsd;
      runCalls++;
      runPT += r.promptTokens;
      runCT += r.completionTokens;
    },
  });

  let cases = allCases(city, split, sets, sample);
  if (limit) cases = cases.slice(0, limit);
  const jobs: { c: Case; system: System }[] = [];
  for (const c of cases) for (const s of systems) jobs.push({ c, system: s });
  console.log(`${label}: ${cases.length} cases x ${systems.join("+")} = ${jobs.length} jobs, model ${model}, votes ${votes}, k ${k}, verify ${verify}, budget $${budget}`);

  const rows: Row[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const base = (c: Case, system: System): Row => ({
    set: c.set, split: c.split, city: c.city, q: c.q, system, accept: c.accept, acceptBins: c.acceptBins, officialBins: c.officialBins,
    kind: c.kind, trap: c.trap, intended: c.intended, usd: 0, calls: 0,
  });

  async function runJob(j: { c: Case; system: System }): Promise<Row> {
    const row = base(j.c, j.system);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (j.system === "binrules") {
          const a = await ask(city, j.c.q, { without: j.c.without ? new Set(j.c.without) : undefined, votes, k, verify, model });
          row.status = a.status;
          row.entries = a.entries.map((e) => e.id);
          row.entryBins = [...new Set(a.entries.flatMap((e) => e.bins.map((b) => b.code)))];
          row.reason = a.reason;
          row.usd = a.usage.costUsd;
          row.calls = a.usage.calls;
        } else {
          const a = await askModelAlone(city, j.c.q, model);
          row.bin = a.bin;
          row.binCode = a.binCode;
          row.reason = a.why;
          row.usd = a.usage.costUsd;
          row.calls = a.usage.calls;
        }
        delete row.err;
        return row;
      } catch (e) {
        row.err = (e as Error).message;
        if (row.err === "run budget reached") break;
      }
    }
    return row;
  }

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= jobs.length) return;
      rows[i] = await runJob(jobs[i]);
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${jobs.length} done, $${runUsd.toFixed(4)}`);
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));

  const errors = rows.filter((r) => r.err).length;
  const meta = {
    label, city, split, sets, systems, sample: sample ?? null, model, votes, k, verify,
    createdAt: new Date().toISOString(),
    configHash: configHash(),
    casesHash: casesHash(city),
    commit: git("rev-parse --short HEAD") || "none",
    dirty: git("status --porcelain lib eval/cases") !== "",
    dataModified: getCity(city).source.modified,
    usd: +runUsd.toFixed(6), calls: runCalls, promptTokens: runPT, completionTokens: runCT, errors,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ meta, rows }, null, 1) + "\n");
  const sp = readSpend();
  sp.runs.push({ ts: meta.createdAt, label, usd: +runUsd.toFixed(6), calls: runCalls, promptTokens: runPT, completionTokens: runCT });
  fs.mkdirSync(path.dirname(SPEND), { recursive: true });
  fs.writeFileSync(SPEND, JSON.stringify(sp, null, 1) + "\n");
  const total = sp.runs.reduce((s, r) => s + r.usd, 0);
  console.log(`wrote ${out}: ${rows.length} rows, ${errors} errors, run $${runUsd.toFixed(4)}, project eval total $${total.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
