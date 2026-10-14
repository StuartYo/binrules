import Link from "next/link";
import { BookOpenCheck, FileSearch, Recycle, Scale } from "lucide-react";
import Checker, { type CityInfo } from "./Checker";
import { getCity } from "@/lib/cities";
import finalResults from "@/eval/results/final.json";
import type { CityId } from "@/lib/types";

export const dynamic = "force-static";

const CHIPS: Record<CityId, string[]> = {
  brisbane: ["pizza box", "tea bags", "business cards", "milk carton", "kitchen sponge", "bicycle helmet"],
  toronto: ["pizza box", "plastic straw", "kitchen sponge", "tea strainer"],
};
const PLACEHOLDER: Record<CityId, string> = { brisbane: "e.g. greasy box my pizza came in", toronto: "e.g. empty jar of baby food" };

function cityInfo(id: CityId): CityInfo {
  const c = getCity(id);
  return {
    id,
    name: id === "brisbane" ? "Brisbane" : "Toronto",
    authority: c.authority,
    councilUrl: c.source.councilUrl,
    councilName: c.source.councilName,
    sourceTitle: c.source.title,
    license: c.source.license,
    modified: c.source.modified,
    chips: CHIPS[id],
    placeholder: PLACEHOLDER[id],
    tones: Object.fromEntries(Object.values(c.bins).map((b) => [b.label, b.tone])),
  };
}

const pc = (k: number, n: number) => `${Math.round((100 * k) / n)}%`;
const pc1 = (k: number, n: number) => `${((100 * k) / n).toFixed(1).replace(/\.0$/, "")}%`;

export default function Home() {
  const cities = (["brisbane", "toronto"] as CityId[]).map(cityInfo);
  const h = finalResults.headline.brisbane;
  const o = h.official;
  const m = h.messy;
  const n = h.notCovered;
  const bne = getCity("brisbane");
  const tor = getCity("toronto");

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
            <a href="#how">How it works</a>
            <Link href="/eval">Evaluation</Link>
            <a href="https://github.com/StuartYo/binrules" target="_blank" rel="noreferrer">
              Code
            </a>
          </nav>
        </div>
      </header>

      <main>
        <div className="wrap">
          <section className="hero">
            <p className="eyebrow">Arbiter Hacks V1 · Rethinking Waste</p>
            <h1>
              Which bin? <em>Only what your council&apos;s own list says.</em>
            </h1>
            <p className="lede">
              Sorting rules change from city to city, and a model that guesses sends the wrong things to the wrong bin. BinRules answers from the council&apos;s official list, shows the exact entry it used, and says
              &quot;not covered&quot; when the list is silent.
            </p>

            <div className="proof" role="group" aria-label="Measured results, BinRules versus the same model alone">
              <div>
                <div className="pair">
                  <span className="big">{pc(o.binrules.correct, o.n)}</span>
                  <span className="vs">vs</span>
                  <span className="small">{pc(o.model.correct, o.n)}</span>
                </div>
                <p className="cap">
                  <b>Official item names answered right.</b> BinRules against the same model alone, {o.n} Brisbane questions.
                </p>
              </div>
              <div>
                <div className="pair">
                  <span className="big">{pc1(m.binrules.wrong, m.n)}</span>
                  <span className="vs">vs</span>
                  <span className="small">{pc(m.model.wrong, m.n)}</span>
                </div>
                <p className="cap">
                  <b>Wrong answers on messy phrasing</b> (slang, typos, brand names). {m.n} questions I wrote before tuning.
                </p>
              </div>
              <div>
                <div className="pair">
                  <span className="big">{pc(n.binrules.refused, n.n)}</span>
                  <span className="vs">vs</span>
                  <span className="small">{pc(n.model.refused, n.n)}</span>
                </div>
                <p className="cap">
                  <b>Items the list does not cover, refused.</b> {n.n} questions with no official entry behind them.
                </p>
              </div>
            </div>
            <p className="proof-foot">
              Same Nemotron model on both sides. Brisbane test questions frozen before tuning. <Link href="/eval">How I measured this, and where it fails</Link>
            </p>
          </section>

          <Checker cities={cities} />

          <section className="block" id="how">
            <h2>How an answer is made</h2>
            <p className="sub">The model matches words to entries. The bin always comes from the entry, never from the model.</p>
            <div className="steps">
              <div className="step">
                <FileSearch size={22} />
                <p className="n">1</p>
                <h3>The model reads your words</h3>
                <p>&quot;Greasy box my pizza came in&quot; becomes plain item names. It is never shown a bin.</p>
              </div>
              <div className="step">
                <BookOpenCheck size={22} />
                <p className="n">2</p>
                <h3>Code finds official entries</h3>
                <p>A word index over the council&apos;s list pulls the closest entries. The list is the source, not the model&apos;s memory.</p>
              </div>
              <div className="step">
                <Scale size={22} />
                <p className="n">3</p>
                <h3>The model points, code decides</h3>
                <p>The model names the entry that is the same item, or none. Code checks the pick, reads the bins from the entry, and refuses if a check fails.</p>
              </div>
            </div>
          </section>

          <section className="block">
            <h2>Where the rules come from</h2>
            <p className="sub">Both lists are the cities&apos; own open data. Nothing here is reworded.</p>
            <div className="sources">
              <div className="srccard">
                <h3>Brisbane, Australia</h3>
                <p>
                  <a href={bne.source.datasetUrl} target="_blank" rel="noreferrer">
                    {bne.source.title}
                  </a>
                </p>
                <p>
                  {bne.entries.length} entries · {bne.source.license} · updated {bne.source.modified?.slice(0, 10)}
                </p>
              </div>
              <div className="srccard">
                <h3>Toronto, Canada</h3>
                <p>
                  <a href={tor.source.datasetUrl} target="_blank" rel="noreferrer">
                    {tor.source.title}
                  </a>
                </p>
                <p>
                  {tor.entries.length.toLocaleString("en-US")} entries · a 2023 snapshot, so some rules may have changed. Licence: Open Government Licence - Toronto (the dataset page does not state one).
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer>
        <div className="wrap">
          <span>An independent student project by Hua-I Yu, not affiliated with Brisbane City Council or the City of Toronto. For hazardous items, ask the council first.</span>
          <span>
            Public demo: limited checks per day, then a labelled word-for-word fallback. <Link href="/eval">Evaluation</Link> ·{" "}
            <a href="https://github.com/StuartYo/binrules" target="_blank" rel="noreferrer">
              Source (MIT)
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
