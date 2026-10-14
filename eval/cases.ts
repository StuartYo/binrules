import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getCity } from "../lib/cities";
import { familyKey, tokens, baseName } from "../lib/text";
import type { CityId, Entry } from "../lib/types";
import { splitOf } from "./split";

const DIR = path.join(__dirname, "cases");

export type SetName = "official" | "messy" | "oos" | "heldout";
export type Split = "dev" | "test";

export interface Case {
  set: SetName;
  split: Split;
  city: CityId;
  q: string;
  /** Entry ids that count as the right match (in-scope sets). */
  accept: string[];
  /** Bin codes that count as right for a model that answers with a bin only. */
  acceptBins: string[];
  /** The intended / held-out entry. */
  intended?: string;
  /** Held-out set: entry ids removed from the knowledge base for this case. */
  without?: string[];
  /** Bin codes the official list gives the intended entry (held-out analysis). */
  officialBins?: string[];
  kind?: string;
  trap?: string;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as T;
}

export function casesHash(city: CityId): string {
  const h = createHash("sha256");
  for (const f of fs.readdirSync(DIR).filter((f) => f.startsWith(city + ".")).sort()) h.update(f).update(fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n"));
  return h.digest("hex");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
}

interface Sig {
  id: string;
  fk: string;
  bt: Set<string>;
}
const sigCache = new Map<CityId, Sig[]>();
function sigs(city: CityId): Sig[] {
  let s = sigCache.get(city);
  if (!s) {
    s = getCity(city).entries.map((x) => ({ id: x.id, fk: familyKey(x.name), bt: new Set(tokens(baseName(x.name))) }));
    sigCache.set(city, s);
  }
  return s;
}

/** Entries that are the same item as `e`: its condition variants and near-duplicate official entries. */
export function sameItemIds(city: CityId, e: Entry): string[] {
  const fk = familyKey(e.name);
  const bt = new Set(tokens(baseName(e.name)));
  return sigs(city)
    .filter((x) => x.id === e.id || (fk && x.fk === fk) || jaccard(bt, x.bt) >= 0.6)
    .map((x) => x.id);
}

function binsOf(city: CityId, ids: string[]): string[] {
  const c = getCity(city);
  const set = new Set<string>();
  for (const id of ids) for (const b of c.entries.find((e) => e.id === id)?.bins ?? []) set.add(b);
  return [...set];
}

/** Verbatim official names. `sample` takes a seeded subset (large cities). */
export function officialCases(city: CityId, split: Split, sample?: number): Case[] {
  const c = getCity(city);
  let list = c.entries.filter((e) => splitOf(e.id) === split);
  if (sample && list.length > sample) {
    list = [...list].sort((a, b) => createHash("sha1").update("sample" + a.id).digest("hex").localeCompare(createHash("sha1").update("sample" + b.id).digest("hex"))).slice(0, sample);
  }
  return list.map((e) => {
    const accept = sameItemIds(city, e);
    return { set: "official", split, city, q: e.name, accept, acceptBins: binsOf(city, accept), intended: e.id };
  });
}

interface MessyFile {
  cases: { q: string; accept: string[]; kind?: string; split: Split }[];
}
export function messyCases(city: CityId, split: Split): Case[] {
  const f = `${city}.messy.json`;
  if (!fs.existsSync(path.join(DIR, f))) return [];
  return readJson<MessyFile>(f)
    .cases.filter((x) => x.split === split)
    .map((x) => ({ set: "messy" as const, split, city, q: x.q, accept: x.accept, acceptBins: binsOf(city, x.accept), intended: x.accept[0], kind: x.kind }));
}

interface OosFile {
  cases: { q: string; split: Split; trap?: string }[];
}
export function oosCases(city: CityId, split: Split): Case[] {
  const f = `${city}.oos.json`;
  if (!fs.existsSync(path.join(DIR, f))) return [];
  return readJson<OosFile>(f)
    .cases.filter((x) => x.split === split)
    .map((x) => ({ set: "oos" as const, split, city, q: x.q, accept: [], acceptBins: [], trap: x.trap }));
}

interface HeldFile {
  cases: Record<Split, string[]>;
}
export function heldoutCases(city: CityId, split: Split): Case[] {
  const f = `${city}.heldout.json`;
  if (!fs.existsSync(path.join(DIR, f))) return [];
  const c = getCity(city);
  return (readJson<HeldFile>(f).cases[split] ?? []).map((id) => {
    const e = c.entries.find((x) => x.id === id);
    if (!e) throw new Error(`held-out entry ${id} not found`);
    return { set: "heldout" as const, split, city, q: e.name, accept: [], acceptBins: [], intended: id, without: [id], officialBins: e.bins };
  });
}

export function allCases(city: CityId, split: Split, sets: SetName[], sample?: number): Case[] {
  const out: Case[] = [];
  if (sets.includes("official")) out.push(...officialCases(city, split, sample));
  if (sets.includes("messy")) out.push(...messyCases(city, split));
  if (sets.includes("oos")) out.push(...oosCases(city, split));
  if (sets.includes("heldout")) out.push(...heldoutCases(city, split));
  return out;
}
