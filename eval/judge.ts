import type { SetName } from "./cases";

// Pure scoring. Reports are recomputed from the raw rows, so every number can be re-derived.

export type System = "binrules" | "model";
export type Outcome =
  | "correct" // in-scope: right entry (BinRules) or a bin the official entry lists (model)
  | "wrong" // in-scope: answered with the wrong entry / a bin the official entry does not list
  | "refused" // declined to answer (BinRules not_covered, model UNSURE)
  | "answered" // out-of-scope: gave an answer where the right behaviour is to refuse
  | "answered_right_bin" // held-out: answered; the bin matches what the removed official entry says
  | "answered_wrong_bin"; // held-out: answered; the bin differs

export interface Row {
  set: SetName;
  split: "dev" | "test";
  city: string;
  q: string;
  system: System;
  accept: string[];
  acceptBins: string[];
  officialBins?: string[];
  kind?: string;
  trap?: string;
  intended?: string;
  // raw system output
  status?: "answer" | "depends" | "not_covered";
  entries?: string[];
  entryBins?: string[];
  bin?: string;
  binCode?: string | null;
  reason?: string;
  usd: number;
  calls: number;
  err?: string;
}

export function judge(r: Row): Outcome {
  const inScope = r.set === "official" || r.set === "messy";
  if (r.system === "binrules") {
    if (r.status === undefined || r.status === "not_covered") return "refused";
    if (inScope) return (r.entries ?? []).length > 0 && (r.entries ?? []).every((id) => r.accept.includes(id)) ? "correct" : "wrong";
    if (r.set === "oos") return "answered";
    const ob = r.officialBins ?? [];
    return (r.entryBins ?? []).some((b) => ob.includes(b)) ? "answered_right_bin" : "answered_wrong_bin";
  }
  if (r.bin === undefined || r.bin === "UNSURE" || !r.binCode) return "refused";
  if (inScope) return r.acceptBins.includes(r.binCode) ? "correct" : "wrong";
  if (r.set === "oos") return "answered";
  return (r.officialBins ?? []).includes(r.binCode) ? "answered_right_bin" : "answered_wrong_bin";
}

/** Wilson score interval, 95%. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
