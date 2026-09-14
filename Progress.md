# Combolands Guild Overlap Explorer — Progress

## Current state
**P0 + layout/banner polish + icon-system pass, deployed (2026-09-13).** Pick two of the **7 core
guilds** via full-height flanking banners (grey Null placeholder → guild selector;
Arcane/Rogues are not selectable). The **centre column groups overlapping
buildings by shared trait** — one section per shared functional category, headed by
its colour-coded trait banner, holding tiles (from both guilds) that own/target
that trait — plus shared nature interactions, shared counselors ("votes to
focus"), a bridge-heirlooms block, a "Shared tags" quick index, and each guild's
remaining buildings/heirlooms in a collapsed per-guild section. Detail overlays for
buildings, heirlooms, counselors, categories, events, nature. `build-data.mjs`
compiles curated `_cl_extract` JSON → `data.js` (window.CL_DATA, ~188 KB) with
hygiene guardrails. Building→sprite mapping is now **authoritative** (read from the
game's own ScriptableObjects, not name-guessed) and tiles use a square icon with
guild + rarity rails. Next: trait × building cross-reference matrix; bridge /
universal-modifier section (P1).

## Backlog
### In progress
- (none — P0 landed)

### Next up (P1)
- [ ] Trait × building cross-reference matrix per guild (glyph cells ● / ◆ / ○,
      sticky both-axis headers, Shared row) — the flagship synergy view
- [ ] Dedicated **Bridges** section: neutral buildings, structural minor-guild
      bridges (all bridge into Arcane), dynamic category-granters; plus the
      **universal adjacency modifiers** (Campfire/Obelisk/Wall/Town Bell…)
- [ ] Better heirloom↔pair resolution (count target *tags*, not only categories)
      and show heirloom↔building synergy within a pair
- [ ] Put heirloom sprites on the same authoritative SO map as buildings (see Known issues)
- [ ] Re-datamine a current game build to capture the 4 art-less code-stub buildings

### Later (P2)
- [ ] Arcane/Rogues unlock context (Wizard/Spymaster gating, gated buildings)
- [ ] Score-preview / combo-cascade simulation (LIFO trigger engine, per-week cap)
- [ ] Shareable pair URL; Cloudflare Web Analytics beacon (public release ONLY)
- [ ] Surface the milestone score ladder somewhere useful

### Done
- [x] Skeleton scaffolded, P0 comparison flow runnable (2026-09-13)
- [x] build-data.mjs data contract + hygiene guardrails (2026-09-13)
- [x] Game-derived parchment/gold palette with per-guild banner colours (2026-09-13)
- [x] **`[Token]` description DSL → bold, clickable keywords** (2026-09-13). All 205
      description tokens map to plain language: value tokens ([Cooldown], [BaseScore],
      [MultParam], score families…) inject the piece's REAL number from its `*_params`
      (247/295 injected; 48 fall back to the stat name where the value is computed in a
      code override); category/nature/building/counselor tokens become links that open
      the matching detail overlay; {directive:} clauses render italic, [BREAK]→line
      break. `build-data.mjs::expandDesc()` emits `descHTML` per building/heirloom;
      dictionary documented in `_cl_extract/labels.json` (descriptionTokens).
- [x] **Overlap sections by shared EVENT** (2026-09-13), mirroring the shared-trait
      sections: one section per shared event, headed by the event, holding buildings
      from both guilds that emit (▲) / listen (▼). Event names shortened to the middle
      word (`EVENT_LABEL` in build-data.mjs): Building*Occurred → Removal / Construction
      / Transformation, ScoringOccurred → Scoring, OnRemove → Self Removed, etc.; the
      full sentence stays in `.note` for the detail overlay + tooltip.
- [x] **Authoritative building→sprite map** (2026-09-13). `tools/gen_building_sprites.mjs`
      reads each building SO (`_gameTag` → key, `_sprite` GUID → sprite name) into
      `data/src/building_sprites.json`; build-data uses it primary. Fixed the mis-assigned
      House/Obelisk sprites, recovered MagicPortal (BMagicMirror) & SuppliesStall
      (BStallFishmonger), added 12 footprint-only buildings as `assets/buildings_tiny/`.
      0 mismatches vs the game. Building placeholders 24→4.
- [x] **Icon-tile redesign + trim** (2026-09-13). `tools/trim_icons.py` lossless-trims
      transparent margins; tiles show a square ~50%-width icon (aspect locked, tall art
      can't stretch it), a rarity rail on the right mirroring the guild rail on the left,
      and interface/arrow markers top-right. Detail-overlay icon = 40px square;
      counselors keep their true tall portrait aspect ratio (card + detail).
- [x] **Mobile sidebar name centering fix** (2026-09-13). Restored `align-items:center`
      on the mobile `.banner-slot .banner-fig` (regressed in the nameplate rework).

## Known issues / warnings
- **4 building sprites unresolved** → text-letter placeholder: Bakery, PaintersStall,
  Excavation, ExcavationUncovered. These are `_BuildingBehaviour` code stubs with NO
  ScriptableObject and NO sprite anywhere in the current datamine build (user confirms
  they exist in the live game → the extract predates them). Fix = re-datamine a current
  build. Warns loudly, never 404s.
- **~31/133 heirloom sprites unresolved** (mostly Gem/Tome variants whose className
  ≠ sprite basename). Only 2 gems shipped in the export. Heirlooms are NOT yet on the
  authoritative SO map (buildings are) — text placeholder for now.
- **1 nature node without a sprite:** Herbs (no dedicated PNG in the export) → text
  fallback (❦ glyph).
- **8 buildings have no localized name** (Bakery, the four *Stall variants,
  Excavation×2) → prettified className fallback; the stalls are real crossover
  pieces so they're kept, not excluded.
- Cross-targeting is from *base* target tags only; conditional overrides + dynamic
  granters mean real in-play overlap can exceed what's shown (documented, P1).
- 48 value tokens render the stat name (not a number) because that piece computes the
  value in a code override (null in `*_params`) — same open item as the base-tag limit.

## Session log
- 2026-09-13 (4): Icon-system pass, deployed (`634bfbb`). Investigated missing building
  art → found the calc only ever pulled full-portrait atlas art. Rebuilt the mapping
  from the game's own SOs (`tools/gen_building_sprites.mjs` → `building_sprites.json`);
  this fixed silently-wrong House/Obelisk sprites and recovered Portal/Supplies Stall,
  and surfaced that only 4 buildings (code stubs) truly lack art in this datamine.
  Added `assets/buildings_tiny/` for footprint-only buildings, `tools/trim_icons.py`
  to trim transparent margins so icons fill. Tile redesign: square icon (~50% width,
  stretch-proof), rarity rail right / guild rail left, interface-arrow markers top-right.
  Detail-overlay icon shrunk to a 40px square; counselors take their portrait aspect
  ratio. Fixed a mobile regression (vertical guild-name centering on the sidebar flanks).
  Verified via headless Chrome (CDP) at desktop + 390px mobile; Pages built + live.
- 2026-09-13 (3): Banner + selector polish. Guild NAME now sits in the banner's
  actual nameplate box — measured from the game art (decoded the banner PNG; the
  box spans ~63–71% of the flag, centered ~67%) rather than guessed; the game's
  own `UI.StartingSelectScreen/CategoryBanner` overlays the name there. `--name-top`
  var = 65% (slight upward bias). Fixed a latent bug: the name was positioned vs
  the full-height column (drifted with viewport under object-fit letterboxing) —
  `.banner-fig` now shrink-wraps the flag so the name's % is relative to the image.
  Main-screen flank name enlarged (`.banner-slot .banner-name`). Guild selector
  rebuilt: dropped the card containers, renders the full banner flags (name inside,
  identical to main page), centered, bigger; mobile = 4 + 3 per row. Arcane/Rogues
  already excluded from selection. Deployed.
- 2026-09-13 (2): Layout revision per user. **Only the 7 core guilds are
  selectable** (Arcane/Rogues dropped from the picker + coerced out of a persisted
  pair). Banners now **fill the full flank height** with the guild name read
  *inside* the banner; removed the caption/frame/"change"/"n buildings" chrome.
  Overlapping buildings moved to the **centre, grouped by shared trait** — each
  shared functional category is a section headed by its colour-coded trait banner,
  containing tiles (from both guilds) that own (▤) or target (⇄) that trait, with a
  guild badge + coloured border per tile. Kept shared nature / counselors / a
  bridge-heirlooms block + a "Shared tags" quick index; each guild's non-overlap
  buildings & heirlooms live in a collapsed per-guild section at the bottom.
- 2026-09-13: Initial scaffold. Read `_cl_extract` (guild crossovers, building
  interactions, council relationships) + skill conventions; confirmed palette,
  overlap rule, and scope with the user. Copied curated JSON + sprites; wrote
  build-data.mjs (guild/category/building/heirloom/counselor/nature/combo model +
  guardrails), index/styles/app for the flanking-banner comparison view; planning
  docs; git init. Build clean (errors 0; sprite/name gaps parked above).
