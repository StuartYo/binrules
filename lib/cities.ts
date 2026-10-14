import brisbane from "../data/brisbane.json";
import toronto from "../data/toronto.json";
import type { CityData, CityId, Entry, EntryView } from "./types";
import { buildIndex, type Index } from "./retrieve";

const CITIES: Record<CityId, CityData> = {
  brisbane: brisbane as CityData,
  toronto: toronto as CityData,
};

export const CITY_IDS = Object.keys(CITIES) as CityId[];

export function isCity(x: unknown): x is CityId {
  return typeof x === "string" && x in CITIES;
}

export function getCity(id: CityId): CityData {
  return CITIES[id];
}

const indexCache = new Map<string, Index>();

/** `without` lets the held-out evaluation drop entries from the knowledge base. */
export function getIndex(id: CityId, without?: ReadonlySet<string>): Index {
  if (!without || without.size === 0) {
    let ix = indexCache.get(id);
    if (!ix) {
      ix = buildIndex(CITIES[id]);
      indexCache.set(id, ix);
    }
    return ix;
  }
  const base = CITIES[id];
  return buildIndex({ ...base, entries: base.entries.filter((e) => !without.has(e.id)) });
}

export function entryView(city: CityData, e: Entry): EntryView {
  return {
    id: e.id,
    name: e.name,
    bins: e.bins.map((code) => ({ code, ...city.bins[code] })),
    note: e.note,
    url: e.url,
  };
}
