// Builds eval/results/final.json from the raw test-split result files, then writes eval/RESULTS.md
// and the README results block from that one JSON.   Usage: tsx eval/report.ts
import fs from "node:fs";
import path from "node:path";
import { getCity } from "../lib/cities";
import { binMatch, judge, wilson, type Row, type System } from "./judge";
import { summarize, type Summary } from "./summary";

const ROOT = path.join(__dirname, "..");
const RES = path.join(__dirname, "results");

export interface SysCounts {
  correct: number;
  wrong: number;
  refused: number;
  binOk: number;
}
export interface InScope {
  n: number;
  binrules: SysCounts;
  model: SysCounts;
}
export interface NotCoveredCounts {
  refused: number;
  answered: number;
  answeredRightBin: number;
  answeredWrongBin: number;
}
export interface NotCovered {
  n: number;
  binrules: NotCoveredCounts;
  model: NotCoveredCounts;
}
export interface CityHeadline {
  city: string;
  official: InScope;
  messy: InScope;
  inScope: InScope;
  oos: NotCovered;
  heldout: NotCovered;
  notCovered: NotCovered;
  costPerQuery: Record<System, number>;
}
export interface RunMeta {
  label: string;
  city: string;
  split: string;
  model: string;
  votes: number;
  k: number;
  verify: boolean;
  createdAt: string;
  configHash: string;
  commit: string;
  usd: number;
  calls: number;
  errors: number;
  dataModified: string | null;
  sample: number | null;
}
export interface HistoryItem {
  label: string;
  note: string;
  headline: CityHeadline | null;
  model?: string;
}
export interface Final {
  generated: string;
  runs: RunMeta[];
  rows: Row[];
  summary: Summary;
  headline: Record<string, CityHeadline>;
  history: HistoryItem[];
  day1: { model: string; n: number; counts: SysCounts } | null;
  spend: { evalUsd: number; projectCapUsd: number; evalStopUsd: number };
}

const RUN_FILES = ["brisbane-test.json", "toronto-test.json"];

function inScope(rows: Row[], set: "official" | "messy" | "all"): InScope {
  const pick = (sys: System): SysCounts => {
    const rs = rows.filter((r) => r.system === sys && (set === "all" ? r.set === "official" || r.set === "messy" : r.set === set));
    return {
      correct: rs.filter((r) => judge(r) === "correct").length,
      wrong: rs.filter((r) => judge(r) === "wrong").length,
      refused: rs.filter((r) => judge(r) === "refused").length,
      binOk: rs.filter((r) => binMatch(r)).length,
    };
  };
  const n = rows.filter((r) => r.system === "binrules" && (set === "all" ? r.set === "official" || r.set === "messy" : r.set === set)).length;
  return { n, binrules: pick("binrules"), model: pick("model") };
}

function notCovered(rows: Row[], sets: string[]): NotCovered {
  const pick = (sys: System): NotCoveredCounts => {
    const rs = rows.filter((r) => r.system === sys && sets.includes(r.set));
    const o = rs.map((r) => judge(r));
    return {
      refused: o.filter((x) => x === "refused").length,
      answered: o.filter((x) => x === "answered" || x === "answered_right_bin" || x === "answered_wrong_bin").length,
      answeredRightBin: o.filter((x) => x === "answered_right_bin").length,
      answeredWrongBin: o.filter((x) => x === "answered_wrong_bin").length,
    };
  };
  return { n: rows.filter((r) => r.system === "binrules" && sets.includes(r.set)).length, binrules: pick("binrules"), model: pick("model") };
}

export function headlineOf(rows: Row[], city: string): CityHeadline {
  const rs = rows.filter((r) => r.city === city);
  const cost = (sys: System) => {
    const x = rs.filter((r) => r.system === sys);
    return x.length ? x.reduce((s, r) => s + r.usd, 0) / x.length : 0;
  };
  return {
    city,
    official: inScope(rs, "official"),
    messy: inScope(rs, "messy"),
    inScope: inScope(rs, "all"),
    oos: notCovered(rs, ["oos"]),
    heldout: notCovered(rs, ["heldout"]),
    notCovered: notCovered(rs, ["oos", "heldout"]),
    costPerQuery: { binrules: cost("binrules"), model: cost("model") },
  };
}

function readRun(file: string): { meta: RunMeta & Record<string, unknown>; rows: Row[] } {
  return JSON.parse(fs.readFileSync(path.join(RES, file), "utf8"));
}

