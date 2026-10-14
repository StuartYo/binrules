import { describe, expect, it } from "vitest";
import { baseName, cleanQuery, editDistance, familyKey, tokens } from "../lib/text";
import { getIndex } from "../lib/cities";
import { retrieve } from "../lib/retrieve";

describe("text helpers", () => {
  it("keeps the word can, so cans stay findable (regression: it was once a stop word)", () => {
    expect(tokens("Oil can (empty)")).toContain("can");
    expect(tokens("Cans (steel)")).toContain("can");
    expect(tokens("tin of baked beans")).toContain("can");
    expect(familyKey("Oil can (empty)")).not.toBe(familyKey("Oil (cooking)"));
  });

  it("folds plurals and British spellings", () => {
    expect(tokens("Aluminum cans")).toEqual(tokens("aluminium can"));
    expect(tokens("yogurt tubs")).toEqual(tokens("yoghurt tub"));
    expect(tokens("Boxes")).toEqual(["box"]);
  });

  it("groups condition variants by base name", () => {
    expect(baseName("Furniture (good condition)")).toBe("Furniture");
    expect(familyKey("Furniture (good condition)")).toBe(familyKey("Furniture (poor condition)"));
    expect(familyKey("pizza boxes (unsoiled)")).toBe(familyKey("pizza boxes (food-soiled)"));
  });

  it("edit distance stops early", () => {
    expect(editDistance("cardbord", "cardboard", 2)).toBe(1);
    expect(editDistance("abc", "xyzxyz", 2)).toBeGreaterThan(2);
  });

  it("strips control characters and caps length", () => {
    expect(cleanQuery("pizza\u0000 box\n\n")).toBe("pizza box");
    expect(cleanQuery("x".repeat(500)).length).toBe(120);
  });
});

describe("retrieval over the official list", () => {
  const ix = getIndex("brisbane");
  it("finds an entry from its own name", () => {
    expect(retrieve(ix, [{ text: "Pizza boxes", weight: 1 }], 3)[0].entry.name).toBe("Pizza boxes");
  });
  it("tolerates a typo", () => {
    expect(retrieve(ix, [{ text: "cardbord", weight: 1 }], 3)[0].entry.name).toMatch(/^Cardboard/);
  });
  it("returns nothing when no word is shared", () => {
    expect(retrieve(ix, [{ text: "xyzzy plugh", weight: 1 }], 5)).toEqual([]);
  });
  it("a held-out entry is really gone from the index", () => {
    const without = getIndex("brisbane", new Set(["bne-15"]));
    expect(retrieve(without, [{ text: "Balloons", weight: 1 }], 5).some((h) => h.entry.id === "bne-15")).toBe(false);
  });
});
