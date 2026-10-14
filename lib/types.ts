export type CityId = "brisbane" | "toronto";

export interface BinInfo {
  label: string;
  tone: "red" | "yellow" | "green" | "blue" | "orange" | "grey";
  description: string;
}

/** One row of a city's official sorting list. Wording is the council's own. */
export interface Entry {
  id: string;
  name: string;
  aliases: string[];
  /** Ordered: the council's first-listed option comes first. */
  bins: string[];
  note: string | null;
  url: string | null;
}

export interface CitySource {
  title: string;
  datasetUrl: string;
  license: string;
  licenseUrl: string;
  modified: string | null;
  retrieved: string;
  councilUrl: string;
  councilName: string;
  note: string;
}

export interface CityData {
  city: CityId;
  displayName: string;
  authority: string;
  source: CitySource;
  bins: Record<string, BinInfo>;
  entries: Entry[];
}

export interface Usage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface EntryView {
  id: string;
  name: string;
  bins: { code: string; label: string; tone: BinInfo["tone"]; description: string }[];
  note: string | null;
  url: string | null;
}

export type Status = "answer" | "depends" | "not_covered";
export type Mode = "llm" | "lexical-fallback";

export interface Trace {
  expansions: string[];
  candidates: { id: string; name: string; score: number }[];
  votes: { order: string; pick: string | null; variantStated: boolean }[];
  gates: { name: string; passed: boolean; detail: string }[];
}

export interface Answer {
  status: Status;
  city: CityId;
  query: string;
  entries: EntryView[];
  /** Nearest official entries, shown only when status is not_covered. They are NOT matches. */
  closest: { id: string; name: string }[];
  reason: string;
  mode: Mode;
  usage: Usage;
  trace: Trace;
}

export interface BaselineAnswer {
  bin: string | "UNSURE";
  binCode: string | null;
  why: string;
  usage: Usage;
}
