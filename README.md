# IFrag

Browser-based fragrance formulation tool with live IFRA compliance checking.

Runs entirely in your browser — SQLite compiled to WebAssembly, your data persisted to the
browser's Origin Private File System (with IndexedDB fallback). No server, no install, no
account. Group formulas into **projects** with **versioned trials**, keep a **materials
library**, check every change against the **IFRA standards** in real time (with annex
contributions for naturals), compute **cost per batch**, log per-trial **olfactory
evaluations**, and **promote any trial to a reusable accord** that flattens into other
formulas' compliance checks.

## Try it

Hosted on GitHub Pages (deployed automatically from this repo): **https://orsonbaz.github.io/ifrag/**

First load: the app downloads the SQLite WASM (~660 KB once, then cached) and seeds ~110
starter materials and the IFRA 51st-Amendment starter standards into your browser. Your data
stays on your machine — clearing browser storage deletes it. Use **Settings → Export DB** to
take a portable backup, or **Import DB** to move between devices.

## Run it locally

```bash
npm install
npm run dev          # vite dev at http://localhost:5173
```

For a production-equivalent build:

```bash
npm run build        # outputs static files to ./build
npx serve -s build   # any static file server works
```

## Desktop wrapper (optional)

If you want a standalone app icon, install [Rust](https://rustup.rs) and the platform
GTK/webkit dependencies, then:

```bash
npm run tauri:dev      # development with hot reload
npm run tauri:build    # produce a packaged native app
```

Tauri config lives in `src-tauri/`. Drop a 1024×1024 PNG at `src-tauri/icons/icon.png` and run
`npx @tauri-apps/cli icon ./src-tauri/icons/icon.png` to generate the platform-specific icon set
before the first build.

## What's in the box

- **Projects** — group related trials.
- **Trials** — versioned formulas (v1, v2, v3, forks) with notes. Default unit is parts-per-1000 (perfumer convention) with a toggle to % or grams (with batch size).
- **Live IFRA matrix** — every active category (Cat 1 through Cat 12 with sub-categories 5A–D, 7A–B, 10A–B, 11A–B) shows pass / warn / fail at the current dosage. Click a row to see which standards are tripped and which materials contribute, including annex contributions from naturals (e.g. citral via Lemongrass, furocoumarins via Bergamot).
- **Accords** — design an accord as a regular trial, click **Save as Accord** and it appears in the materials picker. Drop it into any formula at the desired pp1000; the compliance engine flattens it into its constituents (recursing through accords-of-accords up to 6 levels) so direct CAS links and annex contributions all cascade. Cost cascades the same way.
- **Cost** — per gram, per 10g, per 100g of finished compound. Top cost drivers per batch.
- **Olfactory evaluation log** — stage (top/heart/base/dry-down/overall), elapsed minutes from a reference time, 1–5 rating, free notes.
- **Side-by-side trial comparison** — pick any subset of a project's trials and diff their ingredient lists with added / removed / changed highlighting, plus a per-category compliance grid.
- **IFRA conformity certificate** — one-click PDF export per trial. Includes the formula, computed concentrations per category, and the detailed findings if anything fails.
- **Materials library** — full CRUD, search, filters by natural / synthetic / accord and IFRA-link status. Per-material restricted-constituent editor for naturals.
- **Materials importer** — drag your existing XLSX or CSV. The importer auto-maps headers (Name, CAS, Supplier, Dilution, Price `13 Euros/KG`, Family, Volatility, Dosage, etc.) and lets you correct the mapping before committing. Runs entirely in your browser.
- **IFRA importer** — for when you have the official 51st (or 52nd) Amendment data. Drag a CSV/XLSX with one row per substance and one column per category. Limit cells accept a number (% in finished product), `P` (prohibited), or `NR` (no restriction).
- **Backup / restore / reset** — Settings → Export DB downloads a `.db` file you can stash anywhere. Import DB replaces your current data with the contents of a `.db` file. Reset wipes everything and re-seeds.

## Where the data lives

Your data is stored in your browser, in the Origin Private File System (a private,
sandboxed area of disk) with an IndexedDB fallback. It's persisted automatically as you
work, with a debounced save plus an unload safety net.

To move between devices or browsers: **Settings → Export DB** on the source, **Import DB**
on the destination.

## IFRA accuracy

The shipped IFRA data is a **starter dataset** transcribed from publicly documented
51st-Amendment values for the restricted substances most likely to appear in a small
perfumer's library. It is good enough to surface the right concerns at the right time,
but **not** a substitute for the official IFRA standards. Before relying on this for any
commercial product, go to **IFRA → Import** and replace the starter amendment with the
official CSV/XLSX.

The active amendment is shown as a banner across the top of the app whenever it's the starter.

## Tech

SvelteKit (adapter-static, SPA mode), sql.js (SQLite-in-WASM), Tailwind, papaparse, SheetJS
(xlsx), pdf-lib, vitest.

## Tests

```bash
npm test
```

Covers the compliance engine end-to-end: prohibition vs. restriction vs. specification,
restriction at threshold, dilution, annex sums, multiple materials contributing the same
restricted constituent, varying limits across categories.
