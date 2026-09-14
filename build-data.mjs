/*
  build-data.mjs — compiles the Combolands datamine (data/src/*.json, copied from
  the _cl_extract workspace) into data.js as `window.CL_DATA = {...}`, running
  data-hygiene guardrails first.

  Usage:  node build-data.mjs           (sprite/desc misses warn; refs are errors)
          node build-data.mjs --strict  (warnings promoted to errors)

  Guardrail philosophy (see the build-calc-planner skill): resolve every
  cross-reference and every asset path BEFORE writing data.js. A dangling guild,
  category, counselor, or a would-404 sprite caught here is a log line; the same
  reference caught in production is a broken tile and a lost user. On any hard
  error we refuse to write data.js, leaving the last good copy intact.

  This tool is a two-guild OVERLAP explorer, so "traits" (per the house style)
  are the game's functional CATEGORIES — the colour-coded surface guilds expose
  to one another. Buildings/heirlooms carry category + interaction links as
  STRUCTURED DATA (never prose) so the overlap can be computed, not narrated.
*/
import fs from "node:fs";
import path from "node:path";

// ── config ──────────────────────────────────────────────────────────────────
const SRC = "data/src";
const ASSETS = "assets";
const OUT = "data.js";
const STRICT = process.argv.includes("--strict");

const errors = [];
const warnings = [];
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
const has = (rel) => fs.existsSync(path.join(ASSETS, rel));
// Stored sprite paths are relative to the SITE ROOT (index.html), so they carry
// the `assets/` prefix; `has()` checks the same file on disk under ASSETS.
const url = (rel) => (rel ? `${ASSETS}/${rel}` : null);

// The 9 draftable guilds (majorCategory values that are real guilds). Hazard,
// Neutral, None, Resource are non-guild majors handled separately / excluded.
const GUILD_IDS = ["Agricultural", "Commercial", "Marine", "Civic",
  "Industrial", "Martial", "Frontier", "Arcane", "Rogues"];
const CORE_GUILDS = new Set(["Agricultural", "Commercial", "Marine", "Civic",
  "Industrial", "Martial", "Frontier"]);
const NON_GUILD_MAJORS = new Set(["Hazard", "Neutral", "Resource", "None"]);
// Orphan stubs: behaviour classes with no real game identity — no ScriptableObject,
// no sprite anywhere in the carve, and nothing that spawns, upgrades-into, or drafts
// them. The player can never place or encounter them, so they don't belong in the calc.
//   Bakery / Excavation / ExcavationUncovered — have GameTags but CanBeDraftedByPlayer => false.
//   PaintersStall — worse: constructed as base(GameTag.None), so it has no tag at all
//     (every real stall — Supplies/Grocer/Deli/Botany — carries its own GameTag).
// Verified in _cl_extract (Assembly-CSharp/Entities/BuildingBehaviours/*.cs + GameTag.cs).
const ORPHAN_STUBS = new Set(["Bakery", "Excavation", "ExcavationUncovered", "PaintersStall"]);

// Per-guild accent colour, pulled from the game's actual banner art (green
// Agricultural, amber Commercial, blue Marine, slate Civic, steel Industrial,
// maroon Martial, rust Frontier; Arcane/Rogues have no banner so use their
// thematic purple/charcoal). These theme every guild banner and column.
const GUILD_COLOR = {
  Agricultural: "#5a8c3a", Commercial: "#c8933f", Marine: "#4a86b8",
  Civic: "#5f7c9c", Industrial: "#566573", Martial: "#9c3a34",
  Frontier: "#b06a37", Arcane: "#7d5aa8", Rogues: "#3b3b44",
};
// Guild → sprite basenames. Filenames are inconsistent in the export, so map
// them explicitly (Martial art ships as "military", etc.). badges/ has all 9.
const GUILD_ICON = { // catalog/guilds/*.png
  Agricultural: "agricultural", Commercial: "commercial", Marine: "marine",
  Civic: "civic", Industrial: "industrial", Martial: "military",
  Frontier: "frontier", Arcane: "arcane", Rogues: "rogues",
};
const GUILD_BANNER = { // tall banners exist only for the 7 core guilds
  Agricultural: "AgriculturalBanner", Commercial: "CommercialBanner",
  Marine: "MarineBanner", Civic: "CivicBanner", Industrial: "IndustrialBanner",
  Martial: "MartialBanner", Frontier: "FrontierBanner",
};

// Counselor → portrait basename. All are Character<Name> except Sensei, whose
// art ships as CharacterWarrior.
const COUNSELOR_SPRITE_OVERRIDE = { Sensei: "CharacterWarrior" };

