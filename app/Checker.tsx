"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ExternalLink, Info, Loader2, SearchX, ShieldCheck, TriangleAlert, X, Scale } from "lucide-react";

export interface CityInfo {
  id: string;
  name: string;
  authority: string;
  councilUrl: string;
  councilName: string;
  sourceTitle: string;
  license: string;
  modified: string | null;
  chips: string[];
  placeholder: string;
  tones: Record<string, string>; // bin label -> tone
}

interface BinView {
  code: string;
  label: string;
  tone: string;
}
interface EntryView {
  id: string;
  name: string;
  bins: BinView[];
  note: string | null;
  url: string | null;
  links: { label: string; href: string }[];
}
interface ApiOk {
  answer: {
    status: "answer" | "depends" | "not_covered";
    entries: EntryView[];
    closest: { id: string; name: string }[];
    reason: string;
    mode: "llm" | "lexical-fallback";
    usage: { costUsd: number; calls: number };
    trace: { expansions: string[]; candidates: unknown[]; gates: { name: string; passed: boolean; detail: string }[] };
  };
  baseline: { bin: string; binCode: string | null; why: string } | null;
  source: "live" | "cache" | "saved-example" | "fallback";
  computed: string;
  fallbackReason?: string;
  remaining: { queries: number; usd: number };
}

const STAGES = ["Reading your words", "Searching the official list", "Asking which entry names the item", "Checking the match"];