export function buildFinal(): Final {
  const runs: RunMeta[] = [];
  const rows: Row[] = [];
  for (const f of RUN_FILES) {
    const r = readRun(f);
    runs.push(r.meta);
    rows.push(...r.rows);
  }
  const cities = [...new Set(rows.map((r) => r.city))];
  const history: HistoryItem[] = [];
  const hist = (file: string, label: string, note: string) => {
    if (!fs.existsSync(path.join(RES, file))) return;
    const r = readRun(file);
    history.push({ label, note, headline: headlineOf(r.rows, r.rows[0]?.city ?? "brisbane"), model: String(r.meta.model) });
  };
  hist("dev-brisbane.json", "Dev split, final configuration", "The only split used for tuning. Final configuration, one run.");
  hist("brisbane-test-run1.json", "Brisbane test, run 1 (before the stop-word fix)", "The word 'can' was on my stop-word list, so 'Oil can' collapsed to 'Oil' and 'Cans (steel)' lost its head word. I fixed that one bug and re-ran the whole test split.");
  hist("brisbane-test-run2.json", "Brisbane test, run 2 (before the variant fix)", "While building the demo I saw Toronto 'pizza box' answer 'food-soiled' only, because the model's own rewrites (for example 'greasy pizza box') were allowed to choose between condition variants. I changed it so only the resident's own words can choose a variant, and re-ran both cities. The numbers above are from that last run.");
  hist("toronto-test-run1.json", "Toronto test, run 1 (before the variant fix)", "Same reason as Brisbane run 2.");
  let day1: Final["day1"] = null;
  if (fs.existsSync(path.join(RES, "day1-baseline-dev.json")) && fs.existsSync(path.join(RES, "day1-baseline-test.json"))) {
    const a = readRun("day1-baseline-dev.json");
    const b = readRun("day1-baseline-test.json");
    const official = [...a.rows, ...b.rows].filter((r) => r.set === "official" && r.system === "model");
    day1 = {
      model: String(a.meta.model),
      n: official.length,
      counts: {
        correct: official.filter((r) => judge(r) === "correct").length,
        wrong: official.filter((r) => judge(r) === "wrong").length,
        refused: official.filter((r) => judge(r) === "refused").length,
        binOk: official.filter((r) => binMatch(r)).length,
      },
    };
  }
  const sp = JSON.parse(fs.readFileSync(path.join(RES, "spend.json"), "utf8")) as { projectCapUsd: number; evalStopUsd: number; runs: { usd: number }[] };
  return {
    generated: new Date().toISOString().slice(0, 10),
    runs,
    rows,
    summary: summarize(rows),
    headline: Object.fromEntries(cities.map((c) => [c, headlineOf(rows, c)])),
    history,
    day1,
    spend: { evalUsd: +sp.runs.reduce((s, r) => s + r.usd, 0).toFixed(4), projectCapUsd: sp.projectCapUsd, evalStopUsd: sp.evalStopUsd },
  };
}

// ---------------------------------------------------------------- rendering

const p1 = (k: number, n: number) => (n ? `${((100 * k) / n).toFixed(1)}%` : "n/a");
const ci = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return `${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}%`;
};
const cell = (k: number, n: number) => `${p1(k, n)} (${k}/${n}), 95% CI ${ci(k, n)}`;

function inScopeTable(h: InScope, title: string): string {
  const row = (name: string, c: SysCounts) =>
    `| ${name} | ${cell(c.correct, h.n)} | ${p1(c.wrong, h.n)} (${c.wrong}) | ${p1(c.refused, h.n)} (${c.refused}) | ${p1(c.binOk, h.n)} |`;
  return [
    `**${title}** (n = ${h.n})`,
    "",
    "| System | Right answer | Wrong answer | Declined | Bin within the official set |",
    "|---|---|---|---|---|",
    row("BinRules", h.binrules),
    row("Model alone", h.model),
    "",
  ].join("\n");
}

function notCoveredTable(h: NotCovered, title: string): string {
  const row = (name: string, c: NotCoveredCounts) =>
    `| ${name} | ${cell(c.refused, h.n)} | ${c.answered} | ${c.answeredRightBin} / ${c.answeredWrongBin} |`;
  return [
    `**${title}** (n = ${h.n})`,
    "",
    "| System | Refused | Answered anyway | Of those answered: right bin / wrong bin (held-out only) |",
    "|---|---|---|---|",
    row("BinRules", h.binrules),
    row("Model alone", h.model),
    "",
  ].join("\n");
}

