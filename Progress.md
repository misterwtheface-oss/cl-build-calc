# Combolands Guild Overlap Explorer — Progress

## Current state
**P0 complete + first layout revision (2026-09-13).** Pick two of the **7 core
guilds** via full-height flanking banners (grey Null placeholder → guild selector;
Arcane/Rogues are not selectable). The **centre column groups overlapping
buildings by shared trait** — one section per shared functional category, headed by
its colour-coded trait banner, holding tiles (from both guilds) that own/target
that trait — plus shared nature interactions, shared counselors ("votes to
focus"), a bridge-heirlooms block, a "Shared tags" quick index, and each guild's
remaining buildings/heirlooms in a collapsed per-guild section. Detail overlays for
buildings, heirlooms, counselors, categories, events, nature. `build-data.mjs`
compiles curated `_cl_extract` JSON → `data.js` (window.CL_DATA, ~188 KB) with
hygiene guardrails. Next: trait × building cross-reference matrix; bridge /
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
- [ ] Raise sprite join rate (see Known issues)

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

## Known issues / warnings
- **~28 building sprites unresolved** → text-letter placeholder (AppleOrchard,
  Irrigation, Reservoir, the four Temple wings, SuppliesStall/PaintersStall,
  FaerieRing/MagicPortal/WizardsTower, Excavation, etc.). Some are cut/unused;
  others need curated sprite overrides in `build-data.mjs`. Warns loudly, never 404s.
- **~31/133 heirloom sprites unresolved** (mostly Gem/Tome variants whose className
  ≠ sprite basename). Text placeholder for now.
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
