/*
  gen_item_sprites.mjs — authoritative item (heirloom) → sprite map.

  The item key (className / .asset filename, e.g. AnimalFeedBag) frequently does
  NOT match the name of its Sprite asset (AnimalFeedBag ships as ItemFeedBag,
  Abacus as ItemBlueDiamond, GemEmerald as ItemGemAgri, …). The old build-data
  heuristic only tried Item{key}/Gem{key}/{key}, so ~29 heirlooms silently fell
  back to a letter placeholder ("404 to an alpha character").

  Each item ScriptableObject carries a `_sprite` GUID → the Sprite asset, whose
  m_Name IS the cropped-PNG basename in assets/items. This reads both straight
  from the decompiled project and writes data/src/item_sprites.json (tracked),
  consumed by build-data.mjs as the primary item-sprite resolver. Mirrors
  gen_building_sprites.mjs.

  Run from repo root:  node tools/gen_item_sprites.mjs
  (Requires the sibling _cl_extract datamine to be present.)
*/
import fs from "node:fs";
import path from "node:path";

const EX = path.resolve("../_cl_extract/assets/UnityProject/ExportedProject/Assets");
const SODIR = path.join(EX, "Resources/data/items");
const SPRITEMETA = path.join(EX, "Sprite");
const OUT = path.resolve("data/src/item_sprites.json");

if (!fs.existsSync(SODIR)) {
  console.error(`_cl_extract not found at ${SODIR} — cannot regenerate.`);
  process.exit(1);
}

// sprite GUID → sprite asset name (= cropped-PNG basename)
const guidToSprite = new Map();
for (const f of fs.readdirSync(SPRITEMETA)) {
  if (!f.endsWith(".asset.meta")) continue;
  const g = fs.readFileSync(path.join(SPRITEMETA, f), "utf8").match(/guid:\s*([0-9a-f]{32})/);
  if (g) guidToSprite.set(g[1], f.replace(/\.asset\.meta$/, ""));
}

const map = {};
const skipped = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith(".asset")) continue;
    const txt = fs.readFileSync(p, "utf8");
    const key = e.name.replace(/\.asset$/, "");        // item key = className = filename
    const guid = (txt.match(/_sprite:\s*\{[^}]*guid:\s*([0-9a-f]{32})/) || [])[1];
    const sprite = guid && guidToSprite.get(guid);
    if (key && sprite) map[key] = sprite;
    else skipped.push(`${e.name} (key=${key || "?"} sprite=${sprite || "?"})`);
  }
})(SODIR);

const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote ${Object.keys(sorted).length} item→sprite entries to ${path.relative(process.cwd(), OUT)}`);
if (skipped.length) console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
