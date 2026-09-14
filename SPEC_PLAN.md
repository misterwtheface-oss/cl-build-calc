# Combolands Guild Overlap Explorer — Spec Plan

## Purpose
A Combolands run picks **exactly two of nine guilds**; that pair is the whole
strategy of the run. This tool helps a player (or theorycrafter) **choose and
understand a guild pair before committing**: it surfaces, for any pair, the
concrete ways the two guilds interlock — buildings that score off / feed the
other guild, heirlooms that bridge both, shared map-gen nature nodes, counselors
whose bonuses reach both guilds (which votes to prioritise), and the shared
functional categories and event types that are the glue. It is an
association-surfacing tool, not a slot-fill build planner or a score simulator.

## Data model
Generated into `window.CL_DATA` by `build-data.mjs` from `data/src/*.json`.

- **Guild** (9) — `id, name, color, icon, badge, banner, isCore, isAdvanced,
  buildingCount`, plus per-guild rollups used to compute overlap:
  `functionalCategories[]`, `events[]`, `natureNodes[]`.
- **Category** ("trait") — `id, name, color, kind (guild|functional|resource),
  guildsSharing[], showInTable`. The colour-coded surface guilds expose to each
  other. Functional categories are the real overlap glue; guild-name categories
  exist to group and are excluded from shared-trait tallies (`showInTable:false`).
- **Building** (130 draftable) — `key, name, guild, rarity, rarityRank,
  ownedMinors[], ownedFunctional[], interactions[] {kind,value,guilds[],source,
  score,snippet,line}, interactionGuilds[] (other guilds it reaches), events[],
  emits[], listens[], natureNodes[], sprite, desc`.
- **Heirloom** (133) — `key, name, rarity, rarityRank, minors[] (Gem/Tome),
  targetCategories[], targetTags[], validTriggers[], reachesGuilds[],
  reachesCategories[], passive, sprite, desc`.
- **Counselor** (15) — `name, theme, multStackCategories[], passiveCategories[],
  guildReach[], guildReachByCategory{}, passive[], milestones[], sprite`.
- **NatureResource** (10) — `key (tag), name, guilds[], sprite`.
- **combos** — keyed `"GuildA|GuildB"` (sorted): `name` (the 21 named pairs, e.g.
  "Cash Croppers"), `sharedFunctionalCategories[]`, `sharedNature[]` (rich:
  resource + which buildings each guild uses), `structuralEdges`, `eventEdges`.
- **events** — `id, name, note`; **universalModifiers** — guild-agnostic buffs.

### Overlap resolution (client-side, the heart of the tool)
For a chosen pair (A, B), a building of guild A is a **primary overlap candidate**
if ANY holds against B (confirmed "any cross-guild link" rule):
1. its interactions resolve to guild B (`interactionGuilds` ∋ B), or
2. an owned functional category is one B also carries, or
3. it emits/listens an event type B's buildings also use, or
4. it interacts with a nature node B's buildings also use.
Everything else is "Other". Heirlooms partition per guild column: those reaching
that guild; "overlap" ones also reach the other guild. Each split is sorted
**rarity → alpha**.

## Architecture
- Stack: vanilla HTML/CSS/JS; data compiled to `window.CL_DATA` (see WIKI_CONTEXT).
- Data flow: `data/src/*.json` → `build-data.mjs` (+ hygiene guardrails) →
  `data.js` → `app.js`.
- Layout: build-first comparison. Two flanking guild banners (grey Null when
  empty); each guild's tiles beside its banner; shared overlap in the centre
  strip. Overlays: `#overlay-root` (guild selector), `#detail-overlay-root`
  (building/heirloom/counselor/category/event/nature detail, stacks above).
- Persistence: `localStorage` under `clbc.pair` (the chosen `[guildA, guildB]`).

## Feature plan (prioritized)
### P0 — baseline (this session; runnable + testable) — DONE
- [x] Two flanking guild-banner slots with grey Null placeholders + guild selector overlay
- [x] Per-guild building tiles split Primary overlap / Other, sorted rarity → alpha
- [x] Heirlooms section per guild, same Primary / Other split
- [x] Shared centre strip: shared traits, shared nature, shared counselors, shared events
- [x] Combo name for the 21 named pairs; swap / clear
- [x] Detail overlays for building, heirloom, counselor, category, event, nature
- [x] Data-hygiene guardrails in build-data.mjs

### P1 — core value (next sessions)
- [ ] Trait × building cross-reference matrix per guild (glyph cells, sticky headers)
- [ ] Surface **bridge pieces** (neutral buildings, structural minor-guild bridges,
      dynamic category-granters) and **universal adjacency modifiers** as their own section
- [ ] Improve heirloom→guild resolution (target *tags*, not just categories) and
      show heirloom↔building synergy per pair
- [ ] Expand the `[Token]` description DSL into readable text (labels.json)
- [ ] Raise sprite join rate (curated overrides for the ~28 missing building sprites,
      Gem/Tome heirloom sprites)

### P2 — nice-to-have
- [ ] Advanced-guild (Arcane/Rogues) unlock context (Wizard/Spymaster gating)
- [ ] Score-preview / combo-cascade simulation (needs the LIFO trigger engine)
- [ ] Shareable pair URL; Cloudflare Web Analytics beacon (public release only)

## Open questions
- Exact desktop layout for the flanking banners vs. the centre strip on very wide
  screens — validate with the user in the browser.
- Whether "Other buildings" should default open or collapsed (currently collapsed).
- Heirloom relevance: is category-reach the right bar, or should tag-level targets count too? (P1)
