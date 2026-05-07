# IFrag

Local fragrance formulation tool with live IFRA compliance checking.

A single-user web app that runs on your own machine. It groups your formulas into **projects** with **versioned trials**, keeps a **materials library** (with CAS, supplier, dilution, price, stock), checks every change against the **IFRA standards** in real time (with annex contributions for naturals), computes **cost per batch**, and keeps a per-trial **olfactory evaluation log** (top / heart / base / dry-down).

## Quickstart

You need [Node.js](https://nodejs.org) (v20 or newer). Then:

```bash
npm install
npm run build
node ./bin/ifrag.js
```

The first run creates `~/.ifrag/ifrag.db`, applies migrations, seeds a starter dataset (~110 materials matching a typical perfumer's library, IFRA 51st-Amendment starter limits for the relevant restricted ingredients, and the annex contributions of common naturals), then opens `http://127.0.0.1:4173` in your browser.

Useful flags:

```bash
node ./bin/ifrag.js --port 5050           # use a different port
node ./bin/ifrag.js --data-dir ~/work/ifrag-prod
node ./bin/ifrag.js --no-open             # don't auto-open the browser
node ./bin/ifrag.js --reset               # wipe the database (with confirmation)
```

For development:

```bash
npm run dev
```

## What's in the box

- **Projects** — group related trials.
- **Trials** — versioned formulas (v1, v2, v3, forks) with notes. Default unit is parts-per-1000 (perfumer convention) with a toggle to % or grams (with batch size).
- **Live IFRA matrix** — every active category (Cat 1 through Cat 12 with sub-categories 5A–D, 7A–B, 10A–B, 11A–B) shows pass / warn / fail at the current dosage. Click a row to see which standards are tripped and which materials contribute, including annex contributions from naturals (e.g. citral via Lemongrass, furocoumarins via Bergamot).
- **Cost** — per gram, per 10g, per 100g of finished compound. Top cost drivers per batch.
- **Olfactory evaluation log** — stage (top/heart/base/dry-down/overall), elapsed minutes from a reference time, 1–5 rating, free notes.
- **Materials library** — full CRUD, search, filters by natural/synthetic and IFRA-link status. Per-material restricted-constituent editor for naturals.
- **Materials importer** — drag your existing XLSX or CSV. The importer auto-maps headers (Name, CAS, Supplier, Dilution, Price `13 Euros/KG`, Family, Volatility, Dosage, etc.) and lets you correct the mapping before committing.
- **IFRA importer** — for when you have the official 51st (or 52nd) Amendment data. Drag a CSV/XLSX with one row per substance and one column per category. Limit cells accept a number (% in finished product), `P` (prohibited), or `NR` (no restriction).
- **Backup** — Settings → Export DB downloads the SQLite file. Restore by replacing the file at the printed path.

## Where the data lives

- The database file: `~/.ifrag/ifrag.db` (override with `--data-dir` or `IFRAG_HOME`).
- Seed data and IFRA starter standards: `seed/` in this repo.
- Migrations: `migrations/`.

## IFRA accuracy

The shipped IFRA data is a **starter dataset** transcribed from publicly documented 51st-Amendment values for the restricted substances most likely to appear in a small perfumer's library. It is good enough to surface the right concerns at the right time, but **not** a substitute for the official IFRA standards. Before relying on this for any commercial product, go to **IFRA → Import** and replace the starter amendment with the official CSV/XLSX.

The active amendment is shown as a banner across the top of the app whenever it's the starter.

## Tech

SvelteKit (adapter-node), better-sqlite3, Drizzle ORM, Tailwind, papaparse, SheetJS (xlsx), decimal.js, vitest.

## Tests

```bash
npm test
```

Covers the compliance engine end-to-end: prohibition vs. restriction vs. specification, restriction at threshold, dilution, annex sums, multiple materials contributing the same restricted constituent, varying limits across categories.
