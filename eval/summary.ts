import { judge, wilson, type Outcome, type Row, type System } from "./judge";

export interface Cell {
  n: number;
  counts: Record<Outcome, number>;
  usd: number;
  calls: number;
}
export type Summary = Record<string, Record<System, Cell>>;

const zero = (): Record<Outcome, number> => ({ correct: 0, wrong: 0, refused: 0, answered: 0, answered_right_bin: 0, answered_wrong_bin: 0 });

export function summarize(rows: Row[]): Summary {
  const s: Summary = {};
  for (const r of rows) {
    const key = `${r.city}/${r.set}`;
    s[key] ??= { binrules: { n: 0, counts: zero(), usd: 0, calls: 0 }, model: { n: 0, counts: zero(), usd: 0, calls: 0 } };
    const c = s[key][r.system];
    c.n++;
    c.counts[judge(r)]++;
    c.usd += r.usd;
    c.calls += r.calls;
  }
  return s;
}

export const pct = (k: number, n: number) => (n ? `${((100 * k) / n).toFixed(1)}%` : "n/a");
export const ci = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return `${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}%`;
};

export function line(label: string, c: Cell): string {
  const k = c.counts;
  return `${label.padEnd(26)} n=${String(c.n).padStart(3)}  correct ${pct(k.correct, c.n).padStart(6)}  wrong ${pct(k.wrong, c.n).padStart(6)}  refused ${pct(k.refused, c.n).padStart(6)}  answered(oos) ${pct(k.answered, c.n).padStart(6)}  held-out right/wrong bin ${k.answered_right_bin}/${k.answered_wrong_bin}`;
}
