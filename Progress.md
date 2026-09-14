# Combolands Guild Overlap Explorer — Progress

## Current state
**P0 + layout/icons + Appendix + neutral buildings + interaction-depth pass, deployed (2026-09-14).**
Pick two of the **7 core guilds** via full-height flanking banners (grey Null placeholder → guild
selector; Arcane/Rogues are not selectable). The **centre column groups overlapping buildings by
shared trait / shared event**, each section now split into two labelled role subgroups —
what **acts on** the trait/event (scores off / targets / emits) vs what **provides/reacts to** it
(carries the trait / listens) — plus **shared neutral buildings** (draftable Neutral cards both
guilds interact with, nature-node style), shared nature interactions, shared counselors, a
bridge-heirlooms block, a "Shared tags" quick index, each guild's remaining pieces collapsed, and a
collapsed **"Other heirlooms"** section so every heirloom has a home for any pair. A header
**🔍 Appendix** (replaced the old Swap button) is a global searchable index of every detail page.
Detail overlays for buildings, heirlooms, counselors, categories, events, nature; the building
detail now shows the **main action verb** (Removes/Buffs/Transforms X) and splits interactions into
**"Acts on"** vs **"Responds to"**. `build-data.mjs` compiles curated `_cl_extract` JSON → `data.js`
(window.CL_DATA) with hygiene guardrails. Building→sprite mapping is authoritative (game SOs).
Next: trait × building cross-reference matrix; universal-modifier section (P1).

## Backlog
### In progress
- (none — P0 landed)

### Next up (P1)
- [ ] Trait × building cross-reference matrix per guild (glyph cells ● / ◆ / ○,
      sticky both-axis headers, Shared row) — the flagship synergy view
- [ ] Dedicated **Bridges** section: structural minor-guild bridges (all bridge
      into Arcane), dynamic category-granters; plus the **universal adjacency
      modifiers** (Campfire/Obelisk/Wall/Town Bell…). (Neutral buildings ✓ done.)
- [ ] Show heirloom↔building synergy within a pair (which specific buildings a
      pair-relevant heirloom boosts), building on the new item_affected attribution
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
- [x] **Appendix global search** (2026-09-14). 🔍 Appendix button (replaced Swap); z150
      overlay, lazy-built index of every detail page, opens the same detail a click would,
      scoped to all guilds; fixed 88vh panel; search not auto-focused.
- [x] **Neutral buildings as a shared edge** (2026-09-14). 14 guild-less cards wired into
      detail/[Token] links/Appendix + a "Shared neutral buildings" centre block via
      per-guild connection resolution (nature-node style).
- [x] **Building main-action extraction** (2026-09-14). `build_building_interactions.py`
      recovers the verb (remove/transform/buff/spawn) per interaction; detail shows
      "Removes/Buffs/Transforms X in range" instead of a vague scan.
- [x] **Heirloom guild attribution + always-shown** (2026-09-14). `build_item_affected.py`
      mines affinity (tome notes / consumer dispatcher / per-building consumers / triggers);
      45 heirlooms resolve to a guild; collapsed "Other heirlooms" shows the rest.
