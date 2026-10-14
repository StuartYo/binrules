import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getCity } from "../lib/cities";
import { splitOf } from "../eval/split";
import { heldoutCases, messyCases, officialCases, oosCases } from "../eval/cases";
import { rawTokens } from "../lib/text";
import type { CityId } from "../lib/types";

const DIR = path.join(__dirname, "..", "eval", "cases");

for (const city of ["brisbane", "toronto"] as CityId[]) {
  describe(`frozen evaluation cases (${city})`, () => {
    const c = getCity(city);
    const ids = new Set(c.entries.map((e) => e.id));
    const names = new Set(c.entries.flatMap((e) => [e.name, ...e.aliases]).map((n) => rawTokens(n).join(" ")));
    const messy = JSON.parse(fs.readFileSync(path.join(DIR, `${city}.messy.json`), "utf8")).cases as { q: string; accept: string[]; split: string }[];

    it("every messy case points at real entries and its declared split matches the hash split", () => {
      for (const m of messy) {
        for (const id of m.accept) expect(ids.has(id), `${m.q} -> ${id}`).toBe(true);
        expect(splitOf(m.accept[0]), `${m.q}`).toBe(m.split);
      }
    });

    it("no messy query is just an official entry name", () => {
      for (const m of messy) expect(names.has(rawTokens(m.q).join(" ")), m.q).toBe(false);
    });

    it("no out-of-scope query is an official entry name", () => {
      for (const s of ["dev", "test"] as const) for (const o of oosCases(city, s)) expect(names.has(rawTokens(o.q).join(" ")), o.q).toBe(false);
    });

    it("held-out entries sit in the declared split", () => {
      for (const s of ["dev", "test"] as const) for (const h of heldoutCases(city, s)) expect(splitOf(h.intended!)).toBe(s);
    });

    it("dev and test never share an intended entry", () => {
      const dev = new Set([...messyCases(city, "dev"), ...heldoutCases(city, "dev")].map((x) => x.intended));
      for (const t of [...messyCases(city, "test"), ...heldoutCases(city, "test")]) expect(dev.has(t.intended), t.q).toBe(false);
    });

    it("verbatim sets cover every entry exactly once across dev and test", () => {
      const all = [...officialCases(city, "dev"), ...officialCases(city, "test")];
      expect(all.length).toBe(c.entries.length);
      expect(new Set(all.map((x) => x.intended)).size).toBe(c.entries.length);
    });
  });
}
