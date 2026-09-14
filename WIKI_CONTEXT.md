# Combolands — Wiki / Context Tree

## Game basics
Combolands (Crux Games) is a **grid citybuilder roguelike**. You draft
**buildings** (~168) and **items/heirlooms** (~139), place buildings on a tile
grid, and end each **week** (turn). Buildings **trigger** and **score points**;
scoring/events broadcast to neighbours → **combo cascades** (a LIFO trigger
stack). Beat a score threshold each **milestone** to grow the city and survive.

There are **7 canon guilds** and a run **picks exactly 2** of them; they pair into
**21 named combos** (`GuildComboNames`, e.g. Agricultural+Marine = "Coastal
Cultivators"). **Arcane and Rogues are NOT guilds** — they're advanced mid-run
unlocks (Wizard/Spymaster counselors) that exist in the data only as major-category
ids; they have no combo name, aren't pickable, and get no guild-detail page. The
guild pair is the run's identity — hence this tool: choose 2 guilds, see how they
interlock.

## Key mechanics (for the calculator)
- **Guilds expose a surface via CATEGORIES.** Every building has a major category
  (its guild) and minor categories. Functional categories (Nature, Farm, Ship,
  Trader, Residence…) are shared across guilds and are the real cross-guild glue:
  a piece that *targets* a functional category scores off **any** guild's building
  carrying it. `functionalCategoryToGuilds` is the authoritative "who shares what".
- **Three ways guilds connect** (guild_crossovers): shared functional categories;
  cross-targeting pieces (a guild-A piece whose targets resolve to guild-B
  buildings); and bridges (neutral pieces, structural minor-guild bridges, dynamic
  category-granters that *paint* categories onto neighbours at runtime).
- **Owned vs. interaction tags** (building_interactions, code-anchored): `owned` =
  the building's innate identity = the surface *other* guilds reach into;
  `interactions` = the tags/categories its effect code depends on = how it reaches
  *out*. Interactions resolve to owning guild(s) → directed guild edges.
- **Event layer.** Trigger-driven links the tag graph can't show: buildings
  **emit** events (RerollGained, BuildingRemovalOccurred, MoneyEarned,
  Construction/Transformation) and others **listen** for them. Two guilds sharing
  an event type is a real crossover.
- **Shared nature nodes.** Map-gen resources (Ore, Trees, Herbs…) belong to **no
  guild**; two guilds both interacting with the same node is a crossover the
  owned-trait resolver can't see (so it's precomputed in `sharedNature`).
- **Counselors (Council Favour).** 15 counselors; votes into one grant a mult
  stack to buildings in its affected categories (+0.25 at ≥1 vote, +0.5 at ≥3,
  scaling at ≥5) plus milestone rewards. A counselor whose `guildReach` covers
  **both** chosen guilds is a high-value vote target for the pair.
- **Balance data lives in CODE, not ScriptableObjects.** Every piece's stats are
  set in its behaviour-class constructor; SOs hold only tags/name/desc/sprite.
  Golden data was scraped from the decompiled behaviours.

### Gotchas (the non-obvious rules)
- **"×0.5 from X" means +0.5 into an additive multiplier sum**, applied once — not
  a separate multiplication stage.
- **153 buildings / 74 items add conditional `Get*`/`Trigger` overrides.** The
  base params are exact; real behaviour needs the code/description. Cross-targeting
  here is derived from *base* target tags, so a pair's real overlap in play can
  exceed the static map (dynamic granters, item-granted categories).
- **`natureResourceGuildMap` is keyed by DISPLAY name** ("Gold Ore"), with the
  internal tag in `.tag` ("GoldOre") — buildings reference the tag.
- **Sprite filenames are inconsistent**: B-prefixed (BApiary), no prefix (Grove),
  numbered (BObelisk1), lowercase (bOceanTemple), semantic renames (BotanyStall →
  BStallBotany). `build-data.mjs` resolves case-insensitively with an override map.
- **Naming-gap pieces** (Bakery, the *Stall variants, Excavation, *Empty/*Depleted)
  have no localized name — likely cut/unused. `*Empty/*Depleted` are excluded as
  transient placement states; the stalls are kept (they carry real crossover value)
  with a prettified fallback name and warn during build.

## Data sources & datamine access
- **Datamine workspace:** `../_cl_extract/` (NOT shipped — gitignored). Entry:
  `_cl_extract/CONTEXT_MAP.md`. Engine: Unity **Mono**, decompiled with ilspycmd.
- **Curated inputs (tracked here, copied from the datamine):** `data/src/`
  - `buildings_params.json` / `items_params.json` — per-piece ctor params + rarity
  - `building_interactions.json` — authoritative owned/interactions/events model
  - `guild_edges.json` — directed guild edges + `natureResourceGuildMap` + per-pair `sharedNature`
  - `guild_crossovers.json` — `functionalCategoryToGuilds`, per-pair shared cats + cross-targeting, `GuildComboNames`
  - `council_relationships.json` — counselors, guild reach, mult-stack categories
  - `entity_strings.json` — display names + `[Token]`-DSL descriptions
  - `milestones.json` — score ladder (not yet surfaced in the SPA)
- **How to regenerate `data.js`:** `node build-data.mjs` (guardrails run first).
  To refresh inputs, re-copy the JSON from `_cl_extract/data/` and rerun the build.
- **What ships vs. gitignored:**
  - SHIPPED: `data/src/*.json`, `assets/**` (the sprites the SPA serves), `data.js`
  - GITIGNORED: the whole `_cl_extract/` workspace — decompiled source, full asset
    export, raw params CSVs, `data/lookups`, `data/mechanicsmatrix`, tools.
- If the datamine needs regenerating from the game install, see the
  **game-datamine** skill.

## Data model reference
See `SPEC_PLAN.md#data-model` for the field-by-field `window.CL_DATA` shape the
build pipeline emits. The join spine is the building/item **className** (→ sprite
`B<className>.png` / `Item<className>.png`, → `entity_strings[className]` for
name/desc). There are 7 canon guild categories (plus Arcane/Rogues as advanced
non-guild majors); category ids are the raw `GamePieceCategory` enum names.
