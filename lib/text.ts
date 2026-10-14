// Small, dependency-free text helpers: normalisation, stemming, edit distance.

const STOP = new Set([
  "a", "an", "the", "of", "and", "or", "with", "for", "in", "on", "to", "from", "my", "your", "our", "that", "this",
  "these", "those", "some", "any", "it", "its", "is", "are", "was", "be", "been", "i", "me", "we", "used", "old",
  "bit", "piece", "pieces", "lot", "kind", "type", "like", "such", "as", "at", "by", "into", "out", "up", "got",
  "has", "have", "had", "can", "do", "does", "not", "no", "dirty", "empty", "little", "small", "big", "large",
]);

// British/American and common spelling variants, applied before stemming.
const VARIANTS: Record<string, string> = {
  aluminum: "aluminium",
  yogurt: "yoghurt",
  yoghurts: "yoghurt",
  color: "colour",
  tire: "tyre",
  tires: "tyres",
  fiber: "fibre",
  curb: "kerb",
  curbside: "kerbside",
  gray: "grey",
  mold: "mould",
  liter: "litre",
  jewelry: "jewellery",
  tupperware: "tupperware",
  takeout: "takeaway",
  "take-out": "takeaway",
  garbage: "rubbish",
  trash: "rubbish",
  ziploc: "ziplock",
  styrofoam: "polystyrene",
  nappie: "nappy",
  diaper: "nappy",
  diapers: "nappies",
  cellphone: "mobile",
  cellphones: "mobile",
  tin: "can",
  tins: "cans",
};

export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("oes") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Lower-case word tokens with spelling variants folded and plurals stemmed. Stop words kept. */
export function rawTokens(s: string): string[] {
  const t = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!t) return [];
  return t.split(" ").map((w) => stem(VARIANTS[w] ?? w));
}

/** Content tokens: stop words removed. */
export function tokens(s: string): string[] {
  return rawTokens(s).filter((w) => !STOP.has(w) && w.length > 0);
}

/** Text before the first "(" or " - ": the entry's base name, used to group condition variants. */
export function baseName(name: string): string {
  return name.split(/\s*\(|\s+-\s+/)[0].trim();
}

export function familyKey(name: string): string {
  return tokens(baseName(name)).join(" ");
}

export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Strip control characters and collapse whitespace; cap the length. */
export function cleanQuery(s: string, max = 120): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