- [x] **Interaction role split** (2026-09-14). `interactionRole()` → building detail
      "Acts on" vs "Responds to"; shared trait/event sections split into interactor /
      interface subgroups; directional a/an-correct phrasing.

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
- 2026-09-14 (5): Heirloom icons + interaction-truth pass per user. (a) **29 heirloom icons**
  that 404'd to a letter placeholder now resolve — item keys rarely match their Sprite asset
  name (AnimalFeedBag→ItemFeedBag), so `tools/gen_item_sprites.mjs` pulls the authoritative
  key→sprite map from each item SO's `_sprite` GUID (`data/src/item_sprites.json`), consumed by
  build-data as the primary resolver. (b) **Description "points" → real values** — `scoreOf` read
  the wrong per-list field (`cat`/`tile` vs `category`), so Scarecrow etc. showed "points" not
  "+30". (c) **Acts-on locality** — interactions carry `locality`/`range` from ScorePreviewMode /
  snippet; "adjacent" vs "in range N" no longer guessed. (d) **Method-aware verbs** — extractor now
  records each effect ref's enclosing `method`, killing a family of false "Scores off": Irrigator
  adjacency → "Matures in 1 week"; `CanAddToDraftingPool` → "Enters the draft pool once you own X";
  `CanBeBuiltOn` → "Can only be built next to X". (e) **Grant detection** — a bare SetTargetCategories
  (score 0) that the description DSL marks `considered [X]` is now a **Provides** relationship, not
  "Scores off" (Trapper's Lodge → Husbandry); split out in the building detail AND in the overlap
  trait sections + category detail (`providesCat`; new ⤳ marker). (f) Removed two base-helper
  over-attributions (`ScoreSpecialResource`→CorruptedGrove on 11 buildings; spurious Ore/GoldOre
  spawns). "Scores off … +N" now appears only with a real score.
- 2026-09-14 (4): Four UX fixes per user (`d3b5b78`). Appendix panel pinned to a fixed
  88vh (was max-height) so it no longer resizes/jumps as the filtered list shrinks.
  Dropped the "unowned map structures" / "· unowned" wording from neutral buildings —
  they're draftable Neutral cards, not solely pre-gen structures. Interaction copy made
  directional & specific (declared → "Scores off adjacent X"; conditions → "Activates
  only when an X is adjacent" / "Scales with your equipped X heirloom", a/an-correct).
  Added `interactionRole()` (out = acts on / in = responds to): building detail splits
  "Interacts with" into **Acts on** vs **Responds to**; shared trait/event sections split
  into labelled subgroups (Score off / Provide; Emit / React to) — interactors vs
  interfaces are now unmistakable.
- 2026-09-14 (3): Two extraction-depth fixes (`d543f97`). (a) **Main action** was lost —
  building interactions listed scanned tags but not the verb. Enhanced
  `build_building_interactions.py` to recover the action from the enclosing method (effect
  tags fetched cross-line: Composter foreach Manure→RemoveBuilding; declared targets
  iterated in range: Woodcutter harvests Trees, Composter buffs Farm, Granary transforms
  Crop) with guards (Sewer removes NON-targets, Jeweller only scores). (b) **Heirlooms
  showed nowhere** — reachesGuilds came only from SetTargetCategories (7/133). New
  `build_item_affected.py` mines guild affinity from tome notes, the consumer dispatcher,
  per-building consumers & trigger bodies → item_affected.json; 45 heirlooms now resolve
  (broad cats excluded from reach). Added collapsed "Other heirlooms" section so all 133
  appear. Regen tools/data in gitignored `_cl_extract`; data/src copies committed.
- 2026-09-14 (2): **Neutral buildings** wired into all features (`2882903`). 14 guild-less
  map structures (Wall/Well/Ruin/Plaza/Rail…) behave like nature nodes — a shared edge
  owned by neither guild. `buildRecord()` refactor + `connectionsByGuild`/`reachesGuilds`;
  merged into buildingByKey (detail + [Token] links) but kept out of guild columns; new
  "Shared neutral buildings" centre block; Appendix indexes all 14. Data-accurate & sparse
  (Well=Agri+Comm, Plateau/Scaffolding=Comm+Ind bridge core pairs).
- 2026-09-14 (1): **Appendix search** (`87a9b4f`, fix over `a335f54`). Header 🔍 Appendix
  button replaced Swap (swap removed); `#appendix-root` z150 overlay with a live search over
  a lazy-built index of every navigable page — a result opens the same detail overlay a
  click would, scoped GLOBALLY (all guilds) vs the pair-scoped main page. Search box not
  auto-focused. (Live-fixed a TDZ blank-screen: index referenced `esc` before init.)
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