// Nature resources (map-gen, no guild) → sprite. Some live in map/ as numbered
// variants, some are building sprites; all copied into assets/nature/.
const NATURE_SPRITE = {
  BerryBush: "BerryBush1", BerryBushEmpty: "Bush1", Fish: "Fish1",
  Flowers: "Flowers1", Trees: "Tree1", Rocks: "Rock1",
  Ore: "BOre", GoldOre: "BGoldOre", Lumber: "BLumber", KelpField: "BKelpField",
  Herbs: null, // no dedicated sprite in the export → text fallback
};
const NATURE_NAME = {
  BerryBush: "Berry Bush", BerryBushEmpty: "Empty Bush", Fish: "Fish",
  Flowers: "Flowers", Trees: "Forest", Rocks: "Rocks", Ore: "Ore",
  GoldOre: "Gold Ore", Lumber: "Lumber", KelpField: "Kelp Field", Herbs: "Herbs",
};

const RARITY_RANK = { Common: 0, Uncommon: 1, Rare: 2, Masterwork: 3, Legendary: 4 };
const rarityRank = (r) => (r in RARITY_RANK ? RARITY_RANK[r] : 99);

// Event vocabulary — the trigger-driven links buildings share (emit/listen).
// EVENT_META = the full sentence (detail overlay + tooltip); EVENT_LABEL = the
// short chip/section-header name (drop the "Building…Occurred" scaffolding).
const EVENT_META = {
  RerollGained: "A reroll is granted",
  RemoveGained: "A remove is granted",
  BuildingRemovalOccurred: "A building is removed",
  BuildingConstructionOccurred: "A building is built",
  BuildingTransformationOccurred: "A building transforms into another",
  MoneyEarned: "Gold is earned",
  ScoringOccurred: "A building scores",
  ConsumableUsed: "A consumable is used",
  OnRemove: "This building is itself removed",
};
const EVENT_LABEL = {
  RerollGained: "Reroll Gained",
  RemoveGained: "Remove Gained",
  BuildingRemovalOccurred: "Removal",
  BuildingConstructionOccurred: "Construction",
  BuildingTransformationOccurred: "Transformation",
  MoneyEarned: "Gold Earned",
  ScoringOccurred: "Scoring",
  ConsumableUsed: "Consumable Used",
  OnRemove: "Self Removed",
};

// ── load source ───────────────────────────────────────────────────────────
const bParams = readJSON("buildings_params.json");
const iParams = readJSON("items_params.json");
const strings = readJSON("entity_strings.json");
const council = readJSON("council_relationships.json");
const crossovers = readJSON("guild_crossovers.json");
const edges = readJSON("guild_edges.json");
const interactions = readJSON("building_interactions.json");