function failures(rows: Row[], city: string): string {
  const out: string[] = [];
  const mine = rows.filter((r) => r.city === city && r.system === "binrules");
  const wrong = mine.filter((r) => judge(r) === "wrong");
  const answered = mine.filter((r) => ["answered", "answered_right_bin", "answered_wrong_bin"].includes(judge(r)));
  const refused = mine.filter((r) => (r.set === "official" || r.set === "messy") && judge(r) === "refused");
  const fmt = (r: Row) => `"${r.q}" -> ${(r.entries ?? []).join(", ") || "none"}`;
  out.push(`In-scope questions answered with a different entry than I listed (${wrong.length}): ${wrong.length ? wrong.map(fmt).join("; ") : "none"}.`);
  out.push("");
  out.push(`Not-covered questions that BinRules answered (${answered.length}): ${answered.length ? answered.map((r) => `${fmt(r)} [${r.set}, ${judge(r)}]`).join("; ") : "none"}.`);
  out.push("");
  out.push(`In-scope questions it declined (${refused.length}): ${refused.map((r) => `"${r.q}"`).join(", ") || "none"}.`);
  out.push("");
  return out.join("\n");
}

export function renderResults(f: Final): string {
  const b = f.headline["brisbane"];
  const t = f.headline["toronto"];
  const run = f.runs.find((r) => r.city === "brisbane")!;
  const lines: string[] = [];
  lines.push("# BinRules evaluation results");
  lines.push("");
  lines.push("Generated by `npm run report` from `eval/results/final.json`. Do not edit by hand: `tests/results.test.ts` fails if this file and the JSON disagree.");
  lines.push("");
  lines.push("## How to read this");
  lines.push("");
  lines.push(`- Both systems use the same model: \`${run.model}\` (Nemotron 3 Super on Nebius Token Factory), temperature 0.`);
  lines.push("- **BinRules** rewrites the resident's words, retrieves candidate official entries, asks the model to point at the entry that names the same item, then code checks the pick (two orderings agree, shared words, a separate yes/no check) and reads the bins from the official entry. It declines when a check fails.");
  lines.push("- **Model alone** gets the city's list of bin labels with a one-line description each, and is allowed to answer UNSURE. It has no official list and no retrieval. Its answer counts as right if the bin appears anywhere in the official entry's options, which is the most generous reading.");
  lines.push("- **Right answer** for BinRules means it cited an entry I accepted for that question. The last column applies the model's looser rule (any bin from the official options) to BinRules too.");
  lines.push("- Test questions were frozen before tuning (`eval/FROZEN.json`). Tuning used only the dev split. The test split was run once per configuration. Two bug fixes found after test runs forced re-runs of the whole split; every run is listed under History.");
  lines.push("");
  lines.push(`## Brisbane (test split; official list of ${getCity("brisbane").entries.length} entries)`);
  lines.push("");
  lines.push(inScopeTable(b.official, "Official names, asked word for word"));
  lines.push(inScopeTable(b.messy, "Messy phrasing I wrote (synonyms, slang, typos, brand names, long descriptions)"));
  lines.push(notCoveredTable(b.oos, "Items the list does not name (plus non-items and one instruction-injection attempt)"));
  lines.push(notCoveredTable(b.heldout, "Held-out entries: the entry is removed from the knowledge base and its own name is asked"));
  lines.push(`Cost per question: BinRules $${b.costPerQuery.binrules.toFixed(5)}, model alone $${b.costPerQuery.model.toFixed(5)}.`);
  lines.push("");
  lines.push("### What went wrong in Brisbane");
  lines.push("");
  lines.push(failures(f.rows, "brisbane"));
  if (t) {
    lines.push("## Toronto (test split, 2023 snapshot of the Waste Wizard data)");
    lines.push("");
    lines.push("A smaller second city, evaluated after the configuration was frozen. The official-name question set is a seeded sample of 120 entries.");
    lines.push("");
    lines.push(inScopeTable(t.official, "Official names, asked word for word"));
    lines.push(inScopeTable(t.messy, "Messy phrasing I wrote"));
    lines.push(notCoveredTable(t.oos, "Items I believed the list does not name"));
    lines.push(notCoveredTable(t.heldout, "Held-out entries"));
    lines.push("### What went wrong in Toronto");
    lines.push("");
    lines.push(failures(f.rows, "toronto"));
    lines.push("Reading the Toronto misses: several answers that my labels count as wrong cite a different but legitimate Toronto entry for the same item (for example \"smartphones\" for an old smartphone, \"Tim Hortons coffee cup (disposable)\" for a Tim Hortons cup), which the last column of the table forgives. Several \"not covered\" items turned out to have a broader Toronto entry that a reader could call a fair match (\"hats\", \"puzzle\", \"walking aid\", \"floor mats\", \"kitchen utensil\"). Toronto's list is also full of near-duplicate entries, so some held-out items were answered from a sibling that really is the same item (\"dog treat\" for rawhide chews, \"Sea-Doo\" for Jet Ski, \"fruit juice pouch\" for a juice drink pouch). I did not relabel anything after seeing the results.");
    lines.push("");
  }
  lines.push("## History and disclosures");
  lines.push("");
  for (const h of f.history) {
    if (!h.headline) continue;
    const x = h.headline;
    lines.push(`- **${h.label}** (${h.model}): official names ${p1(x.official.binrules.correct, x.official.n)} right; messy ${p1(x.messy.binrules.correct, x.messy.n)} right, ${p1(x.messy.binrules.wrong, x.messy.n)} wrong; not covered ${p1(x.notCovered.binrules.refused, x.notCovered.n)} refused. ${h.note}`);
  }
  if (f.day1) {
    const d = f.day1;
    lines.push(`- **Day-one stop-loss check** (before any tuning): ${d.model} alone on all ${d.n} Brisbane official names scored ${p1(d.counts.correct, d.n)} right, ${p1(d.counts.wrong, d.n)} wrong, ${p1(d.counts.refused, d.n)} declined (files \`eval/results/day1-baseline-*.json\`). That is far below the 95% that would have made the project pointless. The headline comparison above uses Super for both systems.`);
  }
  lines.push("- The out-of-scope labels were checked by hand against the list but not adjudicated with a second person. Broad entries (for example \"Household appliances\" or \"Hats\") make some \"not covered\" labels arguable. BinRules deliberately treats an entry as a match only when it names the item, so class-level questions get \"not covered\" plus the closest entries.");
  lines.push("- The model-alone baseline is allowed to abstain. A plain chatbot that always answers would look worse than the numbers here.");
  lines.push("- Re-running the same questions gives slightly different numbers (two runs of the Brisbane test differ by about 2 points), because the hosted model is not bit-for-bit deterministic at temperature 0.");
  lines.push("");
  lines.push("## Spend");
  lines.push("");
  lines.push(`Evaluation spend to date: $${f.spend.evalUsd.toFixed(4)} of the $${f.spend.projectCapUsd.toFixed(2)} project cap (evaluation stops at $${f.spend.evalStopUsd.toFixed(2)}; the rest is reserved for the public demo). Ledger: \`eval/results/spend.json\`.`);
  lines.push("");
  return lines.join("\n");
}

