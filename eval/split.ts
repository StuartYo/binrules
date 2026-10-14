import { createHash } from "node:crypto";

/** Deterministic dev/test split of official entries. Dev (30%) is the only part used for tuning. */
export function splitOf(id: string): "dev" | "test" {
  const h = parseInt(createHash("sha1").update(id).digest("hex").slice(0, 8), 16);
  return h % 10 < 3 ? "dev" : "test";
}
