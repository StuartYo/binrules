import type { CityData, Entry } from "./types";
import { editDistance, tokens } from "./text";

// BM25 over entry names and aliases, with typo tolerance. Deterministic, no model involved.

export interface Doc {
  tf: Map<string, number>;
  len: number;
}

export interface Index {
  city: CityData;
  docs: Doc[];
  df: Map<string, number>;
  avg: number;
  vocab: string[];
  /** Tokens of each entry's name only (used for evidence checks). */
  nameTokens: Set<string>[];
}

export interface Hit {
  i: number;
  entry: Entry;
  score: number;
}

const K1 = 1.2;
const B = 0.45;

export function buildIndex(city: CityData): Index {
  const docs: Doc[] = [];
  const df = new Map<string, number>();
  const nameTokens: Set<string>[] = [];
  for (const e of city.entries) {
    const toks = tokens([e.name, ...e.aliases].join(" "));
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    docs.push({ tf, len: toks.length });
    nameTokens.push(new Set(toks));
  }
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { city, docs, df, avg, vocab: [...df.keys()], nameTokens };
}

/** Map a query token onto the vocabulary: exact, then a one/two-letter typo, then a long shared prefix. */
export function resolveToken(ix: Index, t: string): string | null {
  if (ix.df.has(t)) return t;
  if (t.length < 5) return null;
  const maxEd = t.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestEd = maxEd + 1;
  for (const v of ix.vocab) {
    if (v[0] !== t[0] && t.length < 6) continue;
    const ed = editDistance(t, v, maxEd);
    if (ed < bestEd) {
      bestEd = ed;
      best = v;
    }
  }
  return best;
}

export interface Weighted {
  text: string;
  weight: number;
}

export function retrieve(ix: Index, parts: Weighted[], k: number): Hit[] {
  const N = ix.docs.length;
  const weights = new Map<string, number>();
  let origTokens: string[] = [];
  parts.forEach((p, idx) => {
    const toks = tokens(p.text);
    if (idx === 0) origTokens = toks;
    for (const t of toks) {
      const r = resolveToken(ix, t);
      if (!r) continue;
      weights.set(r, Math.max(weights.get(r) ?? 0, p.weight));
    }
  });
  if (weights.size === 0) return [];
  const origResolved = new Set(origTokens.map((t) => resolveToken(ix, t)).filter((x): x is string => !!x));
  const hits: Hit[] = [];
  for (let i = 0; i < N; i++) {
    const d = ix.docs[i];
    let s = 0;
    for (const [t, w] of weights) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (ix.df.get(t) ?? 0) + 0.5) / ((ix.df.get(t) ?? 0) + 0.5));
      s += w * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / ix.avg)));
    }
    if (s <= 0) continue;
    // Coverage of the resident's own words, and how much of the entry name they account for.
    if (origResolved.size) {
      let hit = 0;
      for (const t of origResolved) if (d.tf.has(t)) hit++;
      s += 1.2 * (hit / origResolved.size) + 0.8 * (hit / Math.max(1, ix.nameTokens[i].size));
    }
    hits.push({ i, entry: ix.city.entries[i], score: s });
  }
  hits.sort((a, b) => b.score - a.score || a.i - b.i);
  return hits.slice(0, k);
}