export const README_START = "<!-- RESULTS:START -->";
export const README_END = "<!-- RESULTS:END -->";

export function renderReadmeBlock(f: Final): string {
  const b = f.headline["brisbane"];
  const o = b.official;
  const m = b.messy;
  const n = b.notCovered;
  const t = f.headline["toronto"];
  const L: string[] = [];
  L.push(README_START);
  L.push("Same Nemotron model on both sides, Brisbane test questions frozen before tuning:");
  L.push("");
  L.push("| | BinRules | Model alone |");
  L.push("|---|---|---|");
  L.push(`| Official item names answered correctly (n = ${o.n}) | **${p1(o.binrules.correct, o.n)}** | ${p1(o.model.correct, o.n)} |`);
  L.push(`| Messy phrasing answered correctly (n = ${m.n}) | **${p1(m.binrules.correct, m.n)}** | ${p1(m.model.correct, m.n)} |`);
  L.push(`| Messy phrasing answered wrongly | ${p1(m.binrules.wrong, m.n)} | ${p1(m.model.wrong, m.n)} |`);
  L.push(`| Items the list does not cover that it refused (n = ${n.n}) | **${p1(n.binrules.refused, n.n)}** | ${p1(n.model.refused, n.n)} |`);
  L.push("");
  if (t) L.push(`Toronto (smaller, 2023 data): official names ${p1(t.official.binrules.correct, t.official.n)} vs ${p1(t.official.model.correct, t.official.n)}; items not covered refused ${p1(t.notCovered.binrules.refused, t.notCovered.n)} vs ${p1(t.notCovered.model.refused, t.notCovered.n)}. Full tables, failures and disclosures: [eval/RESULTS.md](eval/RESULTS.md).`);
  L.push(README_END);
  return L.join("\n");
}

function main() {
  const f = buildFinal();
  fs.writeFileSync(path.join(RES, "final.json"), JSON.stringify(f, null, 1) + "\n");
  fs.writeFileSync(path.join(__dirname, "RESULTS.md"), renderResults(f));
  const readme = path.join(ROOT, "README.md");
  if (fs.existsSync(readme)) {
    const s = fs.readFileSync(readme, "utf8");
    const a = s.indexOf(README_START);
    const z = s.indexOf(README_END);
    if (a >= 0 && z > a) fs.writeFileSync(readme, s.slice(0, a) + renderReadmeBlock(f) + s.slice(z + README_END.length));
  }
  console.log("wrote eval/results/final.json, eval/RESULTS.md");
}

if (process.argv[1] && /report\.ts$/.test(process.argv[1])) main();