const bParamByKey = new Map(bParams.map((b) => [b.className, b]));
const iParamByKey = new Map(iParams.map((i) => [i.className, i]));
const stringOf = (key) => strings[key] || {};
const escHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── text helpers ──────────────────────────────────────────────────────────
const prettify = (k) => String(k).replace(/([a-z])([A-Z])/g, "$1 $2").trim();
// Light cleanup of the [Token] description DSL — enough for readable tiles;
// full token expansion is a P1 backlog item.
function cleanDesc(s) {
  if (!s) return "";
  return String(s)
    .replace(/\[BREAK\]/g, " — ")
    .replace(/[{}@]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── categories ("traits") ────────────────────────────────────────────────
// functionalCategoryToGuilds is the authoritative "which guilds share this
// functional category" map — the overlap glue. Each category is a trait record
// with a data-driven colour (curated for the headline categories, deterministic
// HSL for the rest so every trait themes via --aff-color).
const funcCatToGuilds = crossovers.functionalCategoryToGuilds || {};
const CURATED_CAT_COLOR = {
  Nature: "#4f9d5b", Farm: "#8bbf3f", Crop: "#c9b141", Husbandry: "#b5793e",
  Irrigator: "#3fa6c9", Woodworking: "#8a6a3a", Manufacturer: "#8a8f98",
  Engineering: "#6d7f96", Trader: "#d1a24a", Luxury: "#d0708f", Stall: "#c98a5a",
  Provisioner: "#a0a04a", Entertainment: "#d06a3a", Healing: "#5fbf8f",
  Sacred: "#c0a6d8", Monument: "#b9a06a", Ruins: "#9a8a6a", Residence: "#7fa0c4",
  Training: "#c05a5a", Fortification: "#6f7a86", Ship: "#4a86b8",
  Fishing: "#3f9fb5", House: "#7fa0c4", Metalworking: "#8a8f98", Resource: "#9a9a5a",
};
function hslHex(str) {
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360, sat = 45, lig = 52;
  const a = (sat / 100) * Math.min(lig / 100, 1 - lig / 100);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    const col = lig / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * col).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const catColor = (id) => CURATED_CAT_COLOR[id] || hslHex(id);

// Collect every category seen anywhere (owned minors + interaction targets +
// the functional map) so nothing referenced is left without a trait record.
const allCats = new Set(Object.keys(funcCatToGuilds));
for (const b of interactions.buildings) {
  for (const m of b.owned?.minors || []) allCats.add(m);
  for (const it of b.interactions || []) if (it.kind === "targetCategory") allCats.add(it.value);
}
// Guild categories are their own "traits" too (major categories); mark them.
const categories = [];
for (const id of allCats) {
  const isGuild = GUILD_IDS.includes(id);
  const isResourceish = NON_GUILD_MAJORS.has(id);
  categories.push({
    id, name: prettify(id),
    color: isGuild ? GUILD_COLOR[id] : catColor(id),
    kind: isGuild ? "guild" : isResourceish ? "resource" : "functional",
    guildsSharing: (funcCatToGuilds[id] || []).slice(),
    // Guild-name categories exist to group; keep them out of shared-trait tallies.
    showInTable: !isGuild && !isResourceish,
  });
}
const catById = new Map(categories.map((c) => [c.id, c]));

// ── nature resources ────────────────────────────────────────────────────
// natureResourceGuildMap is keyed by DISPLAY name; each entry carries the
// internal `.tag` (how buildings reference it) and the guilds that interact.
const natureMap = edges.natureResourceGuildMap || {};
const natureKeys = new Set(Object.values(natureMap).map((e) => e.tag)); // internal tags
const natureResources = Object.entries(natureMap).map(([display, e]) => {
  const tag = e.tag;
  const spr = NATURE_SPRITE[tag];
  const sprite = spr && has(`nature/${spr}.png`) ? url(`nature/${spr}.png`) : null;
  if (spr && !sprite) warnings.push(`nature "${tag}" -> nature/${spr}.png (missing sprite)`);
  else if (!spr) warnings.push(`nature "${tag}" has no sprite mapping (text fallback)`);
  return { key: tag, name: display, guilds: (e.guilds || []).slice(), sprite };
});

// ── building sprite resolver (authoritative, from the game's own SOs) ─────
// Guessing which PNG belongs to a building by name is unreliable — it silently
// mis-assigned the 5 House sprites and Obelisk, and can't know MagicPortal ships
// as BMagicMirror or SuppliesStall as BStallFishmonger. Instead each building's
// ScriptableObject carries a _gameTag (→ the building key) and a _sprite GUID
// (→ the sprite asset); tools/gen_building_sprites.mjs resolves both from the
// decompiled game into building_sprites.json. Sprites live in assets/buildings/
// (full portraits) or assets/buildings_tiny/ (12×12 footprints for buildings the
// game never drew a portrait for — infrastructure, temple wings, etc.).
const BUILDING_SPRITES = readJSON("building_sprites.json");
const buildingSpriteFiles = fs.readdirSync(path.join(ASSETS, "buildings")).filter((f) => f.endsWith(".png"));
const bSpriteByLower = new Map(buildingSpriteFiles.map((f) => [f.toLowerCase(), f]));
const tinySpriteFiles = fs.existsSync(path.join(ASSETS, "buildings_tiny"))
  ? fs.readdirSync(path.join(ASSETS, "buildings_tiny")).filter((f) => f.endsWith(".png"))
  : [];
const tinySpriteByLower = new Map(tinySpriteFiles.map((f) => [f.toLowerCase(), f]));
// Find <base>.png in the full-portrait dir, then the footprint dir.
function spriteFile(base) {
  if (!base) return null;
  const f = `${String(base).toLowerCase()}.png`;
  if (bSpriteByLower.has(f)) return url(`buildings/${bSpriteByLower.get(f)}`);
  if (tinySpriteByLower.has(f)) return url(`buildings_tiny/${tinySpriteByLower.get(f)}`);
  return null;
}
function resolveBuildingSprite(key, gameTag, display) {
  const auth = spriteFile(BUILDING_SPRITES[key]);   // authoritative SO mapping
  if (auth) return auth;
  // Fallback for keys with no SO (code-only stubs like Bakery/Excavation): try
  // mechanical name forms in case the art exists under an obvious spelling.
  for (const c of [key, gameTag, String(display || "").replace(/[^A-Za-z0-9]/g, "")]) {
    if (!c) continue;
    for (const form of [`B${c}`, c, `B${c}1`]) {
      const hit = spriteFile(form);
      if (hit) return hit;
    }
  }
  return null;
}

// ── buildings ─────────────────────────────────────────────────────────────
// Build one building record from a raw interactions entry. Shared by the 9-guild
// buildings AND the guild-less Neutral buildings (map structures owned by no
// guild — see the neutral-buildings section below), so both carry identical shape.
function buildRecord(b) {
  const key = b.building;
  if (/(?:Empty|Depleted)$/.test(key)) return null;     // transient placement states
  if (ORPHAN_STUBS.has(key)) return null;               // non-draftable, no art (see set above)
  const params = bParamByKey.get(key) || {};
  const nm = stringOf(key).name;
  const name = nm || b.display || prettify(key);
  if (!nm) warnings.push(`building "${key}" has no localized name (using "${name}")`);

  const ownedMinors = (b.owned?.minors || []).slice();
  const ownedFunctional = ownedMinors.filter((m) => catById.get(m)?.kind === "functional");

  // Keep meaningful interactions (those that resolve to a guild/resource); drop
  // internal effect tags (BsStatMod*, paints) that resolve to nothing.
  const inter = (b.interactions || [])
    .filter((it) => (it.resolvesToGuilds || []).length)
    .map((it) => ({
      kind: it.kind, value: it.value, guilds: (it.resolvesToGuilds || []).slice(),
      source: it.source, score: it.score ?? null,
      snippet: it.anchor?.snippet || "", line: it.anchor?.line || "",
    }));
  const interactionGuilds = [...new Set(inter.flatMap((it) => it.guilds)
    .filter((g) => GUILD_IDS.includes(g) && g !== b.guild))];
  const natureNodes = [...new Set((b.interactions || [])
    .map((it) => it.value).filter((v) => natureKeys.has(v)))];
  const events = [...new Set([
    ...(b.emitsEvents || []).map((e) => e.event),
    ...(b.listensForEvents || []).map((e) => e.event),
  ])];
  // Owned surface = every category this building carries (major + minors) plus its tag —
  // what OTHER buildings' effects/qualifiers can match against.
  const ownedCats = [...new Set([...(b.owned?.minors || []),
    ...(b.owned?.major ? [b.owned.major] : [])])];
  // A qualified listener only reacts to an event that involves a specific category/tag
  // (e.g. Windmill: transformation of a Crop). Kept per-event so the client can narrow a
  // shared-event link to guilds that actually own the qualifying surface.
  const listenQualifiers = {};
  for (const e of b.listensForEvents || [])
    if (e.qualifier) listenQualifiers[e.event] = { cats: e.qualifier.cats || [], tags: e.qualifier.tags || [] };

  return {
    key, name, guild: b.guild, gameTag: b.owned?.gameTag || null,
    rarity: params.rarity || null, rarityRank: rarityRank(params.rarity),
    ownedMinors, ownedFunctional, ownedCats,
    interactions: inter, interactionGuilds, natureNodes, events,
    emits: (b.emitsEvents || []).map((e) => e.event),
    listens: (b.listensForEvents || []).map((e) => e.event),
    listenQualifiers,
    sprite: resolveBuildingSprite(key, b.owned?.gameTag, name),
    _rawDesc: stringOf(key).description || "",   // expanded into desc/descHTML below
  };
}
const buildings = [];
for (const b of interactions.buildings) {
  if (NON_GUILD_MAJORS.has(b.guild)) continue;          // keep only the 9 guilds
  const rec = buildRecord(b); if (rec) buildings.push(rec);
}
buildings.forEach((b) => { if (!b.sprite) warnings.push(`building "${b.key}" -> no sprite (placeholder)`); });

// ── neutral buildings ─────────────────────────────────────────────────────
// Map structures owned by NO guild (Wall, Well, Ruin, Plaza, Rail…). Like a
// nature node, a neutral building is a SHARED EDGE for a pair when both guilds
// interact with it. A guild "connects" to a neutral building N when one of the
// guild's buildings TARGETS a category N carries (scores off it), or N targets
// a category that guild building OWNS (N affects it). connectionsByGuild records
// the connecting buildings per guild so the client can render the shared row.
const neutralBuildings = [];
for (const b of interactions.buildings) {
  if (b.guild !== "Neutral") continue;
  const rec = buildRecord(b); if (rec) neutralBuildings.push(rec);
}
for (const n of neutralBuildings) {
  const nOwned = new Set(n.ownedCats);                                   // categories the neutral building carries
  const nTargets = new Set((n.interactions || []).map((it) => it.value).filter((v) => catById.has(v))); // categories it affects
  const connectionsByGuild = {};
  for (const g of GUILD_IDS) {
    const conns = [];
    for (const x of buildings) {
      if (x.guild !== g) continue;
      const targetsN = (x.interactions || []).some((it) => nOwned.has(it.value));  // x scores off N
      const affectedByN = x.ownedCats.some((c) => nTargets.has(c));                // N affects x
      if (targetsN || affectedByN) conns.push({ key: x.key, name: x.name, dir: targetsN ? "targets" : "owned" });
    }
    if (conns.length) connectionsByGuild[g] = conns.sort((p, q) => p.name.localeCompare(q.name));
  }
  n.connectionsByGuild = connectionsByGuild;
  n.reachesGuilds = [...new Set([...Object.keys(connectionsByGuild), ...n.interactionGuilds])];
}
neutralBuildings.forEach((n) => { if (!n.sprite) warnings.push(`neutral building "${n.key}" -> no sprite (placeholder)`); });

// ── heirlooms ──────────────────────────────────────────────────────────────
const itemSpriteDir = new Set(
  fs.readdirSync(path.join(ASSETS, "items")).filter((f) => f.endsWith(".png"))
);
function resolveItemSprite(key) {
  for (const p of [`Item${key}`, `Gem${key}`, key]) {
    if (itemSpriteDir.has(`${p}.png`)) return url(`items/${p}.png`);
  }
  return null;
}
// A heirloom "reaches" a guild if one of its target categories is carried by
// that guild (functionalCategoryToGuilds), or it targets that guild directly.
function guildsForCategories(cats) {
  const out = new Set();
  for (const c of cats) {
    if (GUILD_IDS.includes(c)) out.add(c);
    for (const g of funcCatToGuilds[c] || []) out.add(g);
  }
  return [...out];
}
const heirlooms = [];
for (const it of iParams) {
  if (it.majorCategory !== "Heirloom") continue;
  const key = it.className;
  const nm = stringOf(key).name;
  if (!nm) { warnings.push(`heirloom "${key}" has no localized name — skipped (likely cut)`); continue; }
  const targetCategories = (it.targetCategories || []).map((t) => (typeof t === "string" ? t : t.category || t.tag)).filter(Boolean);
  const targetTags = (it.targetTags || []).map((t) => (typeof t === "string" ? t : t.tag)).filter(Boolean);
  const reachesCategories = targetCategories.filter((c) => catById.has(c));
  const reachesGuilds = guildsForCategories(targetCategories);
  heirlooms.push({
    key, name: nm,
    rarity: it.rarity || null, rarityRank: rarityRank(it.rarity),
    minors: (it.minorCategories || []).slice(),
    targetCategories, targetTags,
    validTriggers: (it.validTriggers || []).slice(),
    reachesCategories, reachesGuilds,
    passive: !!it.paramOnly || it.hasRealTrigger === false,
    sprite: resolveItemSprite(key),
    _rawDesc: stringOf(key).description || "",   // expanded into desc/descHTML below
  });
}
heirlooms.forEach((h) => { if (!h.sprite) warnings.push(`heirloom "${h.key}" -> no sprite (placeholder)`); });

// ── counselors ──────────────────────────────────────────────────────────────
const counselors = [];
for (const [name, c] of Object.entries(council.counselors || {})) {
  const base = COUNSELOR_SPRITE_OVERRIDE[name] || `Character${name}`;
  const sprite = has(`council/${base}.png`) ? url(`council/${base}.png`) : null;
  if (!sprite) warnings.push(`counselor "${name}" -> council/${base}.png (missing portrait)`);
  counselors.push({
    name, theme: cleanDesc(c.theme),
    multStackCategories: (c.multStackCategories || []).slice(),
    passiveCategories: (c.passiveCategories || []).slice(),
    guildReach: (c.guildReach || []).slice(),
    guildReachByCategory: c.guildReachByCategory || {},
    passive: (c.passive || []).map((p) => ({ cond: cleanDesc(p.cond), effect: cleanDesc(p.effect) })),
    milestones: (c.milestones || []).map((m) => ({ votes: m.votes, reward: cleanDesc(m.reward) })),
    sprite,
  });
}

// ── description [Token] DSL → bold, clickable keywords ────────────────────
// entity_strings descriptions use a [Token] / {directive:} DSL. In-game each
// value token ([Cooldown], [BaseScore]…) is swapped for the piece's LIVE
// computed number; we inject the real value from the piece's params where we
// have it and fall back to naming the stat otherwise. Category / entity /
// counselor / nature tokens become <b> keywords that OPEN the matching detail
// overlay (data-action reuses the same dispatch as the rest of the UI).
// Family tokens ([TagScore<Tag>], [CategoryScore<Cat>]…) render the per-target
// score. See _cl_extract/labels.json for the authoritative dictionary.

// clickable-resolution sets (built from the finished entity arrays)
const _catIds        = new Set(categories.map((c) => c.id));
const _counselorSet  = new Set(counselors.map((c) => c.name));
const _buildingKeys  = new Set([...buildings, ...neutralBuildings].map((b) => b.key));
const _heirloomKeys  = new Set(heirlooms.map((h) => h.key));
const _natureByTag   = new Map(natureResources.map((n) => [n.key, n]));
const _nameByKey     = new Map(Object.entries(strings)
  .filter(([, v]) => v && v.name).map(([k, v]) => [k, v.name]));

// value token → param field(s) to read (buildings & items name a few fields
// differently, so try each in order); + how to phrase it when the value is null.
const VALUE_FIELDS = {
  Cooldown: ["cooldown", "cooldownParam"], CooldownParam: ["cooldown", "cooldownParam"],
  Range: ["range"], BaseScore: ["baseScore", "scoreParam"],
  Mult: ["multiplier", "behaviourMultiplier"], mult: ["multiplier", "behaviourMultiplier"],
  MultParam: ["multParam"], ActivationCount: ["activationCount"],
  PercentageChance: ["activationChance"], Percentage2Chance: ["activationChance"],
  MoneyCount: ["moneyParam"], RerollCount: ["rerollsCount", "rerollsCountParam"],
  RemoveCount: ["removesCount", "removesCountParam"],
  DismissCount: ["dismissesCount", "dismissesCountParam"],
  EnchantmentParam: ["enchantParam"], RangeModificationParam: ["rangeMod", "rangeModificationParam"],
  CooldownModificationParam: ["cooldownMod", "cooldownModificationParam"],
};
const VALUE_NAME = {
  Cooldown: "cooldown", CooldownParam: "cooldown", Range: "range", BaseScore: "base score",
  Mult: "multiplier", mult: "multiplier", MultParam: "multiplier bonus",
  ActivationCount: "activation count", PercentageChance: "chance", Percentage2Chance: "secondary chance",
  MoneyCount: "gold", RerollCount: "rerolls", RemoveCount: "removes", DismissCount: "dismisses",
  EnchantmentParam: "enchantment", RangeModificationParam: "range modifier",
  CooldownModificationParam: "cooldown modifier", TriggerCountModificationParam: "trigger-count modifier",
  QuestAmount: "quest amount", QuestAmountPoints: "quest points",
};
const RESOURCE_TOK = {
  Gold: "Gold", Blueprint: "Blueprint", Heirloom: "Heirloom", Heirlooms: "Heirlooms",
  Reroll: "Reroll", Remove: "Remove", Dismiss: "Dismiss", Potion: "Potion",
  CouncilVote: "Council Vote", BuildingUpgrade: "Building Upgrade", Consumable: "Consumable",
  TotalHeirloomSellValueSum: "total heirloom sell value",
};
const PAINT_TOK = {
  BsRainbowPaint: "Rainbow Paint", BsSpectralPaint: "Spectral Paint", BsNegBlackPaint: "Black Paint",
  BsStatModMult: "+Multiplier mod", BsStatModCooldown: "−Cooldown mod", BsStatModRange: "+Range mod",
  BsNegCooldown: "+Cooldown mod", BsNegRange: "−Range mod",
};
const RARITIES = new Set(["Common", "Uncommon", "Rare", "Masterwork", "Legendary"]);
const TILETYPES = new Set(["Grass", "Sand", "Shore", "Ocean"]);
const tokWarn = new Set(); // unresolved tokens → one warning each

const firstVal = (p, fields) => {
  if (!p) return null;
  for (const f of fields) if (p[f] != null) return p[f];
  return null;
};
const num = (v) => (Number.isInteger(v) ? String(v) : String(+(+v).toFixed(2)));
function fmtValue(tok, v) {
  if (tok === "MultParam") return `+${num(v)}×`;
  if (tok === "Mult" || tok === "mult") return `×${num(v)}`;
  if (tok === "PercentageChance" || tok === "Percentage2Chance") return `${Math.round(v * 100)}%`;
  if (tok === "MoneyCount") return `${num(v)} gold`;
  if (tok === "BaseScore") return `+${num(v)}`;
  if (/Modification/.test(tok)) return `${v >= 0 ? "+" : ""}${num(v)}`;
  return num(v);
}
const kw = (text, cls, attrs = "") => `<b class="tok ${cls}"${attrs}>${escHTML(text)}</b>`;
const scoreOf = (list, key, val) =>
  (list || []).map((t) => (typeof t === "string" ? { [key]: t } : t))
    .find((t) => (t[key] ?? t.tag ?? t.category) === val)?.score;

function resolveToken(tok, p) {
  // location qualifiers
  if (tok === "Adjacent") return kw("adjacent", "tok-loc");
  if (tok === "Connected") return kw("connected", "tok-loc");
  if (tok === "InRange") { const r = firstVal(p, ["range"]); return kw(r != null ? `in range ${r}` : "in range", "tok-loc"); }
  // family score tokens (suffix = a Category / Tag / TileType / Rarity name)
  let m;
  if ((m = /^CategoryScore(.+)$/.exec(tok))) {
    if (m[1] === "Primary") { const s = scoreOf(p?.targetCategories, "category", (p?.targetCategories || [])[0]?.category); return kw(s != null ? `+${s}` : "points", "tok-val"); }
    const s = scoreOf(p?.targetCategories, "category", m[1]); return kw(s != null ? `+${s}` : "points", "tok-val");
  }
  if ((m = /^TagScore(.+)$/.exec(tok)))      { const s = scoreOf(p?.targetTags, "tag", m[1]);            return kw(s != null ? `+${s}` : "points", "tok-val"); }
  if ((m = /^TileTypeScore(.+)$/.exec(tok))) { const s = scoreOf(p?.targetTileTypes, "tileType", m[1]);  return kw(s != null ? `+${s}` : "points", "tok-val"); }
  if ((m = /^RarityScore(.+)$/.exec(tok)))   { const s = scoreOf(p?.targetRarities, "rarity", m[1]);     return kw(s != null ? `+${s}` : "points", "tok-val"); }
  if (tok === "TargetCategory1" || tok === "TargetCategory2") {
    const c = (p?.targetCategories || []).map((t) => (typeof t === "string" ? t : t.category))[tok.endsWith("1") ? 0 : 1];
    return c ? catKeyword(c) : kw("target category", "tok-val");
  }
  if (tok === "QuestTargetCategory") return kw("target category", "tok-val");
  // value tokens — inject the piece's real number, else name the stat
  if (tok in VALUE_FIELDS || tok in VALUE_NAME) {
    const v = firstVal(p, VALUE_FIELDS[tok] || []);
    return v != null ? kw(fmtValue(tok, v), "tok-val") : kw(VALUE_NAME[tok] || prettify(tok), "tok-val");
  }
  // fixed vocab
  if (RARITIES.has(tok)) return kw(tok, "tok-rar");
  if (TILETYPES.has(tok)) return kw(tok, "tok-tile");
  if (tok in RESOURCE_TOK) return kw(RESOURCE_TOK[tok], "tok-res");
  if (tok in PAINT_TOK) return kw(PAINT_TOK[tok], "tok-paint");
  // clickable entities
  if (_counselorSet.has(tok)) return kw(tok, "tok-link tok-counselor", ` data-action="detail-counselor" data-name="${escHTML(tok)}"`);
  if (_catIds.has(tok)) return catKeyword(tok);
  if (_natureByTag.has(tok)) { const n = _natureByTag.get(tok); return kw(n.name, "tok-link tok-nature", ` data-action="detail-nature" data-key="${escHTML(tok)}"`); }
  if (_buildingKeys.has(tok)) return kw(_nameByKey.get(tok) || prettify(tok), "tok-link tok-piece", ` data-action="detail-building" data-key="${escHTML(tok)}"`);
  if (_heirloomKeys.has(tok)) return kw(_nameByKey.get(tok) || prettify(tok), "tok-link tok-piece", ` data-action="detail-heirloom" data-key="${escHTML(tok)}"`);
  if (_nameByKey.has(tok)) return kw(_nameByKey.get(tok), "tok-piece"); // known name, no detail page (transient state, cut piece)
  tokWarn.add(tok);
  return kw(prettify(tok), "tok-misc");
}
function catKeyword(id) {
  if (/^RandomCategory\d*$/.test(id)) return kw("category", "tok-cat"); // source already says "a random …"
  const c = catById.get(id);
  if (!c) return kw(prettify(id), "tok-cat"); // not a real category → bold, non-clickable
  return kw(c.name, "tok-link tok-cat", ` data-action="nav-cat" data-cat="${escHTML(id)}"`);
}

function expandDesc(raw, p) {
  if (!raw) return "";
  let s = escHTML(raw);
  s = s.replace(/\[BREAK\]/g, "<br>");             // hard line breaks
  s = s.replace(/\s*@\s*/g, " ");                   // effect-clause marker → space
  // trigger / directive clauses {…}. Braces are occasionally unbalanced in the
  // source, so match only well-formed inner clauses and drop any stray braces.
  s = s.replace(/\{([^{}]*)\}/g, (_, inner) => `<em class="d-clause">${inner.trim()}</em>`);
  s = s.replace(/[{}]/g, "");
  // expand every remaining [Token] (also those nested inside the <em> clauses)
  s = s.replace(/\[([A-Za-z0-9]+)\]/g, (_, tok) => resolveToken(tok, p));
  return s.replace(/[ \t]+/g, " ").replace(/\s+<br>\s*/g, "<br>").trim();
}
const stripTags = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

for (const b of [...buildings, ...neutralBuildings]) {
  b.descHTML = expandDesc(b._rawDesc, bParamByKey.get(b.key));
  b.desc = stripTags(b.descHTML);
  delete b._rawDesc;
}
for (const h of heirlooms) {
  h.descHTML = expandDesc(h._rawDesc, iParamByKey.get(h.key));
  h.desc = stripTags(h.descHTML);
  delete h._rawDesc;
}
if (tokWarn.size) warnings.push(`description DSL: ${tokWarn.size} unmapped token(s) rendered as plain text: ${[...tokWarn].sort().join(", ")}`);

// ── per-guild rollups (used by the client to compute overlap) ─────────────
const guilds = GUILD_IDS.map((id) => {
  const own = buildings.filter((b) => b.guild === id);
  const funcs = new Set(); const evs = new Set(); const nats = new Set();
  const ocats = new Set(); const otags = new Set();
  for (const b of own) {
    b.ownedFunctional.forEach((f) => funcs.add(f));
    b.events.forEach((e) => evs.add(e));
    b.natureNodes.forEach((n) => nats.add(n));
    b.ownedCats.forEach((c) => ocats.add(c));       // every category this guild can field —
    if (b.gameTag) otags.add(b.gameTag);            // used to test other guilds' listener qualifiers
  }
  return {
    id, name: prettify(id), color: GUILD_COLOR[id],
    icon: has(`guilds/${GUILD_ICON[id]}.png`) ? url(`guilds/${GUILD_ICON[id]}.png`) : null,
    badge: has(`banners/badges/${id}.png`) ? url(`banners/badges/${id}.png`) : null,
    banner: GUILD_BANNER[id] && has(`banners/${GUILD_BANNER[id]}.png`) ? url(`banners/${GUILD_BANNER[id]}.png`) : null,
    isCore: CORE_GUILDS.has(id), isAdvanced: !CORE_GUILDS.has(id),
    buildingCount: own.length,
    functionalCategories: [...funcs], events: [...evs], natureNodes: [...nats],
    ownedCats: [...ocats], ownedTags: [...otags],
  };
});
// Guild asset guardrails are hard errors — a guild is the primary UI element.
for (const g of guilds) {
  if (!g.icon) errors.push(`guild "${g.id}" -> guilds/${GUILD_ICON[g.id]}.png (missing icon)`);
  if (!g.badge) errors.push(`guild "${g.id}" -> banners/badges/${g.id}.png (missing badge)`);
  if (g.isCore && !g.banner) errors.push(`core guild "${g.id}" -> missing tall banner`);
}

// ── combos (named pairs + precomputed shared surfaces) ────────────────────
const pairKey = (a, b) => [a, b].sort().join("|");
const combos = {};
for (const p of crossovers.pairs || []) {
  const [a, b] = p.guilds;
  combos[pairKey(a, b)] = {
    name: p.name || null,
    sharedFunctionalCategories: (p.sharedFunctionalCategories || []).slice(),
    sharedNature: [],
  };
}
const uniq = (a) => [...new Set(a)];
for (const p of edges.pairs || []) {
  const k = pairKey(p.guilds[0], p.guilds[1]);
  (combos[k] ||= { name: p.name || null, sharedFunctionalCategories: [], sharedNature: [] });
  // Rich per-resource crossover: which buildings from each guild touch the node.
  combos[k].sharedNature = (p.sharedNature || []).map((n) => ({
    resource: n.resource, tag: n.resourceTag,
    aGuild: n.guildA, aBuildings: uniq(n.aBuildings || []),
    bGuild: n.guildB, bBuildings: uniq(n.bBuildings || []),
  }));
  combos[k].structuralEdges = p.structuralEdges ?? null;
  combos[k].eventEdges = p.eventEdges ?? null;
}

// ── universal adjacency modifiers (guild-agnostic connectors) ─────────────
const universalModifiers = (interactions.universalAdjacencyModifiers || []).map((m) => ({
  name: m.display || m.name || m.building, guild: m.guild || "Neutral",
  effect: m.effect, anchor: m.anchor?.line || m.anchor || "",
}));

// ── events ────────────────────────────────────────────────────────────────
const usedEvents = new Set(buildings.flatMap((b) => b.events));
const events = [...usedEvents].map((id) => ({ id, name: EVENT_LABEL[id] || prettify(id), note: EVENT_META[id] || "" }));

// ── reference guardrails ──────────────────────────────────────────────────
for (const b of [...buildings, ...neutralBuildings]) {
  for (const m of b.ownedMinors) if (!catById.has(m)) errors.push(`building "${b.key}" owns unknown category "${m}"`);
  for (const g of b.interactionGuilds) if (!GUILD_IDS.includes(g)) errors.push(`building "${b.key}" targets unknown guild "${g}"`);
}
for (const c of counselors) {
  for (const cat of [...c.multStackCategories, ...c.passiveCategories])
    if (!catById.has(cat)) warnings.push(`counselor "${c.name}" references unknown category "${cat}"`);
  for (const g of c.guildReach) if (!GUILD_IDS.includes(g)) warnings.push(`counselor "${c.name}" reaches unknown guild "${g}"`);
}

// ── hygiene report ────────────────────────────────────────────────────────
const spritesChecked = buildings.length + neutralBuildings.length + heirlooms.length + counselors.length +
  guilds.length * 3 + natureResources.length;
console.log("── Combolands data hygiene report ─────────────");
console.log(`✓ ${guilds.length} guilds, ${buildings.length} buildings, ${neutralBuildings.length} neutral buildings, ${heirlooms.length} heirlooms,`);
console.log(`  ${counselors.length} counselors, ${categories.length} categories, ${natureResources.length} nature nodes,`);
console.log(`  ${events.length} event types, ${Object.keys(combos).length} guild pairs, ~${spritesChecked} asset paths checked`);
if (errors.length) { console.log(`✗ ${errors.length} error(s):`); errors.forEach((e) => console.log(`    ${e}`)); }
if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  warnings.slice(0, 40).forEach((w) => console.log(`    ${w}`));
  if (warnings.length > 40) console.log(`    …and ${warnings.length - 40} more`);
}
console.log("─".repeat(47));

const hardErrors = errors.length + (STRICT ? warnings.length : 0);
if (hardErrors) {
  console.error(`BUILD FAILED: ${hardErrors} error(s). ${OUT} left untouched.`);
  process.exit(1);
}

// ── write output ──────────────────────────────────────────────────────────
const data = {
  meta: { game: "Combolands", guildCount: guilds.length, generated: "build-data.mjs" },
  guilds, categories, buildings, neutralBuildings, heirlooms, counselors, natureResources,
  events, combos, universalModifiers,
};
fs.writeFileSync(OUT, `window.CL_DATA = ${JSON.stringify(data)};\n`);
console.log(`Wrote ${OUT} (window.CL_DATA) — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB.`);
