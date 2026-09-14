# Combolands — Guild Overlap Explorer

A single-page tool for **Combolands: Roguelike Citybuilder**. A run picks exactly
**two of nine guilds**; this tool shows how any pair interlocks — which buildings
overlap, which heirlooms bridge them, which nature nodes, counselors, functional
categories ("traits") and event types they share.

It is not a build-slot planner. The home screen **is** the comparison: two guild
banners flank the screen (grey "Null" placeholders until chosen), each guild's
building & heirloom tiles sit beside its banner, and the **shared overlap
surface** fills the centre strip.

## Run it locally

```sh
node tools/serve.mjs          # then open http://localhost:8080
```

`tools/serve.mjs` also prints a LAN URL for real phone testing on the same Wi-Fi.
Start it only while testing; stop it (Ctrl+C) when done.

## Rebuild the data

The SPA reads `data.js` (`window.CL_DATA`), generated from the curated datamine
inputs in `data/src/*.json`:

```sh
node build-data.mjs           # sprite/desc gaps warn; dangling refs are errors
node build-data.mjs --strict  # promote warnings to errors
```

The build runs **data-hygiene guardrails first** — it resolves every guild,
category, counselor and asset reference and refuses to write `data.js` on a hard
error, leaving the last good copy intact. `data.js` **is** committed (GitHub
Pages serves it with no build step).

## How it works

- `index.html` — three roots: `#app` (comparison), `#overlay-root` (guild
  selector), `#detail-overlay-root` (detail pages, stacks above).
- `styles.css` — palette in `:root`; per-guild and per-category colours come from
  the **data**, injected inline (`--g-color`, `--aff-color`/`--aff-text`).
- `app.js` — vanilla, explicit re-render; event delegation bound once per root;
  overlays statically sized; scroll preserved on every re-render.
- `build-data.mjs` — compiles `data/src/*.json` + `assets/` → `data.js`.
- `data/src/` — curated JSON copied from the `_cl_extract` datamine (tracked).
- `assets/` — the sprites the SPA serves (buildings, items, council, guilds,
  banners, nature).

See `SPEC_PLAN.md` (architecture + data model), `WIKI_CONTEXT.md` (game facts +
datamine provenance) and `Progress.md` (backlog + status).

## Deploy to GitHub Pages (later, user-initiated)

Push to a repo and enable Pages on the default branch root. No build step is
needed — `data.js` is committed and everything is static.
