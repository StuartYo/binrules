import type { Metadata } from "next";
import Link from "next/link";
import { Recycle } from "lucide-react";
import finalResults from "@/eval/results/final.json";

export const metadata: Metadata = { title: "BinRules evaluation", description: "How BinRules was measured against the same model alone, and where it fails." };
export const dynamic = "force-static";

const p = (k: number, n: number) => `${((100 * k) / n).toFixed(1)}%`;

type InScope = typeof finalResults.headline.brisbane.official;
type NotCovered = typeof finalResults.headline.brisbane.oos;

function InTable({ title, h }: { title: string; h: InScope }) {
  return (
    <>
      <h3>
        {title} <span style={{ color: "var(--faint)", fontWeight: 400 }}>n = {h.n}</span>
      </h3>
      <table className="tbl">
        <thead>
          <tr>
            <th>System</th>
            <th>Right</th>
            <th>Wrong</th>
            <th>Declined</th>
          </tr>
        </thead>
        <tbody>
          <tr className="us">
            <td>BinRules</td>
            <td className="num">{p(h.binrules.correct, h.n)}</td>
            <td className="num">{p(h.binrules.wrong, h.n)}</td>
            <td className="num">{p(h.binrules.refused, h.n)}</td>
          </tr>
          <tr>
            <td>Model alone</td>
            <td className="num">{p(h.model.correct, h.n)}</td>
            <td className="num">{p(h.model.wrong, h.n)}</td>
            <td className="num">{p(h.model.refused, h.n)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function NcTable({ title, h, bins = true }: { title: string; h: NotCovered; bins?: boolean }) {
  return (
    <>
      <h3>
        {title} <span style={{ color: "var(--faint)", fontWeight: 400 }}>n = {h.n}</span>
      </h3>
      <table className="tbl">
        <thead>
          <tr>
            <th>System</th>
            <th>Refused</th>
            <th>Answered anyway</th>
          </tr>
        </thead>
        <tbody>
          <tr className="us">
            <td>BinRules</td>
            <td className="num">{p(h.binrules.refused, h.n)}</td>
            <td className="num">{h.binrules.answered}</td>
          </tr>
          <tr>
            <td>Model alone</td>
            <td className="num">{p(h.model.refused, h.n)}</td>
            <td className="num">
              {h.model.answered}
              {bins && h.model.answeredRightBin + h.model.answeredWrongBin > 0 && (
                <span className="sub">
                  right bin {h.model.answeredRightBin}, wrong bin {h.model.answeredWrongBin}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export default function EvalPage() {
  const b = finalResults.headline.brisbane;
  const model = finalResults.runs[0].model;
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/" className="brand">
            <span className="mark">
              <Recycle size={18} />
            </span>
            BinRules
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/">Back to the checker</Link>
          </nav>
        </div>
      </header>
      <main>
        <div className="wrap prose" style={{ maxWidth: 860 }}>
          <section className="hero" style={{ paddingBottom: 8 }}>
            <p className="eyebrow">Evaluation</p>
            <h1 style={{ maxWidth: "none", fontSize: "clamp(30px,4.4vw,46px)" }}>Same model, with and without the official list</h1>
            <p className="lede">
              Both sides are <code>{model}</code> at temperature 0. The test questions were written and hashed before I tuned anything; tuning used a separate dev split. Everything below is generated from one results file.
            </p>
          </section>

          <h2>Brisbane</h2>
          <InTable title="Official item names, asked word for word" h={b.official} />
          <InTable title="Messy phrasing I wrote (slang, typos, brand names, long descriptions)" h={b.messy} />
          <NcTable title="All items the list does not cover: the next two sets combined" h={b.notCovered} bins={false} />
          <NcTable title="Items the list does not name, plus non-items and an injection attempt" h={b.oos} />
          <NcTable title="Held-out: the entry is deleted from the list, then its own name is asked" h={b.heldout} />
          <p>
            That last row cuts both ways. With the entry deleted, the model alone still lands on a bin the full list allows {b.heldout.model.answeredRightBin} times out of {b.heldout.model.answered}. It has no way to tell you which of its answers
            are the lucky ones, and BinRules gives up some of those right answers to avoid the wrong ones.
          </p>

          <h2>What to keep in mind</h2>
          <ul>
            <li>I wrote the messy and out-of-scope questions myself and labelled them by hand. Nobody else checked the labels.</li>
            <li>Some &quot;not covered&quot; labels are arguable, because the list has broad entries such as &quot;Household appliances&quot;. I did not relabel after seeing results.</li>
            <li>BinRules counts a match only when an entry names the item. A class-level question such as &quot;toaster&quot; gets &quot;not covered&quot; plus the nearest entries.</li>
            <li>The model-alone baseline may answer UNSURE. A chatbot that always answers would look worse.</li>
            <li>Two bugs found after test runs forced two re-runs of the test split. Both are listed with the earlier numbers in the full report.</li>
            <li>
              Evaluation spend: ${finalResults.spend.evalUsd.toFixed(2)} of the ${finalResults.spend.projectCapUsd.toFixed(2)} project cap.
            </li>
          </ul>
          <p>
            <a href="https://github.com/StuartYo/binrules/blob/main/eval/RESULTS.md" target="_blank" rel="noreferrer">
              Full tables, every failure, confidence intervals and history
            </a>{" "}
            ·{" "}
            <a href="https://github.com/StuartYo/binrules/blob/main/eval/results/final.json" target="_blank" rel="noreferrer">
              Raw results (JSON)
            </a>
          </p>
        </div>
      </main>
      <footer>
        <div className="wrap">
          <span>An independent student project by Hua-I Yu.</span>
          <Link href="/">Back to the checker</Link>
        </div>
      </footer>
    </>
  );
}
