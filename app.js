/*
  Combolands Guild Overlap Explorer — app logic.
  Reads window.CL_DATA (generated into data.js by build-data.mjs).

  The tool answers one question: pick TWO guilds, how do they interlock?
  Architecture (build-calc-planner house style):
    - BUILD-FIRST: the home screen IS the comparison. Two guild banners flank the
      screen (grey "Null" placeholders until chosen); each guild's building &
      heirloom tiles sit beside its banner; the SHARED overlap surface (traits,
      nature, counselors, events) fills the centre strip.
    - Clicking a banner opens the GUILD SELECTOR overlay (#overlay-root).
    - Clicking any tile/trait/counselor opens a DETAIL overlay (#detail-overlay-root),
      stacked ABOVE.
    - Overlays are statically sized (CSS); every re-render PRESERVES scrollTop.
    - Escape / ✕ / backdrop = dismiss; Confirm commits a guild pick.
    - Event delegation: one click handler per root, bound once at init.
    - Functional CATEGORIES are the data-driven, colour-coded "traits" (--aff-color).
*/
(function () {
  "use strict";

  const DATA = window.CL_DATA || {};
  const STORAGE_KEY = "clbc.pair";

  // ── indices ──
  const guildById = new Map((DATA.guilds || []).map((g) => [g.id, g]));
  const catById = new Map((DATA.categories || []).map((c) => [c.id, c]));
  // Neutral buildings are merged into buildingByKey so detail pages & [Token]
  // links resolve them exactly like guild buildings; they stay OUT of
  // buildingsByGuild (below) so they never appear in a guild's column.
  const buildingByKey = new Map([...(DATA.buildings || []), ...(DATA.neutralBuildings || [])].map((b) => [b.key, b]));
  const neutralByKey = new Map((DATA.neutralBuildings || []).map((n) => [n.key, n]));
  const heirloomByKey = new Map((DATA.heirlooms || []).map((h) => [h.key, h]));
  const counselorByName = new Map((DATA.counselors || []).map((c) => [c.name, c]));
  const natureByKey = new Map((DATA.natureResources || []).map((n) => [n.key, n]));
  const eventById = new Map((DATA.events || []).map((e) => [e.id, e]));

  const byRarityThenName = (a, b) => (a.rarityRank - b.rarityRank) || a.name.localeCompare(b.name);
  const buildingsByGuild = new Map();
  for (const g of DATA.guilds || []) {
    buildingsByGuild.set(g.id, (DATA.buildings || []).filter((b) => b.guild === g.id).sort(byRarityThenName));
  }
  // A heirloom belongs under a guild column if it "reaches" that guild.
  const heirloomsByGuild = new Map();
  for (const g of DATA.guilds || []) {
    heirloomsByGuild.set(g.id, (DATA.heirlooms || []).filter((h) => h.reachesGuilds.includes(g.id)).sort(byRarityThenName));
  }
  const comboFor = (a, b) => (DATA.combos || {})[[a, b].sort().join("|")] || null;

  // ── state ──
  const state = {
    pair: load(),        // [guildIdA|null, guildIdB|null]
    ovl: null,           // { side, pending } while the guild selector is open
    collapsed: new Set(),// section ids the user has collapsed
    detailGlobal: false, // category/event detail scope: false = the active pair, true = ALL guilds
                         // (set true when a detail is opened from the Appendix global search)
    detailStack: [],     // breadcrumb of {kind,id} detail pages; ✕/Close pops one (back),
                         // so guild → building → Close lands back on the guild page
    do: { ms: 1, infra: true, pick: null },  // Draw Odds: milestone slider, include-infra toggle, focused building key
  };

  function load() {
    let p = [null, null];
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (Array.isArray(s)) p = [s[0] ?? null, s[1] ?? null]; } catch {}
    // Only the 7 core guilds are selectable (Arcane/Rogues are advanced, not full guilds).
    return p.map((id) => (id && guildById.get(id)?.isCore ? id : null));
  }
  const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pair));

  // ── html helpers ──
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Contrast-chosen foreground for a category/guild colour (the --aff-text half
  // of the theming model): dark text on light colours, white on dark.
  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#fff";
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#111" : "#fff";
  }
  const rarLower = (r) => String(r || "common").toLowerCase();
  const rarVar = (r) => `var(--rar-${rarLower(r)})`;      // rarity rail colour

  // A category "trait" banner, themed inline from DATA. Navigable via delegation.
  function traitBanner(catId, sm) {
    const c = catById.get(catId);
    if (!c) return "";
    return `<span class="trait-banner${sm ? " sm" : ""}" data-action="nav-cat" data-cat="${esc(c.id)}"
      style="--aff-color:${esc(c.color)};--aff-text:${textColorFor(c.color)}" title="${esc(c.name)}">
      <span class="lbl">${esc(c.name)}</span></span>`;
  }
  // Core guilds open their detail page; advanced Arcane/Rogues have no page so
  // render as a plain (non-navigable) tag.
  const guildTag = (id) => {
    const g = guildById.get(id);
    if (!g) return esc(id);
    const nav = g.isCore ? ` data-action="guild-detail" data-id="${esc(g.id)}" role="button" tabindex="0"` : "";
    return `<span class="gtag${g.isCore ? " nav" : ""}" style="--g-color:${esc(g.color)}"${nav}>${esc(g.name)}</span>`;
  };
  const iconImg = (src, cls) => src
    ? `<img class="${cls || ""}" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">`
    : "";
  const placeholder = (name) => `<span class="ph">${esc((name || "?")[0])}</span>`;

  // ── Interaction → plain English ────────────────────────────────────────────
  // The extract stores each interaction as raw game params: a `kind`
  // (targetTag / targetCategory / targetRarity / effectTag / effectCategory), an
  // internal `value` (a GameTag or GamePieceCategory id), and the decompiled C#
  // `snippet` it was anchored to. Turn that into a sentence a player can read.
  const prettyTag = (v) => String(v || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  function interValName(it) {
    const v = it.value;
    if (/Category$/.test(it.kind) && catById.get(v)) return catById.get(v).name;
    return (buildingByKey.get(v) || heirloomByKey.get(v) || natureByKey.get(v)
      || catById.get(v) || {}).name || prettyTag(v);
  }
  // Returns HTML (the resolved name is bolded + escaped); do not esc() the result.
  function describeInteraction(it) {
    const rawName = interValName(it);
    const nm = `<b>${esc(rawName)}</b>`;
    const isCat = /Category$/.test(it.kind);
    const noun = isCat ? `${nm} buildings` : nm;
    const art = /^[aeiou]/i.test(rawName) ? "an" : "a";   // article for "a/an <name>"
    const s = it.snippet || "";

    // How far the effect reaches, from the building's ScorePreviewMode / the snippet
    // (build-data resolves it to locality + range). `adjWord` prefixes the noun for
    // adjacency; `rngSuffix` trails it with the concrete tile radius when known.
    const adjWord = it.locality === "adjacent" ? "adjacent " : "";
    const rngSuffix = it.locality === "range" ? (it.range != null ? ` in range ${it.range}` : " in range")
      : it.locality === "self" ? " (itself)" : "";

    // The extractor recovers the MAIN action verb a building performs on this
    // value (removes/transforms/buffs/…) — surface it directly rather than the
    // generic "wants/counts" fallback, which hid the primary effect (Composter
    // removes Manure; Woodcutter harvests Trees; Composter buffs Farm in range).
    switch (it.action) {
      case "remove":    return `Removes ${adjWord}${noun}${rngSuffix}`;
      case "transform": return `Transforms ${adjWord}${noun}${rngSuffix}`;
      case "spawn":     return `Spawns ${nm} on a nearby tile`;
      case "buff":      return `Buffs ${adjWord}${noun}${rngSuffix}`;
      case "irrigate":  return `Makes adjacent ${noun} grow in 1 week`;
      case "grant":     return `Grants a bonus per ${nm}`;
    }

    if (it.source === "declared") {
      // A declared target is just what the building OPERATES on — not proof it scores.
      // Grant ("considered X") and no-score targets get honest wording; only a real
      // point value earns "Scores off … +N". (Details always live in the description.)
      if (it.confers) return `Makes nearby buildings count as ${nm}`;
      if (it.score) {
        const bonus = ` <span class="i-bonus">+${it.score}</span>`;
        if (it.kind === "targetRarity") return `Scores off ${adjWord}${nm}-rarity pieces${rngSuffix}${bonus}`;
        return `Scores off ${adjWord}${noun}${rngSuffix}${bonus}`;
      }
      return `Affects ${adjWord}${noun}${rngSuffix}`;
    }
    // Boolean gate methods (Can…) express a REQUIREMENT for the building to exist/appear —
    // never an effect or a score. Read the specific gate off the method name.
    if (/^Can[A-Z]/.test(it.method || "")) {
      if (it.method === "CanAddToDraftingPool")   return `Enters the draft pool once you own ${art} ${nm}`;
      if (/CanBe(Built|Placed)On/.test(it.method)) return `Can only be built next to ${nm}`;
      return `Requires ${art} ${nm} to be in play`;
    }
    // effect-sourced — infer the verb from the decompiled snippet
    if (/TransformBuildingInto/.test(s))                       return `Can turn a tile into ${nm}`;
    if (/InstantiateAndBuild(?:NatureResource|Building)?At/.test(s)) return `Spawns ${nm} on a nearby tile`;
    if (/AddConsumable/.test(s))                               return `Grants ${art} ${nm} consumable`;
    if (/GetItemWithTagEquipped|ItemHeirloomController/.test(s)) return `Scales with your equipped ${nm} heirloom(s)`;
    if (/ScoreSpecialResource/.test(s))                        return `Scores the ${nm} special resource`;
    if (/RemoveResourceIfPossible/.test(s))                    return `Consumes an adjacent ${nm}`;
    // CurrentTagCount just COUNTS owned pieces (gate uses handled above) — scaling, not scoring.
    if (/CurrentTagCount/.test(s))                             return `Scales with how many ${nm} you own`;
    if (/GetCountOfBuildings|GetBuildingsOf(?:Type|Category)Adjacent/.test(s)) return `Counts adjacent ${noun}`;
    // An adjacency check isn't a gate — the enclosing method tells us what it changes:
    // Irrigator adjacency drops a crop's cooldown to 1 (matures in 1 week); a multiplier
    // method adds score; a cooldown method speeds the next trigger.
    if (/HasAnyBuildingOf(?:Type|Category)Adjacent/.test(s)) {
      if (it.value === "Irrigator")                     return `Matures in 1 week while adjacent to ${art} ${nm}`;
      if (it.method === "GetBehaviourMultiplier")       return `Scores more while adjacent to ${art} ${nm}`;
      if (it.method === "GetBehaviourCooldownParam")    return `Triggers faster while adjacent to ${art} ${nm}`;
      return `Benefits from ${art} adjacent ${nm}`;
    }
    if (/IrrigateAdjacent/.test(s))                            return `Makes adjacent ${noun} grow in 1 week`;
    if (/AddLocalStatChange/.test(s))                          return `Buffs adjacent ${noun}`;
    if (/PaintTag/.test(s))                                    return `Triggers off ${nm}-painted buildings`;
    if (/GetScoreForTag|^\s*\},\s*Game(?:Tag|PieceCategory)\./.test(s)) return `Scores off adjacent ${noun}`;
    if (/^\s*GameTag\.\w+,?\s*$/.test(s))                      return `Works together with ${nm}`;
    if (/\.Tag\s*[!=]=|\btag\s*==\s*GameTag|otherBuilding\.Tag|ContainsCategory|Categories\.Contains/.test(s))
      return `Reacts to a nearby ${nm}`;
    return `Interacts with ${noun}`;
  }
  // Which side of the relationship this interaction is: `out` = the building acts on /
  // scores off the value (it is the interactor); `in` = the building's own activation or
  // scaling DEPENDS on the value being present (the value interfaces into it). Drives the
  // two labelled groups in the building detail.
  const OUT_SNIPPET = /TransformBuildingInto|InstantiateAndBuild|AddConsumable|RemoveResourceIfPossible|ScoreSpecialResource|IrrigateAdjacent|AddLocalStatChange|GetScoreForTag|GetCountOfBuildings|GetBuildingsOf(?:Type|Category)Adjacent|CurrentTagCount/;
  function interactionRole(it) {
    if (it.confers) return "provides";   // pushes a category onto neighbours — it indirectly PROVIDES that tag
    if (it.action || it.source === "declared") return "out";
    if (/^Can[A-Z]/.test(it.method || "")) return "in";   // a Can… gate is a requirement, not an effect
    return OUT_SNIPPET.test(it.snippet || "") ? "out" : "in";
  }

  // ── overlap computation ──
  // Why is a building an overlap candidate against the OTHER guild? Any of:
  // cross-targets it, shares an owned functional category, shares an event type,
  // or touches a shared nature node. (Confirmed rule: "any cross-guild link".)
  // Is a building's participation in `ev` a LIVE cross-guild link against `other`?
  // Emitting an event is unconditional. A qualified listener (e.g. Windmill only reacts to a
  // transformation of a Crop) counts only when `other` actually owns the qualifying surface —
  // otherwise the reaction could only ever involve its own guild, so it is not a crossover.
  function eventLinkActive(b, ev, other) {
    if ((b.emits || []).includes(ev)) return true;
    if (!(b.listens || []).includes(ev)) return false;
    const q = (b.listenQualifiers || {})[ev];
    if (!q) return true;
    return (q.cats || []).some((c) => other.ownedCats.includes(c))
        || (q.tags || []).some((t) => other.ownedTags.includes(t));
  }
  function buildingReasons(b, other) {
    const r = [];
    if (b.interactionGuilds.includes(other.id))
      r.push({ k: "target", g: "⇄", t: `Scores / affects ${other.name} buildings` });
    // A shared owned category only counts if something interacts with it (see
    // catHasInteractor); a surface both guilds merely own is not an association.
    const selfG = guildById.get(b.guild);
    const cats = b.ownedFunctional.filter((c) =>
      other.functionalCategories.includes(c) && catHasInteractor(c, selfG, other));
    if (cats.length) r.push({ k: "cat", g: "▤", t: `Shared category: ${cats.join(", ")}` });
    const evs = b.events.filter((e) => other.events.includes(e) && eventLinkActive(b, e, other));
    if (evs.length) r.push({ k: "event", g: "◆", t: `Shared event: ${evs.map((e) => (eventById.get(e) || {}).name || e).join(", ")}` });
    const nat = b.natureNodes.filter((n) => other.natureNodes.includes(n));
    if (nat.length) r.push({ k: "nature", g: "❦", t: `Shared nature: ${nat.map((n) => (natureByKey.get(n) || {}).name || n).join(", ")}` });
    return r;
  }

  // ═══════════════════════════════════ HOME / COMPARE VIEW ═══════════════════
  function renderApp() {
    const app = document.getElementById("app");
    const prev = app.querySelector(".compare-main");
    const scroll = prev ? prev.scrollTop : 0;

    const [a, b] = state.pair.map((id) => (id ? guildById.get(id) : null));

    app.innerHTML = `
      <header class="app-header">
        <h1>Combolands — Guild Overlap</h1>
        <div class="header-actions">
          <button class="ghost" data-action="drawodds" title="Blueprint draw probability by milestone">🎲 Draw Odds</button>
          <button class="ghost" data-action="appendix" title="Search every page">🔍 Appendix</button>
          ${(a || b) ? `<button class="ghost" data-action="clear">Clear</button>` : ""}
        </div>
      </header>
      <main class="compare-main">
        <div class="compare">
          ${bannerSlotHTML(0, a)}
          <div class="center-col">${centerHTML(a, b)}</div>
          ${bannerSlotHTML(1, b)}
        </div>
      </main>`;

    const main = app.querySelector(".compare-main");
    if (main) main.scrollTop = scroll;
  }

  // A full-height guild flag; the name reads inside the banner. Empty = grey Null banner.
  // On mobile this becomes a fixed solid-colour side bar (see .banner-left/.banner-right).
  function bannerSlotHTML(side, g) {
    const sideCls = side === 0 ? "banner-left" : "banner-right";
    if (!g) {
      return `<div class="banner-slot null ${sideCls}" data-action="open-guild" data-side="${side}">
        <div class="banner-fig">
          <img class="banner-img" src="assets/banners/BannerHidden.png" alt="" onerror="this.style.visibility='hidden'">
          <span class="banner-name">Choose a guild</span>
        </div></div>`;
    }
    return `<div class="banner-slot ${sideCls}" data-action="open-guild" data-side="${side}" style="--g-color:${esc(g.color)}">
      <div class="banner-fig">
        ${g.banner ? `<img class="banner-img" src="${esc(g.banner)}" alt="" onerror="this.style.visibility='hidden'">` : ""}
        ${(g.emblem || g.badge) ? `<img class="banner-badge" src="${esc(g.emblem || g.badge)}" alt="" onerror="this.style.visibility='hidden'">` : ""}
        <span class="banner-name">${esc(g.name)}</span>
      </div></div>`;
  }

  // Shared functional categories for the pair (functional traits only).
  function sharedFunctionalCats(a, b) {
    const combo = comboFor(a.id, b.id) || {};
    const list = combo.sharedFunctionalCategories && combo.sharedFunctionalCategories.length
      ? combo.sharedFunctionalCategories
      : a.functionalCategories.filter((c) => b.functionalCategories.includes(c));
    return [...new Set(list)].filter((c) => (catById.get(c) || {}).kind === "functional").sort();
  }
  const ownsCat = (b, cat) => b.ownedMinors.includes(cat);
  // A confers interaction PROVIDES the category to neighbours — it is not scoring/acting
  // on it. Keep the two split so a granter (Trapper's Lodge → Husbandry) is filed under
  // "Provide", not "Score off / act on".
  const providesCat = (b, cat) => (b.interactions || []).some((it) => it.value === cat && it.confers);
  const targetsCat = (b, cat) => (b.interactions || []).some((it) => it.value === cat && !it.confers);
  const isOverlap = (b, other) => buildingReasons(b, other).length > 0;

  // A shared owned category is only a REAL association if at least one building
  // (in either guild) actually interacts with that surface. Two guilds both
  // OWNING a category but with nothing that targets it is not an interaction —
  // it's a coincidental shared label, so it must not count as an overlap tag.
  function catHasInteractor(cat, g1, g2) {
    for (const g of [g1, g2]) for (const bld of buildingsByGuild.get(g.id) || [])
      if (targetsCat(bld, cat) || providesCat(bld, cat)) return true;
    return false;
  }
  const validSharedCats = (a, b) =>
    sharedFunctionalCats(a, b).filter((c) => catHasInteractor(c, a, b));

  // Buildings from BOTH guilds that OWN or TARGET a shared category — the members
  // of that trait's overlap section (e.g. crop buildings + buildings that score off crops).
  function overlapBuildingsForCat(cat, a, b) {
    const out = [];
    for (const g of [a, b]) for (const bld of buildingsByGuild.get(g.id) || []) {
      const owns = ownsCat(bld, cat), targets = targetsCat(bld, cat), provides = providesCat(bld, cat);
      if (owns || targets || provides) out.push({ bld, owns, targets, provides });
    }
    return out.sort((x, y) => (x.bld.rarityRank - y.bld.rarityRank) || x.bld.name.localeCompare(y.bld.name));
  }

  // ═══ CENTRE COLUMN — how the two guilds interlock ═══
  function centerHTML(a, b) {
    if (!a && !b) return `<div class="hero"><h2>Pick two guilds</h2>
      <p>Tap a banner on either side to choose a guild, then see how the two interlock —
      buildings grouped by the traits they share, plus shared nature, neutral map structures, counselors and events.</p></div>`;
    if (!a || !b) return `<div class="hero"><h2>Select a second guild</h2>
      <p>Choose the other banner to reveal the overlap between the two guilds.</p></div>`;

    const combo = comboFor(a.id, b.id) || {};
    // Only shared categories that some building actually interacts with — a
    // surface owned by both guilds but targeted by nothing is not a real tag.
    const cats = validSharedCats(a, b);
    // Shared events, each narrowed to its live members up-front so the chip index and the
    // section list agree — an event whose only links are unsatisfied qualifiers drops out.
    const eventSections = a.events.filter((e) => b.events.includes(e))
      .map((ev) => ({ ev, members: overlapBuildingsForEvent(ev, a, b) }))
      .filter((s) => s.members.length);
    const sharedEvents = eventSections.map((s) => s.ev);
    const sharedNature = combo.sharedNature || [];
    // Neutral buildings both guilds connect to — a shared edge owned by neither
    // guild (parallel to shared nature). Gated on BOTH guilds interacting.
    const sharedNeutral = (DATA.neutralBuildings || []).filter((n) =>
      (n.connectionsByGuild || {})[a.id] && (n.connectionsByGuild || {})[b.id]).sort(byRarityThenName);
    const sharedCouncil = (DATA.counselors || []).filter((c) => c.guildReach.includes(a.id) && c.guildReach.includes(b.id));

    const title = `<div class="combo-title">
      <div class="combo-name">${combo.name ? esc(combo.name) : `${esc(a.name)} + ${esc(b.name)}`}</div>
      <div class="combo-sub">${esc(a.name)} + ${esc(b.name)}${combo.structuralEdges != null ? ` · ${combo.structuralEdges} structural · ${combo.eventEdges} event links` : ""}</div></div>`;

    // quick index of the shared tags (traits + event types)
    const tagIndex = block("Shared tags", `<div class="trait-list">${cats.map((c) => traitBanner(c)).join("")}${sharedEvents.map((e) => eventChipHTML(e)).join("")}</div>`);

    // overlap buildings grouped by shared trait — the core view, each headed by the trait banner
    let overlap = "";
    for (const cat of cats) {
      const members = overlapBuildingsForCat(cat, a, b);
      if (members.length) overlap += traitSectionHTML(cat, members);
    }
    const overlapBlock = overlap
      ? `<div class="overlap-wrap"><h3 class="centre-h">Overlapping buildings — by shared trait</h3>${overlap}</div>`
      : block("Overlapping buildings", `<p class="empty-note">No shared functional categories.</p>`);

    // overlap buildings grouped by shared EVENT — same treatment as traits
    let eventOverlap = "";
    for (const { ev, members } of eventSections) eventOverlap += eventSectionHTML(ev, members);
    const eventBlock = eventOverlap
      ? `<div class="overlap-wrap"><h3 class="centre-h">Overlapping buildings — by shared event</h3>${eventOverlap}</div>`
      : block("Shared events", `<p class="empty-note">No shared event links.</p>`);

    const natureBlock = block("Shared nature interactions", sharedNature.length
      ? sharedNature.map((n) => natureRowHTML(n, a, b)).join("")
      : `<p class="empty-note">No shared nature-resource interactions.</p>`);
    const neutralBlock = block("Shared neutral buildings", sharedNeutral.length
      ? sharedNeutral.map((n) => neutralRowHTML(n, a, b)).join("")
      : `<p class="empty-note">No neutral building bridges both guilds.</p>`);
    const councilBlock = block("Shared counselors — votes to focus", sharedCouncil.length
      ? sharedCouncil.map((c) => counselorCardHTML(c)).join("")
      : `<p class="empty-note">No counselor reaches both guilds.</p>`);

    const heirsBoth = (DATA.heirlooms || []).filter((h) => h.reachesGuilds.includes(a.id) && h.reachesGuilds.includes(b.id)).sort(byRarityThenName);
    const heirBlock = block("Heirlooms that bridge both guilds", heirsBoth.length
      ? `<div class="tile-grid">${heirsBoth.map((h) => heirloomTile(h, true)).join("")}</div>`
      : `<p class="empty-note">No heirloom reaches both guilds.</p>`);

    // each guild's remaining (non-overlap) buildings + heirlooms, collapsed by default
    const remaining = [a, b].map((g) => {
      const other = g === a ? b : a;
      const others = (buildingsByGuild.get(g.id) || []).filter((x) => !isOverlap(x, other));
      const heirs = (heirloomsByGuild.get(g.id) || []).filter((h) => !h.reachesGuilds.includes(other.id));
      return sectionHTML(`${g.id}-rest`, `${g.name} — other buildings & heirlooms`,
        `<div class="tile-grid">${others.map((x) => buildingTile(x)).join("")}${heirs.map((x) => heirloomTile(x, false)).join("")}</div>`,
        others.length + heirs.length, false, true);
    }).join("");

    // Heirlooms that synergise with NEITHER selected guild — the pair-independent /
    // other-guild ones. Drafted independently of guilds, so they always exist as an
    // unshared edge; shown collapsed so every heirloom has a home for any pair.
    const otherHeirs = (DATA.heirlooms || [])
      .filter((h) => !h.reachesGuilds.includes(a.id) && !h.reachesGuilds.includes(b.id))
      .sort(byRarityThenName);
    const otherHeirBlock = sectionHTML("univ-heirlooms", "Other heirlooms — no direct synergy with either guild",
      `<div class="tile-grid">${otherHeirs.map((h) => heirloomTile(h, false)).join("")}</div>`,
      otherHeirs.length, false, true);

    return title + tagIndex + overlapBlock + eventBlock + natureBlock + neutralBlock + councilBlock + heirBlock + `<div class="rest-wrap">${remaining}${otherHeirBlock}</div>`;
  }

  // A labelled sub-group of tiles within an overlap section (the two halves of the
  // interactor / interface split).
  function ovSubGroup(label, tilesHTML) {
    return tilesHTML ? `<div class="ov-subgroup"><div class="ov-sub-label">${esc(label)}</div>
      <div class="tile-grid">${tilesHTML}</div></div>` : "";
  }
  // A shared-trait section: headed by the trait banner, then split into the two roles
  // so it's clear which buildings ACT ON the trait (score off / target it) and which
  // PROVIDE it — either by carrying it as their own surface OR by granting it to their
  // neighbours (Trapper's Lodge → Husbandry). A building doing both appears in both.
  function traitSectionHTML(cat, members) {
    const c = catById.get(cat); if (!c) return "";
    const interactors = members.filter((m) => m.targets).map((m) => overlapTile(m.bld, { targets: true })).join("");
    const providers = members.filter((m) => m.owns || m.provides)
      .map((m) => overlapTile(m.bld, { owns: m.owns, provides: m.provides })).join("");
    return `<section class="trait-section">
      <div class="trait-section-head" data-action="nav-cat" data-cat="${esc(cat)}"
        style="--aff-color:${esc(c.color)};--aff-text:${textColorFor(c.color)}">
        <span class="ts-name">${esc(c.name)}</span><span class="ts-count">${members.length}</span></div>
      ${ovSubGroup(`Score off / act on ${c.name}`, interactors)}${ovSubGroup(`Provide ${c.name}`, providers)}</section>`;
  }

  // Overlap tile — shows which guild it belongs to (badge + coloured border) and
  // one or more "reason" markers (why it's in this section). Shared by the trait
  // sections (owns ▤ / targets ⇄) and the event sections (emits ▲ / listens ▼).
  function ovTile(b, rs) {
    const g = guildById.get(b.guild) || {};
    return `<div class="tile ov" data-action="detail-building" data-key="${esc(b.key)}" title="${esc(b.name)} (${esc(b.guild)}) — ${esc(b.rarity || "—")}" style="--g-color:${esc(g.color)};--rar-color:${rarVar(b.rarity)}">
      ${g.badge ? `<img class="tile-guild" src="${esc(g.badge)}" alt="" onerror="this.style.visibility='hidden'">` : ""}
      <span class="tile-icon">${b.sprite ? iconImg(b.sprite) : placeholder(b.name)}</span>
      <span class="tile-name">${esc(b.name)}</span>
      <span class="reasons">${rs.map((r) => `<span class="reason r-${r.k}" title="${esc(r.t)}">${r.g}</span>`).join("")}</span>
    </div>`;
  }
  function overlapTile(b, { owns, targets, provides } = {}) {
    const rs = [];
    if (owns) rs.push({ k: "cat", g: "▤", t: `${b.guild} building carrying this trait` });
    if (provides) rs.push({ k: "provide", g: "⤳", t: "Grants this trait to nearby buildings" });
    if (targets) rs.push({ k: "target", g: "⇄", t: "Scores off / targets this trait" });
    return ovTile(b, rs);
  }
  const qualLabel = (q) => [...(q.cats || []), ...(q.tags || [])]
    .map((c) => (catById.get(c) || {}).name || (natureByKey.get(c) || {}).name || c).join(", ");
  // Event overlap tile — emits ▲ / listens ▼ for the section's event. A qualified listener
  // notes what the event must involve (e.g. "▼ only a Crop").
  function eventTile(b, emits, listens, qualifier) {
    const rs = [];
    if (emits) rs.push({ k: "event", g: "▲", t: "Emits this event" });
    if (listens) rs.push({ k: "event", g: "▼", t: qualifier
      ? `Listens — only when it involves a ${qualLabel(qualifier)}` : "Listens for this event" });
    return ovTile(b, rs);
  }
  // Buildings from BOTH guilds that emit or listen for a shared event — the members of that
  // event's overlap section. A building that only LISTENS via a qualifier the OTHER guild
  // can't satisfy is dropped: its reaction can't be triggered by anything that guild fields.
  function overlapBuildingsForEvent(ev, a, b) {
    const out = [];
    for (const [g, other] of [[a, b], [b, a]]) for (const bld of buildingsByGuild.get(g.id) || []) {
      const emits = (bld.emits || []).includes(ev), listens = (bld.listens || []).includes(ev);
      if (!emits && !listens) continue;
      if (!emits && listens && !eventLinkActive(bld, ev, other)) continue;
      out.push({ bld, emits, listens, qualifier: (bld.listenQualifiers || {})[ev] || null });
    }
    return out.sort((x, y) => (x.bld.rarityRank - y.bld.rarityRank) || x.bld.name.localeCompare(y.bld.name));
  }
  // An event section — same shape as a trait section but headed by the (now
  // short-named) event, tinted with the interactive accent colour.
  function eventSectionHTML(ev, members) {
    const e = eventById.get(ev) || { name: ev, note: "" };
    const emitters = members.filter((m) => m.emits).map((m) => eventTile(m.bld, true, false, null)).join("");
    const reactors = members.filter((m) => m.listens).map((m) => eventTile(m.bld, false, true, m.qualifier)).join("");
    return `<section class="trait-section event-section">
      <div class="trait-section-head" data-action="detail-event" data-id="${esc(ev)}"
        style="--aff-color:var(--accent);--aff-text:#fff" title="${esc(e.note || "")}">
        <span class="ts-name">${esc(e.name)}</span><span class="ts-count">${members.length}</span></div>
      ${ovSubGroup(`React to ${e.name}`, reactors)}${ovSubGroup(`Emit ${e.name}`, emitters)}</section>`;
  }

  function sectionHTML(id, title, bodyHTML, count, isPrimary, collapsedDefault) {
    const collapsed = state.collapsed.has(id) ? true : (state.collapsed.has("!" + id) ? false : collapsedDefault);
    const body = count ? bodyHTML : `<p class="empty-note">None.</p>`;
    return `<section class="section ${isPrimary ? "primary" : ""} ${collapsed ? "collapsed" : ""}">
      <div class="section-head" data-action="toggle-section" data-sid="${esc(id)}">
        <span class="caret">▼</span><span>${esc(title)}</span><span class="badge-count">${count}</span></div>
      <div class="section-body">${body}</div></section>`;
  }

  function buildingTile(b) {
    return `<div class="tile" data-action="detail-building" data-key="${esc(b.key)}" title="${esc(b.name)} — ${esc(b.rarity || "—")}" style="--rar-color:${rarVar(b.rarity)}">
      <span class="tile-icon">${b.sprite ? iconImg(b.sprite) : placeholder(b.name)}</span>
      <span class="tile-name">${esc(b.name)}</span></div>`;
  }

  function heirloomTile(h, primary) {
    return `<div class="tile ${primary ? "primary" : ""}" data-action="detail-heirloom" data-key="${esc(h.key)}" title="${esc(h.name)} — ${esc(h.rarity || "—")}" style="--rar-color:${rarVar(h.rarity)}">
      <span class="tile-icon">${h.sprite ? iconImg(h.sprite) : placeholder(h.name)}</span>
      <span class="tile-name">${esc(h.name)}</span>
      ${primary ? `<span class="reasons"><span class="reason r-target" title="Bridges both guilds">⇄</span></span>` : ""}
    </div>`;
  }
  const block = (title, inner) => `<div class="shared-block"><h3>${esc(title)}</h3>${inner}</div>`;

  function natureRowHTML(n, a, b) {
    const nat = natureByKey.get(n.tag) || {};
    const side = (guildName, blds) => blds && blds.length
      ? `<div class="nat-side" style="--g-color:${esc((guildById.get(guildName) || {}).color || "")}"><b>${esc((guildById.get(guildName) || {}).name || guildName)}:</b> ${esc(blds.join(", "))}</div>` : "";
    return `<div class="nature-row" data-action="detail-nature" data-key="${esc(n.tag)}">
      <span class="nat-icon">${nat.sprite ? iconImg(nat.sprite) : `<span class="ph">❦</span>`}</span>
      <div class="nat-body">
        <div class="nat-name">${esc(n.resource || nat.name || n.tag)}</div>
        ${side(n.aGuild, n.aBuildings)}${side(n.bGuild, n.bBuildings)}
      </div></div>`;
  }

  // A shared neutral-building row — same shape as a nature row, but the whole row
  // opens the building's detail page. Each side lists that guild's buildings that
  // connect to the neutral structure (score off it / are affected by it).
  function neutralRowHTML(n, a, b) {
    const side = (g) => {
      const conns = (n.connectionsByGuild || {})[g.id] || [];
      if (!conns.length) return "";
      return `<div class="nat-side" style="--g-color:${esc(g.color || "")}"><b>${esc(g.name)}:</b> ${esc(conns.map((c) => c.name).join(", "))}</div>`;
    };
    return `<div class="nature-row" data-action="detail-building" data-key="${esc(n.key)}">
      <span class="nat-icon">${n.sprite ? iconImg(n.sprite) : placeholder(n.name)}</span>
      <div class="nat-body">
        <div class="nat-name">${esc(n.name)} <span class="neutral-tag">neutral</span></div>
        ${side(a)}${side(b)}
      </div></div>`;
  }

  function counselorCardHTML(c) {
    const cats = (c.multStackCategories || []).map((x) => traitBanner(x, true)).join("");
    return `<div class="counselor-card" data-action="detail-counselor" data-name="${esc(c.name)}">
      <span class="portrait">${iconImg(c.sprite)}</span>
      <div class="c-body">
        <div class="c-name">${esc(c.name)}</div>
        <div class="c-theme">${esc(c.theme)}</div>
        ${cats ? `<div class="c-cats">${cats}</div>` : ""}
      </div></div>`;
  }

  function eventChipHTML(e) {
    const ev = eventById.get(e) || { name: e };
    return `<span class="event-chip" data-action="detail-event" data-id="${esc(e)}" title="${esc(ev.note || "")}">${esc(ev.name)}</span>`;
  }

  // ═══════════════════════════════════ GUILD SELECTOR OVERLAY ════════════════
  function openGuildSelector(side) {
    state.ovl = { side, pending: state.pair[side] || null };
    const root = document.getElementById("overlay-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header">
          <h2>Choose a guild — ${side === 0 ? "left" : "right"} banner</h2>
          <button class="overlay-close" data-action="cancel" aria-label="Close">&times;</button>
        </div>
        <div class="overlay-body"><div class="ovl-scroll"><div class="guild-picker"></div></div></div>
        <div class="overlay-footer">
          ${state.pair[side] ? `<button class="ghost" data-action="unset">Remove</button>` : ""}
          <button class="ghost" data-action="cancel">Cancel</button>
          <button data-action="confirm">Confirm</button>
        </div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
    refreshSelector();
  }

  function refreshSelector() {
    const panel = document.querySelector("#overlay-root .overlay-panel");
    if (!panel || !state.ovl) return;
    const scroller = panel.querySelector(".ovl-scroll");
    const scroll = scroller ? scroller.scrollTop : 0;
    const otherPick = state.pair[state.ovl.side === 0 ? 1 : 0];

    // Only the 7 core guilds are selectable (Arcane/Rogues excluded). Each pick is
    // the full banner flag (name inside), rendered exactly like the main page.
    panel.querySelector(".guild-picker").innerHTML = (DATA.guilds || []).filter((g) => g.isCore).map((g) => {
      const disabled = g.id === otherPick;                 // can't pick the same guild twice
      const sel = g.id === state.ovl.pending;
      const art = g.banner
        ? `<img class="banner-img" src="${esc(g.banner)}" alt="" onerror="this.style.visibility='hidden'">`
        : iconImg(g.badge, "banner-img");
      return `<div class="gp ${sel ? "selected" : ""} ${disabled ? "disabled" : ""}"
        data-action="pick-guild" data-id="${esc(g.id)}" style="--g-color:${esc(g.color)}">
        <div class="banner-fig">${art}<span class="banner-name">${esc(g.name)}</span></div>
        <button class="gp-info" data-action="guild-detail" data-id="${esc(g.id)}"
          title="View ${esc(g.name)} guild details" aria-label="View ${esc(g.name)} guild details">&#9432; Details</button>
      </div>`;
    }).join("");

    if (scroller) scroller.scrollTop = scroll;
  }

  function closeSelector(commit) {
    if (!state.ovl) return;
    if (commit) { state.pair[state.ovl.side] = state.ovl.pending; persist(); }
    state.ovl = null;
    const root = document.getElementById("overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
    renderApp();
  }

  // ═══════════════════════════════════ DETAIL OVERLAY ════════════════════════
  // The detail layer keeps a breadcrumb stack (state.detailStack) so cross-links
  // (guild → building → category …) can be walked back one at a time instead of
  // dumping you out. showDetail() opens a page: `reset` starts a fresh trail
  // (entering from the main page / appendix / selector), otherwise it pushes onto
  // the trail (a cross-link inside the overlay). ✕ and the footer button pop one
  // level (labelled "Back" while deeper than one); Escape / backdrop dismiss all.
  const DETAIL_RENDERERS = {
    guild: openGuildDetail, building: openBuildingDetail, heirloom: openHeirloomDetail,
    counselor: openCounselorDetail, event: openEventDetail, nature: openNatureDetail, cat: openCategoryDetail,
  };
  function showDetail(kind, id, reset) {
    if (!DETAIL_RENDERERS[kind]) return;
    if (reset) state.detailStack = [];
    state.detailStack.push({ kind, id });
    DETAIL_RENDERERS[kind](id);   // renders via renderDetail(), which reads stack depth
  }
  function renderCurrentDetail() {
    const top = state.detailStack[state.detailStack.length - 1];
    if (!top) return hideDetailOverlay();
    DETAIL_RENDERERS[top.kind](top.id);
  }
  // ✕ / footer button: step back one page; hide once the trail is empty.
  function backDetail() {
    state.detailStack.pop();
    if (state.detailStack.length) renderCurrentDetail(); else hideDetailOverlay();
  }
  function hideDetailOverlay() {
    state.detailStack = [];
    const root = document.getElementById("detail-overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
  }
  function renderDetail(title, bodyHTML) {
    const root = document.getElementById("detail-overlay-root");
    const back = state.detailStack.length > 1;   // deeper than the entry page → offer "Back"
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header"><h2>${title}</h2>
          <button class="overlay-close" data-action="back-detail" aria-label="${back ? "Back" : "Close"}">&times;</button></div>
        <div class="overlay-body"><div class="ovl-scroll detail-main">${bodyHTML}</div></div>
        <div class="overlay-footer"><button data-action="back-detail">${back ? "◂ Back" : "Close"}</button></div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
  }
  // Map a clicked [data-action] element to a detail target {kind,id}, or null for
  // non-detail actions. Each detail action carries its id under a different data-*.
  const DETAIL_KIND = { "guild-detail": "guild", "detail-building": "building", "detail-heirloom": "heirloom",
    "detail-counselor": "counselor", "detail-event": "event", "detail-nature": "nature", "nav-cat": "cat" };
  function detailTarget(el) {
    const kind = DETAIL_KIND[el.dataset.action]; if (!kind) return null;
    return { kind, id: el.dataset.id ?? el.dataset.key ?? el.dataset.name ?? el.dataset.cat };
  }

  function openBuildingDetail(key) {
    const b = buildingByKey.get(key); if (!b) return;
    const g = guildById.get(b.guild) || {};
    const isNeutral = b.guild === "Neutral";
    // Neutral buildings are owned by no guild — don't lead the trait list with a
    // "Neutral" major; show just the functional minors it actually carries.
    const owned = isNeutral ? b.ownedMinors : [b.guild, ...b.ownedMinors];
    const inter = (b.interactions || []).filter((it) => it.guilds.length);
    // Two clearly-separated groups: what the building ACTS ON (its targets/effects) vs
    // what it RESPONDS TO (conditions/scaling that must be present for it to work).
    const interRow = (it) => `
      <div class="inter">
        <div class="i-head">
          <span class="i-desc"${it.snippet ? ` title="${esc(it.snippet)}"` : ""}>${describeInteraction(it)}</span>
          <span class="i-guilds">${it.guilds.map(guildTag).join("")}</span>
        </div>
      </div>`;
    const interGroup = (title, list) => list.length
      ? `<div class="d-section"><h3>${esc(title)}</h3><div class="inter-list">${list.map(interRow).join("")}</div></div>` : "";
    const actsOn = inter.filter((it) => interactionRole(it) === "out");
    const provides = inter.filter((it) => interactionRole(it) === "provides");
    const respondsTo = inter.filter((it) => interactionRole(it) === "in");
    const interHTML = (actsOn.length || provides.length || respondsTo.length)
      ? interGroup("Provides — grants a category to nearby buildings", provides)
        + interGroup("Acts on — pieces it scores off / affects", actsOn)
        + interGroup("Responds to — must be present for it to work", respondsTo)
      : `<div class="d-section"><h3>Interacts with</h3><p class="empty-note">No declared cross-piece targets (scores via owned traits / universal modifiers).</p></div>`;

    const events = [
      ...b.emits.map((e) => ({ e, dir: "emits" })),
      ...b.listens.map((e) => ({ e, dir: "listens" })),
    ];
    const eventsHTML = events.length
      ? `<div class="event-list">${events.map((x) => {
          const q = x.dir === "listens" ? (b.listenQualifiers || {})[x.e] : null;
          const suffix = q ? ` <em class="chip-qual">(only ${esc(qualLabel(q))})</em>` : "";
          return `<span class="event-chip" data-action="detail-event" data-id="${esc(x.e)}">${x.dir === "emits" ? "▲" : "▼"} ${esc((eventById.get(x.e) || {}).name || x.e)}${suffix}</span>`;
        }).join("")}</div>`
      : "";

    renderDetail(esc(b.name), `
      <div class="detail-hero">
        <span class="d-icon">${b.sprite ? iconImg(b.sprite) : placeholder(b.name)}</span>
        <div class="d-meta"><h2>${esc(b.name)}</h2>
          <div class="d-tags">${isNeutral ? `<span class="pill neutral-pill">Neutral</span>` : guildTag(b.guild)}<span class="pill rarity" style="color:var(--rar-${rarLower(b.rarity)})">${esc(b.rarity || "—")}</span></div>
        </div></div>
      ${b.descHTML ? `<div class="d-desc">${b.descHTML}</div>` : ""}
      <div class="d-section"><h3>Owned categories — its targetable surface</h3>
        <div class="trait-list">${owned.map((c) => traitBanner(c)).join("")}</div></div>
      ${isNeutral && (b.reachesGuilds || []).length ? `<div class="d-section"><h3>Guilds that interact with it</h3>
        <div class="d-tags">${b.reachesGuilds.map(guildTag).join("")}</div></div>` : ""}
      ${interHTML}
      ${eventsHTML ? `<div class="d-section"><h3>Events (▲ emits · ▼ listens)</h3>${eventsHTML}</div>` : ""}`);
  }

  function openHeirloomDetail(key) {
    const h = heirloomByKey.get(key); if (!h) return;
    renderDetail(esc(h.name), `
      <div class="detail-hero">
        <span class="d-icon">${h.sprite ? iconImg(h.sprite) : placeholder(h.name)}</span>
        <div class="d-meta"><h2>${esc(h.name)}</h2>
          <div class="d-tags"><span class="pill">Heirloom</span>${h.minors.map((m) => `<span class="pill">${esc(m)}</span>`).join("")}
          <span class="pill rarity" style="color:var(--rar-${rarLower(h.rarity)})">${esc(h.rarity || "—")}</span>
          ${h.passive ? `<span class="pill">passive</span>` : ""}</div>
        </div></div>
      ${h.descHTML ? `<div class="d-desc">${h.descHTML}</div>` : ""}
      ${(h.affectedCategories || []).filter((c) => catById.has(c)).length ? `<div class="d-section"><h3>Synergises with categories</h3>
        <div class="trait-list">${h.affectedCategories.filter((c) => catById.has(c)).map((c) => traitBanner(c)).join("")}</div></div>` : ""}
      ${h.reachesGuilds.length
        ? `<div class="d-section"><h3>Reaches guilds</h3><div class="d-tags">${h.reachesGuilds.map(guildTag).join("")}</div></div>`
        : `<div class="d-section"><h3>Reaches guilds</h3><p class="empty-note">Universal — synergy isn't tied to a specific guild.</p></div>`}
      ${h.validTriggers.length ? `<div class="d-section"><h3>Triggers on</h3>
        <div class="event-list">${h.validTriggers.map((e) => eventChipHTML(e)).join("")}</div></div>` : ""}`);
  }

  function openCounselorDetail(name) {
    const c = counselorByName.get(name); if (!c) return;
    const catRow = (arr) => arr && arr.length ? `<div class="trait-list">${arr.map((x) => traitBanner(x, true)).join("")}</div>` : `<p class="empty-note">—</p>`;
    renderDetail(esc(c.name), `
      <div class="detail-hero">
        <span class="d-icon d-icon-portrait">${iconImg(c.sprite)}</span>
        <div class="d-meta"><h2>${esc(c.name)}</h2><div class="c-theme">${esc(c.theme)}</div>
          <div class="d-tags" style="margin-top:.4rem">${c.guildReach.map(guildTag).join("")}</div></div></div>
      <div class="d-section"><h3>Vote mult-stack categories</h3>${catRow(c.multStackCategories)}</div>
      ${c.passiveCategories.length ? `<div class="d-section"><h3>Passive-effect categories</h3>${catRow(c.passiveCategories)}</div>` : ""}
      ${c.passive.length ? `<div class="d-section"><h3>Passives</h3><div class="inter-list">${c.passive.map((p) => `<div class="inter"><div class="i-head"><span class="i-val">${esc(p.effect)}</span></div><div class="i-snippet">${esc(p.cond)}</div></div>`).join("")}</div></div>` : ""}
      ${c.milestones.length ? `<div class="d-section"><h3>Vote rewards</h3><div class="inter-list">${c.milestones.map((m) => `<div class="inter"><div class="i-head"><span class="i-kind">${m.votes} votes</span><span class="i-val">${esc(m.reward)}</span></div></div>`).join("")}</div></div>` : ""}`);
  }

  // Guilds a category/event detail lists building members for. Opened from the
  // main page it is SCOPED to the two active guilds (showing "None." where empty
  // so the pair reads consistently). Opened from the Appendix global search
  // (state.detailGlobal) it spans ALL guilds, omitting guilds with no members.
  const detailScopeGuilds = () => state.detailGlobal
    ? (DATA.guilds || [])
    : state.pair.map((x) => (x ? guildById.get(x) : null)).filter(Boolean);

  // Category detail: which guilds share it, and which buildings OWN or TARGET it.
  function openCategoryDetail(id) {
    const c = catById.get(id); if (!c) return;
    const usersFor = (g) => {
      if (!g) return "";
      const owners = (buildingsByGuild.get(g.id) || []).filter((x) => x.ownedMinors.includes(id) || x.guild === id);
      const granters = (buildingsByGuild.get(g.id) || []).filter((x) => providesCat(x, id));
      const targeters = (buildingsByGuild.get(g.id) || []).filter((x) => targetsCat(x, id));
      if (state.detailGlobal && !owners.length && !granters.length && !targeters.length) return ""; // global view omits guilds with nothing
      const list = (arr) => arr.length ? `<div class="detail-users">${arr.map((x) => `<span class="u" data-action="detail-building" data-key="${esc(x.key)}">${x.sprite ? iconImg(x.sprite) : ""}${esc(x.name)}</span>`).join("")}</div>` : `<p class="empty-note">None.</p>`;
      return `<div class="d-section"><h3>${esc(g.name)} — owns it</h3>${list(owners)}</div>
        ${granters.length ? `<div class="d-section"><h3>${esc(g.name)} — grants it to neighbours</h3>${list(granters)}</div>` : ""}
        <div class="d-section"><h3>${esc(g.name)} — targets it</h3>${list(targeters)}</div>`;
    };
    renderDetail(esc(c.name), `
      <div class="detail-hero"><div class="d-meta">
        <div class="trait-list">${traitBanner(id)}</div>
        <div class="c-theme" style="margin-top:.4rem">${c.kind === "guild" ? "Guild category" : c.kind === "resource" ? "Resource category" : "Functional category"}</div>
      </div></div>
      ${c.guildsSharing.length ? `<div class="d-section"><h3>Guilds carrying this category</h3><div class="d-tags">${c.guildsSharing.map(guildTag).join("")}</div></div>` : ""}
      ${detailScopeGuilds().map(usersFor).join("")}`);
  }

  function openEventDetail(id) {
    const ev = eventById.get(id) || { name: id, note: "" };
    const sideFor = (g) => {
      if (!g) return "";
      const emit = (buildingsByGuild.get(g.id) || []).filter((x) => x.emits.includes(id));
      const listen = (buildingsByGuild.get(g.id) || []).filter((x) => x.listens.includes(id));
      if (state.detailGlobal && !emit.length && !listen.length) return ""; // global view omits guilds with nothing
      const list = (arr) => arr.length ? `<div class="detail-users">${arr.map((x) => `<span class="u" data-action="detail-building" data-key="${esc(x.key)}">${x.sprite ? iconImg(x.sprite) : ""}${esc(x.name)}</span>`).join("")}</div>` : `<p class="empty-note">None.</p>`;
      return `<div class="d-section"><h3>${esc(g.name)} — ▲ emits</h3>${list(emit)}</div>
        <div class="d-section"><h3>${esc(g.name)} — ▼ listens</h3>${list(listen)}</div>`;
    };
    renderDetail(esc(ev.name), `${ev.note ? `<div class="d-desc">${esc(ev.note)}</div>` : ""}${detailScopeGuilds().map(sideFor).join("")}`);
  }

  function openNatureDetail(tag) {
    const n = natureByKey.get(tag); if (!n) return;
    renderDetail(esc(n.name), `
      <div class="detail-hero">
        <span class="d-icon">${n.sprite ? iconImg(n.sprite) : `<span class="ph">❦</span>`}</span>
        <div class="d-meta"><h2>${esc(n.name)}</h2>
          <div class="c-theme">Map-gen nature resource (belongs to no guild)</div></div></div>
      <div class="d-section"><h3>Guilds that interact with it</h3><div class="d-tags">${n.guilds.map(guildTag).join("")}</div></div>`);
  }

  // ═══════════════════════════════════ GUILD DETAIL ═════════════════════════
  // A single guild in full: emblem, its tag-group (functional category) chips, an
  // identity blurb, the auto-derived scoring ENGINES (the payoff buildings the rest
  // of the guild feeds — e.g. Marketplace ← Stalls, often buried at the bottom of
  // the compare view as "not shared"), then one section per tag group listing the
  // guild's buildings that carry it + heirlooms that synergise. Rendered on the
  // detail layer so it stacks above the selector or the appendix.
  const uChip = (action, key, name, sprite) =>
    `<span class="u" data-action="${action}" data-key="${esc(key)}">${sprite ? iconImg(sprite) : placeholder(name)}${esc(name)}</span>`;
  const bldChip = (b) => uChip("detail-building", b.key, b.name, b.sprite);
  const heirChip = (h) => uChip("detail-heirloom", h.key, h.name, h.sprite);

  // The scoring surfaces a building feeds off — SAME mapping the rest of the app
  // uses, so engines never drift from the main screen. A category counts when the
  // building genuinely SCORES it: a declared target it acts on without a
  // side-effect action (buff/grant/remove/… are effects, not scores — this is why
  // Composter/Grain Silo are not engines) and does not merely confer; PLUS any
  // category a LISTENED event is qualified by (Windmill scores on a Crop
  // transformation — the same listenQualifiers the shared-event sections read).
  function scoringSourceCats(b) {
    const out = new Set();
    for (const it of b.interactions || []) {
      if (it.confers || !catById.has(it.value)) continue;
      if (it.source === "declared" && !it.action) out.add(it.value);
    }
    for (const ev of b.listens || []) {
      const q = (b.listenQualifiers || {})[ev];
      if (q) (q.cats || []).forEach((c) => { if (catById.has(c)) out.add(c); });
    }
    return [...out];
  }
  // A guild's scoring engines: its buildings that score off ≥2 of their own guild's
  // buildings (the payoff pieces the guild feeds), ranked by that feeder count.
  // guild_meta may pin an explicit list via g.engineOverride.
  const ENGINE_MIN_FEEDERS = 2;
  function guildEngines(g) {
    const own = buildingsByGuild.get(g.id) || [];
    const rank = (b) => {
      const cats = scoringSourceCats(b);
      let feeders = 0;
      for (const x of own) if (x.key !== b.key && x.ownedCats.some((c) => cats.includes(c))) feeders++;
      return { key: b.key, name: b.name, cats, feeders };
    };
    if ((g.engineOverride || []).length) {
      return g.engineOverride.map((k) => { const b = buildingByKey.get(k); return b ? rank(b) : { key: k, name: k, cats: [], feeders: 0 }; });
    }
    return own.map(rank).filter((e) => e.feeders >= ENGINE_MIN_FEEDERS)
      .sort((a, b) => (b.feeders - a.feeders) || a.name.localeCompare(b.name));
  }
  // One engine highlight: the payoff building + what it scores off (its scoring
  // categories). No count — the feeder tally drives ranking only; showing "N"
  // reads as ambiguous out of context.
  function engineCard(e) {
    const b = buildingByKey.get(e.key); if (!b) return "";
    const names = (e.cats || []).map((c) => (catById.get(c) || {}).name || c);
    const reason = names.length ? `Scores off ${esc(names.join(", "))} buildings` : "Primary scoring engine";
    return `<div class="engine-card" data-action="detail-building" data-key="${esc(b.key)}"
        style="--rar-color:${rarVar(b.rarity)}" title="${esc(b.name)} — ${esc(b.rarity || "—")}">
      <span class="tile-icon">${b.sprite ? iconImg(b.sprite) : placeholder(b.name)}</span>
      <span class="ec-body"><span class="ec-name">${esc(b.name)}</span><span class="ec-reason">${reason}</span></span>
    </div>`;
  }

  function openGuildDetail(id) {
    const g = guildById.get(id); if (!g || !g.isCore) return;
    const bldgs = buildingsByGuild.get(g.id) || [];
    const heirs = heirloomsByGuild.get(g.id) || [];
    const emblem = g.emblem || g.badge || g.icon;
    const engines = guildEngines(g);

    // Tag groups = the guild's functional categories, ordered by how many of its
    // buildings carry each (its defining surfaces first). The chip row uses the
    // SAME order. A building/heirloom can appear under several groups; we track
    // what's been shown to build the "Other" catch-alls so every piece surfaces.
    const ownerCount = (catId) => bldgs.filter((b) => b.ownedMinors.includes(catId)).length;
    const sortedCats = [...(g.functionalCategories || [])].sort((a, c) =>
      (ownerCount(c) - ownerCount(a)) || ((catById.get(a) || {}).name || "").localeCompare((catById.get(c) || {}).name || ""));
    const shownB = new Set(), shownH = new Set();
    const groups = sortedCats.map((catId) => {
      const owners = bldgs.filter((b) => b.ownedMinors.includes(catId));
      const gHeirs = heirs.filter((h) => (h.affectedCategories || []).includes(catId));
      return { catId, owners, gHeirs, n: owners.length + gHeirs.length };
    }).filter((grp) => grp.n);

    // Each tag group mirrors the main screen's shared-trait section: a full-width
    // coloured header (category name + count, opens the category detail) over the
    // member list.
    const groupHTML = groups.map((grp) => {
      grp.owners.forEach((b) => shownB.add(b.key));
      grp.gHeirs.forEach((h) => shownH.add(h.key));
      const c = catById.get(grp.catId) || {};
      return `<section class="trait-section gd-group">
        <div class="trait-section-head" data-action="nav-cat" data-cat="${esc(grp.catId)}"
          style="--aff-color:${esc(c.color)};--aff-text:${textColorFor(c.color)}">
          <span class="ts-name">${esc(c.name)}</span><span class="ts-count">${grp.n}</span></div>
        <div class="gd-group-body">
          ${grp.owners.length ? `<div class="detail-users">${grp.owners.map(bldChip).join("")}</div>` : ""}
          ${grp.gHeirs.length ? `<div class="gd-heir"><span class="gd-heir-lbl">Heirlooms</span>
            <div class="detail-users">${grp.gHeirs.map(heirChip).join("")}</div></div>` : ""}
        </div>
      </section>`;
    }).join("");

    const otherB = bldgs.filter((b) => !shownB.has(b.key));   // own only the guild major (no functional cat)
    const otherH = heirs.filter((h) => !shownH.has(h.key));
    const otherHTML =
      (otherB.length ? `<div class="d-section"><h3>Other ${esc(g.name)} buildings</h3>
        <div class="detail-users">${otherB.map(bldChip).join("")}</div></div>` : "") +
      (otherH.length ? `<div class="d-section"><h3>Other heirlooms reaching ${esc(g.name)}</h3>
        <div class="detail-users">${otherH.map(heirChip).join("")}</div></div>` : "");

    renderDetail(esc(g.name), `
      <div class="detail-hero guild-hero" style="--g-color:${esc(g.color)}">
        <span class="guild-emblem">${emblem ? iconImg(emblem) : placeholder(g.name)}</span>
        <div class="d-meta"><h2>${esc(g.name)}</h2>
          <div class="c-theme">Guild · ${bldgs.length} buildings · ${heirs.length} heirlooms</div>
          <div class="trait-list gd-chips">${sortedCats.map((c) => traitBanner(c, true)).join("")}</div>
        </div></div>
      ${g.blurb ? `<div class="d-desc gd-blurb">${esc(g.blurb)}</div>` : ""}
      ${engines.length ? `<div class="d-section"><h3>Scoring engines — the payoff buildings the guild feeds</h3>
        <div class="engine-grid">${engines.map(engineCard).join("")}</div></div>` : ""}
      ${groupHTML || `<p class="empty-note">No functional tag groups.</p>`}
      ${otherHTML}`);
  }

  // ═══════════════════════════════════ APPENDIX (SEARCH) ═════════════════════
  // A searchable list of every detail page. Sits on its own layer BELOW the
  // detail overlay, so opening a result stacks the detail page above and the
  // appendix stays behind. The search box is intentionally NOT auto-focused.
  //
  // Flat, name-sorted corpus of every navigable page. `action`/`attr` mirror the
  // data-action + data-* used on the main page, so a row opens the SAME detail
  // overlay a click would. Built lazily on first open (needs esc/guildById, which
  // are declared above by the time openAppendix can fire).
  let _apxIndex = null;
  function appendixIndex() {
    if (_apxIndex) return _apxIndex;
    _apxIndex = [
      ...(DATA.guilds || []).filter((g) => g.isCore).map((g) => ({
        q: g.name, name: g.name, sub: "Guild", sprite: g.badge || g.icon,
        action: "guild-detail", attr: `data-id="${esc(g.id)}"` })),
      ...(DATA.buildings || []).map((b) => ({
        q: b.name, name: b.name, sub: `Building · ${(guildById.get(b.guild) || {}).name || b.guild}`,
        sprite: b.sprite, action: "detail-building", attr: `data-key="${esc(b.key)}"` })),
      ...(DATA.neutralBuildings || []).map((n) => ({
        q: n.name, name: n.name, sub: "Neutral building · unowned", sprite: n.sprite,
        action: "detail-building", attr: `data-key="${esc(n.key)}"` })),
      ...(DATA.heirlooms || []).map((h) => ({
        q: h.name, name: h.name, sub: "Heirloom", sprite: h.sprite,
        action: "detail-heirloom", attr: `data-key="${esc(h.key)}"` })),
      ...(DATA.counselors || []).map((c) => ({
        q: c.name, name: c.name, sub: "Counselor", sprite: c.sprite,
        action: "detail-counselor", attr: `data-name="${esc(c.name)}"` })),
      ...(DATA.categories || []).map((c) => ({
        q: c.name, name: c.name, sub: "Category / trait", action: "nav-cat", attr: `data-cat="${esc(c.id)}"` })),
      ...(DATA.events || []).map((e) => ({
        q: e.name, name: e.name, sub: "Event", action: "detail-event", attr: `data-id="${esc(e.id)}"` })),
      ...(DATA.natureResources || []).map((n) => ({
        q: n.name, name: n.name, sub: "Nature node", sprite: n.sprite,
        action: "detail-nature", attr: `data-key="${esc(n.key)}"` })),
    ].filter((it) => it.name).sort((x, y) => x.name.localeCompare(y.name));
    return _apxIndex;
  }
  function appendixRowsHTML(items) {
    if (!items.length) return `<p class="empty-note">No matches.</p>`;
    return items.map((it) => `<div class="apx-row" data-action="${it.action}" ${it.attr}>
      <span class="apx-icon">${it.sprite ? iconImg(it.sprite) : placeholder(it.name)}</span>
      <span class="apx-text"><span class="apx-name">${esc(it.name)}</span><span class="apx-sub">${esc(it.sub)}</span></span>
    </div>`).join("");
  }
  function openAppendix() {
    const root = document.getElementById("appendix-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header"><h2>Appendix</h2>
          <button class="overlay-close" data-action="close-appendix" aria-label="Close">&times;</button></div>
        <div class="overlay-body apx-body">
          <input type="search" class="apx-search" placeholder="Search buildings, heirlooms, traits, events…" aria-label="Search appendix">
          <div class="ovl-scroll apx-list">${appendixRowsHTML(appendixIndex())}</div>
        </div>
        <div class="overlay-footer"><button data-action="close-appendix">Close</button></div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
    const inp = root.querySelector(".apx-search");
    inp.addEventListener("input", () => {
      const q = inp.value.trim().toLowerCase();
      const idx = appendixIndex();
      const list = q ? idx.filter((it) => it.q.toLowerCase().includes(q)) : idx;
      root.querySelector(".apx-list").innerHTML = appendixRowsHTML(list);
    });
    // Deliberately do NOT focus the input (per house preference).
  }
  function closeAppendix() {
    const root = document.getElementById("appendix-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
  }
  function onAppendixClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) { if (e.target.id === "appendix-root") closeAppendix(); return; }
    // Appendix is a GLOBAL search — details opened from it span all guilds, not
    // the active pair. Each result starts a FRESH detail trail (reset).
    state.detailGlobal = true;
    if (el.dataset.action === "close-appendix") return closeAppendix();
    const t = detailTarget(el);
    if (t) showDetail(t.kind, t.id, true);   // result opens above; appendix stays open
  }

  // ═══════════════════════════════════ DRAW ODDS ═════════════════════════════
  // A single blueprint draw is a weighted pick from the draftable pool. Per-building
  // weight = baseRarityWeight × milestoneMultiplier (both code-certain, emitted in
  // DATA.drawModel; see build-data.mjs + _cl_extract SUBSYSTEMS.md §3). So a
  // building's draw chance is its weight / the pool's total weight — and it shifts
  // by milestone because the multiplier thins commons and fattens rares as the city
  // grows. The pool = both selected guilds' buildings + Infrastructure neutrals.
  const DRAW = DATA.drawModel || { baseWeights: {}, slopes: {}, milestones: [] };
  const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Masterwork"];
  const msByIndex = (i) => DRAW.milestones.find((m) => m.index === i) || DRAW.milestones[0] || { index: 1, v: 0, citySize: "Start", scoreRequired: 0 };
  const rarityMult = (rarity, v) => 1 + (DRAW.slopes[rarity] ?? 0) * v;
  const weightOf = (rarity, v) => (DRAW.baseWeights[rarity] ?? 0) * rarityMult(rarity, v);
  const fmtPct = (p) => { const x = p * 100; return (x >= 1 ? x.toFixed(1) : x >= 0.01 ? x.toFixed(2) : x > 0 ? x.toFixed(3) : "0") + "%"; };
  const prettyCity = (s) => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");

  // Draftable pool for the current pair. Only rarities with a base weight can be
  // drafted (null-rarity stubs are skipped). Infrastructure neutrals are always in
  // the selected category set in-game, so they're included unless toggled off.
  function drawPool() {
    const [a, b] = state.pair;
    if (!a || !b) return [];
    const seen = new Set(), pool = [];
    const add = (bld) => {
      if (!bld || seen.has(bld.key)) return;
      if (!bld.rarity || (DRAW.baseWeights[bld.rarity] ?? 0) <= 0) return;
      seen.add(bld.key); pool.push(bld);
    };
    for (const g of [a, b]) (buildingsByGuild.get(g) || []).forEach(add);
    if (state.do.infra) (DATA.neutralBuildings || []).forEach((n) => {
      if ((n.ownedCats || []).includes("Infrastructure")) add(n);
    });
    return pool;
  }
  // Normalised draw probabilities at one milestone: p(b) = weight(b) / Σ weight.
  function oddsAt(pool, msIndex) {
    const v = msByIndex(msIndex).v;
    const w = new Map(); let sum = 0;
    for (const bld of pool) { const x = weightOf(bld.rarity, v); w.set(bld.key, x); sum += x; }
    const p = new Map();
    for (const [k, x] of w) p.set(k, sum > 0 ? x / sum : 0);
    return { v, sum, p };
  }

  // A compact 10-bar trend sparkline (heights normalised to `maxP` so bars are
  // comparable across the whole list); the current-milestone bar is highlighted.
  function sparkBars(range, maxP) {
    return `<span class="do-spark" aria-hidden="true">${range.map((r) => {
      const h = maxP > 0 ? Math.max(6, Math.round(r.p / maxP * 100)) : 0;
      return `<span class="do-bar${state.do.ms === r.index ? " cur" : ""}" style="height:${h}%"
        title="M${r.index} ${esc(prettyCity(r.citySize))}: ${fmtPct(r.p)}"></span>`;
    }).join("")}</span>`;
  }
  // Full-range chart for the focused building (bars normalised to its own peak so
  // the trajectory reads clearly); each column is clickable to jump the slider.
  function bigChart(range) {
    const maxP = Math.max(...range.map((r) => r.p), 1e-9);
    return `<div class="do-chart">${range.map((r) => {
      const h = Math.max(3, Math.round(r.p / maxP * 100));
      return `<div class="do-col${state.do.ms === r.index ? " cur" : ""}" data-do-ms="${r.index}"
        title="Milestone ${r.index} — ${esc(prettyCity(r.citySize))}">
        <span class="do-col-val">${fmtPct(r.p)}</span>
        <span class="do-col-bar" style="height:${h}%"></span>
        <span class="do-col-x">${r.index}</span></div>`;
    }).join("")}</div>`;
  }

  function renderDrawOddsMsLabel() {
    const root = document.getElementById("drawodds-root"); if (!root) return;
    const el = root.querySelector(".do-ms-label"); if (!el) return;
    const m = msByIndex(state.do.ms);
    const mults = RARITY_ORDER.map((r) =>
      `<span class="do-mchip" style="--rar-color:${rarVar(r)}" title="${esc(r)} weight ×${rarityMult(r, m.v).toFixed(2)}">${r[0]}×${rarityMult(r, m.v).toFixed(2)}</span>`).join("");
    el.innerHTML = `<span class="do-ms-name">M${m.index} · ${esc(prettyCity(m.citySize))}</span>
      <span class="do-ms-score">${m.scoreRequired ? m.scoreRequired.toLocaleString() + " pts" : ""}</span>
      <span class="do-mults">${mults}</span>`;
  }

  function renderDrawOddsBody() {
    const root = document.getElementById("drawodds-root"); if (!root) return;
    const scroll = root.querySelector(".do-scroll"); if (!scroll) return;
    const [a, b] = state.pair;
    if (!a || !b) {
      scroll.innerHTML = `<p class="empty-note">Pick two guilds on the main screen to see blueprint draw odds for their pool.</p>`;
      return;
    }
    const pool = drawPool();
    if (!pool.length) { scroll.innerHTML = `<p class="empty-note">No draftable buildings in this pool.</p>`; return; }
    const allOdds = DRAW.milestones.map((m) => ({ m, o: oddsAt(pool, m.index) }));
    const cur = (allOdds.find((x) => x.m.index === state.do.ms) || allOdds[0]).o;
    const rangeOf = (key) => allOdds.map((x) => ({ index: x.m.index, citySize: x.m.citySize, p: x.o.p.get(key) || 0 }));
    let gmax = 0; for (const { o } of allOdds) for (const v of o.p.values()) if (v > gmax) gmax = v;

    // Focused-building full-range panel.
    let pickedHTML = "";
    if (state.do.pick && pool.some((x) => x.key === state.do.pick)) {
      const bld = buildingByKey.get(state.do.pick);
      const g = guildById.get(bld.guild);
      pickedHTML = `<div class="do-picked" style="--rar-color:${rarVar(bld.rarity)}">
        <div class="do-picked-head">
          <span class="do-icon lg">${bld.sprite ? iconImg(bld.sprite) : placeholder(bld.name)}</span>
          <div class="do-picked-id"><span class="do-picked-name">${esc(bld.name)}</span>
            <span class="do-meta">${esc(bld.rarity)} · ${esc(g?.name || bld.guild)} — draw chance every milestone</span></div>
          <button class="ghost do-clear" data-action="do-clear-pick" title="Clear focus">&times;</button>
        </div>
        ${bigChart(rangeOf(bld.key))}
      </div>`;
    }

    // Rarity roll-up: chance the next card is of each rarity = Σ p over that tier.
    const agg = {}, counts = {};
    for (const bld of pool) { agg[bld.rarity] = (agg[bld.rarity] || 0) + (cur.p.get(bld.key) || 0); counts[bld.rarity] = (counts[bld.rarity] || 0) + 1; }
    const summaryHTML = `<div class="do-summary">
      <div class="do-sum-head">Next card rarity <span class="do-dim">· pool of ${pool.length}</span></div>
      ${RARITY_ORDER.filter((r) => counts[r]).map((r) => `
        <div class="do-sum-row" style="--rar-color:${rarVar(r)}">
          <span class="do-sum-lbl">${r} <span class="do-dim">×${counts[r]}</span></span>
          <span class="do-sum-track"><span class="do-sum-fill" style="width:${((agg[r] || 0) * 100).toFixed(1)}%"></span></span>
          <span class="do-sum-pct">${fmtPct(agg[r] || 0)}</span></div>`).join("")}
    </div>`;

    // Per-building list, sorted by chance at the current milestone.
    const rows = pool.slice().sort((x, y) => (cur.p.get(y.key) - cur.p.get(x.key)) || x.name.localeCompare(y.name));
    const listHTML = `<div class="do-list-head">Every draftable building — chance at <b>M${state.do.ms}</b> <span class="do-dim">· tap a row to chart it</span></div>
      <div class="do-list">${rows.map((bld) => {
        const g = guildById.get(bld.guild);
        return `<div class="do-row${state.do.pick === bld.key ? " sel" : ""}" data-do-pick="${esc(bld.key)}"
          style="--g-color:${esc(g?.color || "#8a8a8a")};--rar-color:${rarVar(bld.rarity)}">
          <span class="do-icon" data-action="detail-building" data-key="${esc(bld.key)}" title="Open ${esc(bld.name)}">${bld.sprite ? iconImg(bld.sprite) : placeholder(bld.name)}</span>
          <span class="do-info"><span class="do-name">${esc(bld.name)}</span>
            <span class="do-meta">${esc(bld.rarity)} · ${esc(g?.name || bld.guild)}</span></span>
          ${sparkBars(rangeOf(bld.key), gmax)}
          <span class="do-p">${fmtPct(cur.p.get(bld.key) || 0)}</span>
        </div>`;
      }).join("")}</div>`;

    scroll.innerHTML = pickedHTML + summaryHTML + listHTML + `<p class="do-note">${esc(DRAW.notes || "")}</p>`;
  }

  function openDrawOdds() {
    const root = document.getElementById("drawodds-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header"><h2>🎲 Draw Odds</h2>
          <button class="overlay-close" data-action="close-drawodds" aria-label="Close">&times;</button></div>
        <div class="do-controls">
          <div class="do-slider-wrap">
            <input type="range" min="1" max="10" step="1" value="${state.do.ms}" class="do-slider" aria-label="Milestone">
            <div class="do-ms-label"></div>
          </div>
          <label class="do-toggle"><input type="checkbox" class="do-infra"${state.do.infra ? " checked" : ""}> Infrastructure cards</label>
        </div>
        <div class="ovl-scroll do-scroll"></div>
        <div class="overlay-footer"><button data-action="close-drawodds">Close</button></div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
    const slider = root.querySelector(".do-slider");
    slider.addEventListener("input", () => { state.do.ms = Number(slider.value); renderDrawOddsMsLabel(); renderDrawOddsBody(); });
    root.querySelector(".do-infra").addEventListener("change", (ev) => { state.do.infra = ev.target.checked; renderDrawOddsBody(); });
    renderDrawOddsMsLabel(); renderDrawOddsBody();
  }
  function closeDrawOdds() {
    const root = document.getElementById("drawodds-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
  }
  function onDrawOddsClick(e) {
    const act = e.target.closest("[data-action]");
    if (act) {
      if (act.dataset.action === "close-drawodds") return closeDrawOdds();
      if (act.dataset.action === "do-clear-pick") { state.do.pick = null; return renderDrawOddsBody(); }
      const t = detailTarget(act);                          // e.g. an icon → building detail (opens above)
      if (t) { state.detailGlobal = true; return showDetail(t.kind, t.id, true); }
      return;
    }
    const col = e.target.closest("[data-do-ms]");           // clicking a chart column jumps the slider
    if (col) {
      state.do.ms = Number(col.dataset.doMs);
      const s = document.querySelector("#drawodds-root .do-slider"); if (s) s.value = state.do.ms;
      renderDrawOddsMsLabel(); return renderDrawOddsBody();
    }
    const row = e.target.closest("[data-do-pick]");         // tap a row to focus/unfocus it
    if (row) { const k = row.dataset.doPick; state.do.pick = state.do.pick === k ? null : k; return renderDrawOddsBody(); }
    if (e.target.id === "drawodds-root") return closeDrawOdds();
  }

  // ═══════════════════════════════════ EVENT DELEGATION ══════════════════════
  function onAppClick(e) {
    const el = e.target.closest("[data-action]"); if (!el) return;
    // Details opened from the main page are scoped to the active pair and start a
    // fresh detail trail (reset).
    state.detailGlobal = false;
    const t = detailTarget(el);
    if (t) return showDetail(t.kind, t.id, true);
    switch (el.dataset.action) {
      case "open-guild": openGuildSelector(Number(el.dataset.side)); break;
      case "clear": state.pair = [null, null]; persist(); renderApp(); break;
      case "appendix": openAppendix(); break;
      case "drawodds": openDrawOdds(); break;
      case "toggle-section": toggleSection(el.dataset.sid); break;
    }
  }
  // Toggle stores an explicit state ("id"=collapsed, "!id"=expanded) so a click
  // overrides the section's default. Re-render preserves compare-main scrollTop.
  function toggleSection(sid) {
    const isCollapsed = document.querySelector(`[data-sid="${CSS.escape(sid)}"]`)?.closest(".section")?.classList.contains("collapsed");
    state.collapsed.delete(sid); state.collapsed.delete("!" + sid);
    state.collapsed.add(isCollapsed ? "!" + sid : sid);
    renderApp();
  }

  function onOverlayClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) { if (e.target.id === "overlay-root") closeSelector(false); return; }
    switch (el.dataset.action) {
      case "guild-detail":
        // Details opened from the selector span all guilds (not the active pair),
        // matching appendix scope; stacks on the detail layer above the selector.
        state.detailGlobal = true; showDetail("guild", el.dataset.id, true); break;
      case "pick-guild":
        state.ovl.pending = state.ovl.pending === el.dataset.id ? null : el.dataset.id;
        refreshSelector(); break;
      case "unset": state.ovl.pending = null; closeSelector(true); break;
      case "cancel": closeSelector(false); break;
      case "confirm": closeSelector(true); break;
    }
  }
  function onDetailClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) { if (e.target.id === "detail-overlay-root") hideDetailOverlay(); return; }  // backdrop = dismiss all
    if (el.dataset.action === "back-detail") return backDetail();                          // ✕ / footer = back one page
    // cross-navigation between detail pages PUSHES onto the trail (no reset).
    const t = detailTarget(el);
    if (t) showDetail(t.kind, t.id, false);
  }
  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (!document.getElementById("detail-overlay-root").classList.contains("hidden")) return hideDetailOverlay();
    if (!document.getElementById("appendix-root").classList.contains("hidden")) return closeAppendix();
    if (!document.getElementById("drawodds-root").classList.contains("hidden")) return closeDrawOdds();
    if (state.ovl) closeSelector(false);
  }

  // ── init ──
  document.getElementById("app").addEventListener("click", onAppClick);
  document.getElementById("overlay-root").addEventListener("click", onOverlayClick);
  document.getElementById("appendix-root").addEventListener("click", onAppendixClick);
  document.getElementById("drawodds-root").addEventListener("click", onDrawOddsClick);
  document.getElementById("detail-overlay-root").addEventListener("click", onDetailClick);
  document.addEventListener("keydown", onKeydown);
  renderApp();
})();
