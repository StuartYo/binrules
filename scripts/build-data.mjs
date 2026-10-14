// Builds data/brisbane.json and data/toronto.json from the cities' official open datasets.
// Usage: node scripts/build-data.mjs            (downloads fresh copies)
//        node scripts/build-data.mjs --cache DIR (reads brisbane_raw.json / toronto_raw.json from DIR)
// Entries keep the official wording. Nothing is summarised or reworded.
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "data");
const cacheIdx = process.argv.indexOf("--cache");
const CACHE = cacheIdx > -1 ? process.argv[cacheIdx + 1] : null;

const BNE_API = "https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/what-goes-in-my-bin";
const TOR_JSON =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/76ea33f1-31f0-42ea-a295-385fb4d94ea9/resource/274fde37-233c-485d-bc68-8177f0793412/download/2023-11-27-waste-wizard-data-from-towaste-app.json";

async function getJson(url, cacheName) {
  if (CACHE) return JSON.parse(fs.readFileSync(path.join(CACHE, cacheName), "utf8"));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const clean = (s) => (s == null ? null : String(s).replace(/\s+/g, " ").replace(/�/g, "'").trim() || null);

// ---------------------------------------------------------------- Brisbane
const BNE_BINS = {
  "Red bin": { code: "red-bin", label: "Red bin", tone: "red", description: "General waste kerbside bin (red lid)." },
  "Yellow bin": { code: "yellow-bin", label: "Yellow bin", tone: "yellow", description: "Recycling kerbside bin (yellow lid)." },
  "Green bin": { code: "green-bin", label: "Green bin", tone: "green", description: "Garden organics kerbside bin (lime green lid)." },
  "Resource recovery centre - yellow line": {
    code: "rrc-yellow",
    label: "Resource recovery centre, yellow line",
    tone: "yellow",
    description: "Council resource recovery centre: recyclables accepted at the yellow lines, usually free.",
  },
  "Resource recovery centre - red line": {
    code: "rrc-red",
    label: "Resource recovery centre, red line",
    tone: "red",
    description: "Council resource recovery centre: general waste accepted at the red lines, fees apply.",
  },
  "Resource recovery centre - green line": {
    code: "rrc-green",
    label: "Resource recovery centre, green line",
    tone: "green",
    description: "Council resource recovery centre: green waste accepted at the green lines, fees apply.",
  },
  "Public drop off points": {
    code: "public-drop",
    label: "Public drop off points",
    tone: "blue",
    description: "Container refund points, participating retailers, pharmacies and similar public drop-off locations.",
  },
  "Council drop off points": {
    code: "council-drop",
    label: "Council drop off points",
    tone: "blue",
    description: "Council drop-off locations such as community recycling hubs.",
  },
  "Free hazardous waste drop-off days": {
    code: "haz-days",
    label: "Free hazardous waste drop-off days",
    tone: "orange",
    description: "Free hazardous waste drop-off days at council resource recovery centres.",
  },
  "Kerbside large item collection": {
    code: "kerb-large",
    label: "Kerbside large item collection",
    tone: "grey",
    description: "Council kerbside large item collection.",
  },
  Other: {
    code: "other",
    label: "Other (see note)",
    tone: "grey",
    description: "A special instruction applies, such as home composting or a specialist contractor. Read the official note.",
  },
};

function splitBneOption(v) {
  if (!v) return [];
  if (v === "Council drop off points/Public drop off points") return ["Council drop off points", "Public drop off points"];
  return [v];
}

async function brisbane() {
  const meta = CACHE
    ? JSON.parse(fs.readFileSync(path.join(CACHE, "brisbane_meta.json"), "utf8"))
    : await getJson(BNE_API, "brisbane_meta.json");
  const rows = await getJson(`${BNE_API}/exports/json`, "brisbane_raw.json");
  rows.sort((a, b) => Number(a.index) - Number(b.index));
  const used = new Set();
  const entries = rows.map((r) => {
    const bins = [];
    for (const k of ["option_1", "option_2", "option_3"]) {
      for (const o of splitBneOption(r[k])) {
        if (!BNE_BINS[o]) throw new Error(`unknown Brisbane option: ${o}`);
        if (!bins.includes(BNE_BINS[o].code)) bins.push(BNE_BINS[o].code);
        used.add(o);
      }
    }
    return {
      id: `bne-${r.index}`,
      name: clean(r.item_name),
      aliases: [],
      bins,
      note: clean(r.published_note),
      url: clean(r.published_note_url),
    };
  });
  const bins = Object.fromEntries([...used].map((o) => [BNE_BINS[o].code, BNE_BINS[o]]).map(([c, b]) => [c, { label: b.label, tone: b.tone, description: b.description }]));
  const m = meta.metas?.default ?? {};
  return {
    city: "brisbane",
    displayName: "Brisbane, Australia",
    authority: "Brisbane City Council",
    source: {
      title: "What goes in my bin (Brisbane City Council open data)",
      datasetUrl: "https://data.brisbane.qld.gov.au/explore/dataset/what-goes-in-my-bin/",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      modified: m.modified ?? null,
      retrieved: new Date().toISOString().slice(0, 10),
      councilUrl: "https://www.brisbane.qld.gov.au/bins-waste-and-recycling",
      councilName: "Brisbane City Council",
      note: "Entry URLs are the council pages named in the dataset's own published_note_url field.",
    },
    bins,
    entries,
  };
}

// ---------------------------------------------------------------- Toronto
const TOR_BINS = {
  "Blue Bin": { code: "blue-bin", label: "Blue Bin", tone: "blue", description: "Recycling (Blue Bin)." },
  "Green Bin": { code: "green-bin", label: "Green Bin", tone: "green", description: "Organics (Green Bin)." },
  "Garbage Bin": { code: "garbage", label: "Garbage Bin", tone: "grey", description: "Garbage (landfill)." },
  HHW: {
    code: "hhw",
    label: "Household Hazardous Waste",
    tone: "orange",
    description: "Household hazardous waste: take to a City drop-off depot or Community Environment Day.",
  },
  "Electronic Waste": {
    code: "e-waste",
    label: "Electronic waste",
    tone: "orange",
    description: "Electronics: curbside set-out rules or take to a City drop-off depot.",
  },
  "Oversized Item": {
    code: "oversized",
    label: "Oversized item",
    tone: "grey",
    description: "Oversized item set out 0.5 m from the garbage bin on collection day, or take to a depot.",
  },
  Metal: { code: "metal", label: "Scrap metal", tone: "grey", description: "Scrap metal set-out for curbside collection." },
  Depot: {
    code: "depot",
    label: "Drop-off depot",
    tone: "blue",
    description: "Not collected at curbside: take to a City of Toronto drop-off depot (fees may apply).",
  },
  "Yard Waste": { code: "yard-waste", label: "Yard waste", tone: "green", description: "Yard waste collection." },
  "Christmas Tree": { code: "christmas-tree", label: "Christmas tree collection", tone: "green", description: "Christmas tree collection in January." },
  "Not Accepted": {
    code: "not-accepted",
    label: "Not accepted",
    tone: "red",
    description: "Not accepted by the City of Toronto: arrange private disposal.",
  },
};
const TOR_CAT_ALIAS = { Garbage: "Garbage Bin", "Oversized item": "Oversized Item", "Not accepted": "Not Accepted" };

async function toronto() {
  const rows = await getJson(TOR_JSON, "toronto_raw.json");
  const used = new Set();
  const entries = rows.map((r) => {
    let cat = String(r.category).trim();
    cat = TOR_CAT_ALIAS[cat] ?? cat;
    if (!TOR_BINS[cat]) throw new Error(`unknown Toronto category: ${cat}`);
    used.add(cat);
    const parts = String(r.item)
      .split("/")
      .map(clean)
      .filter(Boolean);
    return {
      id: `tor-${r.id}`,
      name: parts[0],
      aliases: parts.slice(1),
      bins: [TOR_BINS[cat].code],
      note: clean((r.instructions ?? []).join(" ")),
      url: null,
    };
  });
  const bins = Object.fromEntries([...used].map((c) => [TOR_BINS[c].code, { label: TOR_BINS[c].label, tone: TOR_BINS[c].tone, description: TOR_BINS[c].description }]));
  return {
    city: "toronto",
    displayName: "Toronto, Canada",
    authority: "City of Toronto",
    source: {
      title: "Waste Wizard (City of Toronto Open Data), snapshot 2023-11-27",
      datasetUrl: "https://open.toronto.ca/dataset/waste-wizard-lookup-table/",
      license: "Open Government Licence - Toronto (portal default; the dataset's metadata says licence not specified)",
      licenseUrl: "https://open.toronto.ca/open-data-license/",
      modified: "2023-11-27",
      retrieved: new Date().toISOString().slice(0, 10),
      councilUrl: "https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-wizard/",
      councilName: "City of Toronto Solid Waste Management Services",
      note: "The open dataset is a 2023 snapshot. Toronto's live Waste Wizard may have changed since.",
    },
    bins,
    entries,
  };
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of [["brisbane", brisbane], ["toronto", toronto]]) {
  const data = await fn();
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
  console.log(name, data.entries.length, "entries,", Object.keys(data.bins).length, "bins");
}
