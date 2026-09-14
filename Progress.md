# Combolands Guild Overlap Explorer — Progress

## Current state
**P0 scaffold complete and runnable (2026-09-13).** Pick two of nine guilds via
flanking banner slots (grey Null placeholders → guild selector overlay); the app
shows, per guild, building tiles split **Primary overlap / Other** (sorted rarity
→ alpha) and a Heirlooms section with the same split, plus a shared centre strip
(shared traits, shared nature, shared counselors, shared events) and the named
combo title. Detail overlays exist for buildings, heirlooms, counselors,
categories, events and nature nodes. `build-data.mjs` compiles the curated
`_cl_extract` JSON into `data.js` (window.CL_DATA, ~186 KB) with hygiene
guardrails. Next: the trait × building cross-reference matrix and the bridge /
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
- [ ] Expand `[Token]` description DSL to readable text (wire in labels.json)
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
- Full description `[Token]` DSL is only lightly cleaned (P1).

## Session log
- 2026-09-13: Initial scaffold. Read `_cl_extract` (guild crossovers, building
  interactions, council relationships) + skill conventions; confirmed palette,
  overlap rule, and scope with the user. Copied curated JSON + sprites; wrote
  build-data.mjs (guild/category/building/heirloom/counselor/nature/combo model +
  guardrails), index/styles/app for the flanking-banner comparison view; planning
  docs; git init. Build clean (errors 0; sprite/name gaps parked above).