function BinChip({ b, ord }: { b: { label: string; tone: string }; ord?: number }) {
  return (
    <span className={`bin tone-${b.tone}`}>
      <span className="dot" aria-hidden="true" />
      {b.label}
      {ord ? <span className="ord">#{ord}</span> : null}
    </span>
  );
}

function Loading({ stage }: { stage: number }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <ol>
        {STAGES.map((s, i) => (
          <li key={s} className={i < stage ? "done" : i === stage ? "on" : ""}>
            {i < stage ? <Check size={18} /> : i === stage ? <Loader2 size={18} className="spin" /> : <span style={{ width: 18 }} />}
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Checker({ cities }: { cities: CityInfo[] }) {
  const [cityId, setCityId] = useState(cities[0].id);
  const [item, setItem] = useState("");
  const [compare, setCompare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [res, setRes] = useState<ApiOk | null>(null);
  const [asked, setAsked] = useState<{ city: string; item: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const city = cities.find((c) => c.id === cityId)!;

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  async function run(q: string, cid = cityId) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    setStage(0);
    timer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 900);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cid, item: text, compare }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "Something went wrong.");
        setRes(null);
      } else {
        setRes(j as ApiOk);
        setAsked({ city: cid, item: text });
      }
    } catch {
      setErr("The check could not reach the server. Try again.");
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
    }
  }

  const info = asked ? cities.find((c) => c.id === asked.city)! : city;
  const a = res?.answer;
  const officialCodes = new Set((a?.entries ?? []).flatMap((e) => e.bins.map((b) => b.code)));
  const base = res?.baseline ?? null;
  const baseTone = base && base.binCode ? info.tones[base.bin] ?? "grey" : null;
  let vs: { cls: string; icon: React.ReactNode; text: string } | null = null;
  if (a && base) {
    if (a.status === "not_covered") {
      vs =
        base.bin === "UNSURE"
          ? { cls: "meh", icon: <Info size={18} />, text: "Also unsure. That is the right call here." }
          : { cls: "bad", icon: <X size={18} />, text: "Answered with no entry behind it. The official list does not name this item." };
    } else if (base.binCode && officialCodes.has(base.binCode)) {
      vs = { cls: "good", icon: <Check size={18} />, text: "One of the official options, though it cannot say which rule it used." };
    } else if (base.bin === "UNSURE") {
      vs = { cls: "meh", icon: <Info size={18} />, text: "Could not answer. The official entry can." };
    } else {
      vs = { cls: "bad", icon: <X size={18} />, text: "Not one of the official options for this item." };
    }
  }

  return (
    <div className="checker" id="check">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(item);
        }}
      >
        <div className="row">
          <div className="seg" role="radiogroup" aria-label="City">
            {cities.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={c.id === cityId} onClick={() => setCityId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <span style={{ color: "var(--faint)", fontSize: 14 }}>
            {city.authority} · {city.license.split(" (")[0]}
          </span>
        </div>
        <div className="ask">
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder={city.placeholder}
            aria-label="Item to check"
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="go" type="submit" disabled={busy || !item.trim()}>
            {busy ? <Loader2 size={20} className="spin" /> : <ArrowRight size={20} />}
            Check
          </button>
        </div>
        <div className="chips">
          <span className="lab">Try</span>
          {city.chips.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              onClick={() => {
                setItem(c);
                void run(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="opts">
          <label>
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Also ask the same model with no official list
          </label>
        </div>
      </form>

      {res?.source === "fallback" && (
        <div className="banner" role="note">
          <TriangleAlert size={18} />
          <span>
            <b>Word-for-word lookup only.</b> {res.fallbackReason} BinRules can still answer when your words match an official entry exactly.
          </span>
        </div>
      )}
      {err && <div className="errbox" role="alert">{err}</div>}

      {busy ? (
        <Loading stage={stage} />
      ) : !a ? (
        <div className="empty">
          Pick a city, type an item, and I will show you the exact entry in the council&apos;s own list, or tell you it is not covered.
        </div>
      ) : (
        <div className={`results fadein ${base ? "" : "solo"}`} aria-live="polite">
          <div className="pane">
            <h2>BinRules · official list only</h2>
            <span className={`status ${a.status}`}>
              {a.status === "answer" && <ShieldCheck size={18} />}
              {a.status === "depends" && <Scale size={18} />}
              {a.status === "not_covered" && <SearchX size={18} />}
              {a.status === "answer" ? "Answer from the official list" : a.status === "depends" ? "Several official entries apply" : "Not covered by the official list"}
            </span>

            {a.status !== "not_covered" ? (
              <>
                {a.status === "depends" && <p className="why">{a.reason} Your words did not say which one, so here are all of them.</p>}
                {a.entries.map((e) => (
                  <article className="entry" key={e.id}>
                    <p className="official-label">Official entry</p>
                    <div className="entry-head">
                      <h3>{e.name}</h3>
                      <span className="eid">{e.id}</span>
                    </div>
                    <div className="bins">
                      {e.bins.map((b, i) => (
                        <BinChip key={b.code} b={b} ord={e.bins.length > 1 ? i + 1 : undefined} />
                      ))}
                    </div>
                    {e.bins.length > 1 && <p className="nosrc" style={{ marginTop: -4 }}>The council lists these in this order.</p>}
                    {e.note && <p className="note">{e.note}</p>}
                    <div className="src">
                      <span>
                        {info.sourceTitle} · {info.license.split(" (")[0]}
                      </span>
                      {e.links.map((l) => (
                        <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                          {l.label} <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <>
                <p className="why">{a.reason}</p>
                <p style={{ margin: "0 0 4px", fontWeight: 600 }}>I will not guess. Ask {info.councilName}.</p>
                {a.closest.length > 0 && (
                  <div className="closest">
                    <span className="nosrc">Nearest entries in the list. These are not a match for your item:</span>
                    <div className="chips">
                      {a.closest.map((c) => (
                        <span className="chip" key={c.id}>
                          {c.name.length > 60 ? c.name.slice(0, 58) + "..." : c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <a className="cta" href={info.councilUrl} target="_blank" rel="noreferrer">
                  Check with {info.councilName} <ExternalLink size={16} />
                </a>
              </>
            )}

            <details className="how">
              <summary>
                <ChevronDown size={16} /> How this was checked
              </summary>
              {a.mode === "llm" ? (
                <>
                  {a.trace.expansions.length > 0 && (
                    <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>
                      The model read &quot;{asked?.item}&quot; as: {a.trace.expansions.slice(0, 3).join(", ")}. It never sees the bins.
                    </p>
                  )}
                  <ul className="gates">
                    {a.trace.gates.map((g) => (
                      <li key={g.name} className={g.passed ? "pass" : "fail"}>
                        {g.passed ? <Check size={16} /> : <X size={16} />}
                        <span>
                          <b>{g.name}:</b> {g.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>No model was used. Your words were compared with the official entry names directly.</p>
              )}
              <p className="meta">
                {res?.source === "saved-example"
                  ? `Saved example, computed ${res.computed} by the same pipeline.`
                  : res?.source === "cache"
                    ? "Same question answered earlier today."
                    : res?.source === "fallback"
                      ? "Fallback mode."
                      : `Live. ${a.usage.calls} model calls, about $${a.usage.costUsd.toFixed(5)}.`}{" "}
                Demo budget left today: {res?.remaining.queries} checks.
              </p>
            </details>
          </div>

          {base && (
            <div className="pane">
              <h2>Same model alone · no list</h2>
              {base.bin === "UNSURE" ? (
                <span className="bin tone-grey">
                  <span className="dot" aria-hidden="true" />
                  UNSURE
                </span>
              ) : (
                <div className="bins">
                  <BinChip b={{ label: base.bin, tone: baseTone ?? "grey" }} />
                </div>
              )}
              {vs && (
                <p className={`vsline ${vs.cls}`}>
                  {vs.icon} {vs.text}
                </p>
              )}
              {base.why && <p className="note" style={{ borderColor: "var(--rule-strong)" }}>{base.why}</p>}
              <p className="nosrc">No entry, no link, no way to check it. The same model that answers here is the one BinRules uses to match words.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
