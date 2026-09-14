/*
  gen_building_sprites.mjs — authoritative building → sprite map.

  Name-guessing which PNG belongs to which building is unreliable (it silently
  mis-assigned the 5 House sprites and Obelisk, and can't know that MagicPortal
  ships as BMagicMirror or SuppliesStall as BStallFishmonger). The game's own
  ScriptableObjects carry the truth: each building SO has a `_gameTag` (→ the
  GameTag enum name, which IS the calc building key) and a `_sprite` GUID
  (→ the Sprite asset name). This reads both straight from the decompiled
  project and writes data/src/building_sprites.json (tracked), consumed by
  build-data.mjs as the primary resolver.

  Run from repo root:  node tools/gen_building_sprites.mjs
  (Requires the sibling _cl_extract datamine to be present.)
*/
import fs from "node:fs";
import path from "node:path";

const EX = path.resolve("../_cl_extract/assets/UnityProject/ExportedProject/Assets");
const SODIR = path.join(EX, "Resources/data/buildings");
const SPRITEMETA = path.join(EX, "Sprite");
const GAMETAG = path.join(EX, "Scripts/Assembly-CSharp/Entities/GameTag.cs");
const OUT = path.resolve("data/src/building_sprites.json");

if (!fs.existsSync(SODIR)) {
  console.error(`_cl_extract not found at ${SODIR} — cannot regenerate.`);
  process.exit(1);
}

// GameTag int → enum name (= calc building key)
const tagName = new Map();
for (const line of fs.readFileSync(GAMETAG, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(\d+),/);
  if (m) tagName.set(Number(m[2]), m[1]);
}

// sprite GUID → sprite asset name
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
    const tag = Number((txt.match(/_gameTag:\s*(\d+)/) || [])[1]);
    const guid = (txt.match(/_sprite:\s*\{[^}]*guid:\s*([0-9a-f]{32})/) || [])[1];
    const key = tagName.get(tag);
    const sprite = guid && guidToSprite.get(guid);
    if (key && sprite) map[key] = sprite;
    else skipped.push(`${e.name} (tag=${tag} key=${key || "?"} sprite=${sprite || "?"})`);
  }
})(SODIR);

const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote ${Object.keys(sorted).length} building→sprite entries to ${path.relative(process.cwd(), OUT)}`);
if (skipped.length) console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
