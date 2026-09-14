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
  const guildTag = (id) => {
    const g = guildById.get(id);
    return g ? `<span class="gtag" style="--g-color:${esc(g.color)}">${esc(g.name)}</span>` : esc(id);
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
    const nm = `<b>${esc(interValName(it))}</b>`;
    const isCat = /Category$/.test(it.kind);
    const noun = isCat ? `${nm} buildings` : nm;
    const s = it.snippet || "";

    if (it.source === "declared") {
      const bonus = it.score ? ` <span class="i-bonus">+${it.score}</span>` : "";
      if (it.kind === "targetRarity") return `Wants ${nm}-rarity pieces nearby${bonus}`;
      if (isCat) return `Wants any ${nm} building nearby${bonus}`;
      return `Wants ${nm} nearby${bonus}`;
    }
    // effect-sourced — infer the verb from the decompiled snippet
    if (/TransformBuildingInto/.test(s))                       return `Can turn a tile into ${nm}`;
    if (/InstantiateAndBuild(?:NatureResource|Building)?At/.test(s)) return `Spawns ${nm} on a nearby tile`;
    if (/AddConsumable/.test(s))                               return `Grants a ${nm} consumable`;
    if (/GetItemWithTagEquipped|ItemHeirloomController/.test(s)) return `Scales with your equipped ${nm} heirloom(s)`;
    if (/ScoreSpecialResource/.test(s))                        return `Scores the ${nm} special resource`;
    if (/RemoveResourceIfPossible/.test(s))                    return `Consumes ${nm}`;
    if (/CurrentTagCount/.test(s))                             return `Counts how many ${nm} you own`;
    if (/GetCountOfBuildings|GetBuildingsOf(?:Type|Category)Adjacent/.test(s)) return `Counts adjacent ${noun}`;
    if (/HasAnyBuildingOf(?:Type|Category)Adjacent/.test(s))   return `Activates when a ${nm} is adjacent`;
    if (/IrrigateAdjacent/.test(s))                            return `Irrigates adjacent ${noun}`;
    if (/AddLocalStatChange/.test(s))                          return `Buffs adjacent ${noun}`;
    if (/PaintTag/.test(s))                                    return `Reacts to ${nm}-painted buildings`;
    if (/GetScoreForTag|^\s*\},\s*Game(?:Tag|PieceCategory)\./.test(s)) return `Scores adjacent ${noun}`;
    if (/^\s*GameTag\.\w+,?\s*$/.test(s))                      return `Works together with ${nm}`;
    if (/\.Tag\s*[!=]=|\btag\s*==\s*GameTag|otherBuilding\.Tag|ContainsCategory|Categories\.Contains/.test(s))
      return `Checks nearby tiles for ${noun}`;
    return `Interacts with ${noun}`;
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
        ${g.badge ? `<img class="banner-badge" src="${esc(g.badge)}" alt="" onerror="this.style.visibility='hidden'">` : ""}
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
  const targetsCat = (b, cat) => (b.interactions || []).some((it) => it.value === cat);
  const isOverlap = (b, other) => buildingReasons(b, other).length > 0;

  // A shared owned category is only a REAL association if at least one building
  // (in either guild) actually interacts with that surface. Two guilds both
  // OWNING a category but with nothing that targets it is not an interaction —
  // it's a coincidental shared label, so it must not count as an overlap tag.
  function catHasInteractor(cat, g1, g2) {
    for (const g of [g1, g2]) for (const bld of buildingsByGuild.get(g.id) || [])
      if (targetsCat(bld, cat)) return true;
    return false;
  }
  const validSharedCats = (a, b) =>
    sharedFunctionalCats(a, b).filter((c) => catHasInteractor(c, a, b));

  // Buildings from BOTH guilds that OWN or TARGET a shared category — the members
  // of that trait's overlap section (e.g. crop buildings + buildings that score off crops).
  function overlapBuildingsForCat(cat, a, b) {
    const out = [];
    for (const g of [a, b]) for (const bld of buildingsByGuild.get(g.id) || []) {
      const owns = ownsCat(bld, cat), targets = targetsCat(bld, cat);
      if (owns || targets) out.push({ bld, owns, targets });
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
    const neutralBlock = block("Shared neutral buildings — unowned map structures", sharedNeutral.length
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

    return title + tagIndex + overlapBlock + eventBlock + natureBlock + neutralBlock + councilBlock + heirBlock + `<div class="rest-wrap">${remaining}</div>`;
  }

  // A shared-trait section: the trait banner is the header; tiles are the member
  // buildings (from either guild) that own or target the trait.
  function traitSectionHTML(cat, members) {
    const c = catById.get(cat); if (!c) return "";
    const tiles = members.map((m) => overlapTile(m.bld, m.owns, m.targets)).join("");
    return `<section class="trait-section">
      <div class="trait-section-head" data-action="nav-cat" data-cat="${esc(cat)}"
        style="--aff-color:${esc(c.color)};--aff-text:${textColorFor(c.color)}">
        <span class="ts-name">${esc(c.name)}</span><span class="ts-count">${members.length}</span></div>
      <div class="tile-grid">${tiles}</div></section>`;
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
  function overlapTile(b, owns, targets) {
    const rs = [];
    if (owns) rs.push({ k: "cat", g: "▤", t: `${b.guild} building carrying this trait` });
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
    const tiles = members.map((m) => eventTile(m.bld, m.emits, m.listens, m.qualifier)).join("");
    return `<section class="trait-section event-section">
      <div class="trait-section-head" data-action="detail-event" data-id="${esc(ev)}"
        style="--aff-color:var(--accent);--aff-text:#fff" title="${esc(e.note || "")}">
        <span class="ts-name">${esc(e.name)}</span><span class="ts-count">${members.length}</span></div>
      <div class="tile-grid">${tiles}</div></section>`;
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
  function renderDetail(title, bodyHTML) {
    const root = document.getElementById("detail-overlay-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header"><h2>${title}</h2>
          <button class="overlay-close" data-action="close-detail" aria-label="Close">&times;</button></div>
        <div class="overlay-body"><div class="ovl-scroll detail-main">${bodyHTML}</div></div>
        <div class="overlay-footer"><button data-action="close-detail">Close</button></div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    const root = document.getElementById("detail-overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
  }

  function openBuildingDetail(key) {
    const b = buildingByKey.get(key); if (!b) return;
    const g = guildById.get(b.guild) || {};
    const isNeutral = b.guild === "Neutral";
    // Neutral buildings are owned by no guild — don't lead the trait list with a
    // "Neutral" major; show just the functional minors it actually carries.
    const owned = isNeutral ? b.ownedMinors : [b.guild, ...b.ownedMinors];
    const inter = (b.interactions || []).filter((it) => it.guilds.length);
    const interHTML = inter.length ? `<div class="inter-list">${inter.map((it) => `
      <div class="inter">
        <div class="i-head">
          <span class="i-desc"${it.snippet ? ` title="${esc(it.snippet)}"` : ""}>${describeInteraction(it)}</span>
          <span class="i-guilds">${it.guilds.map(guildTag).join("")}</span>
        </div>
      </div>`).join("")}</div>` : `<p class="empty-note">No declared cross-piece targets (scores via owned traits / universal modifiers).</p>`;

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
          <div class="d-tags">${isNeutral ? `<span class="pill neutral-pill">Neutral · unowned</span>` : guildTag(b.guild)}<span class="pill rarity" style="color:var(--rar-${rarLower(b.rarity)})">${esc(b.rarity || "—")}</span></div>
        </div></div>
      ${b.descHTML ? `<div class="d-desc">${b.descHTML}</div>` : ""}
      <div class="d-section"><h3>Owned categories — its targetable surface</h3>
        <div class="trait-list">${owned.map((c) => traitBanner(c)).join("")}</div></div>
      ${isNeutral && (b.reachesGuilds || []).length ? `<div class="d-section"><h3>Guilds that interact with it</h3>
        <div class="d-tags">${b.reachesGuilds.map(guildTag).join("")}</div></div>` : ""}
      <div class="d-section"><h3>Interacts with</h3>${interHTML}</div>
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
      ${h.targetCategories.length ? `<div class="d-section"><h3>Targets categories</h3>
        <div class="trait-list">${h.targetCategories.map((c) => traitBanner(c)).join("")}</div></div>` : ""}
      ${h.reachesGuilds.length ? `<div class="d-section"><h3>Reaches guilds</h3>
        <div class="d-tags">${h.reachesGuilds.map(guildTag).join("")}</div></div>` : ""}
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

  // Category detail: which guilds share it, and (if a pair is active) which
  // buildings in each selected guild OWN or TARGET it.
  function openCategoryDetail(id) {
    const c = catById.get(id); if (!c) return;
    const [a, b] = state.pair.map((x) => (x ? guildById.get(x) : null));
    const usersFor = (g) => {
      if (!g) return "";
      const owners = (buildingsByGuild.get(g.id) || []).filter((x) => x.ownedMinors.includes(id) || x.guild === id);
      const targeters = (buildingsByGuild.get(g.id) || []).filter((x) => (x.interactions || []).some((it) => it.value === id));
      const list = (arr) => arr.length ? `<div class="detail-users">${arr.map((x) => `<span class="u" data-action="detail-building" data-key="${esc(x.key)}">${x.sprite ? iconImg(x.sprite) : ""}${esc(x.name)}</span>`).join("")}</div>` : `<p class="empty-note">None.</p>`;
      return `<div class="d-section"><h3>${esc(g.name)} — owns it</h3>${list(owners)}</div>
        <div class="d-section"><h3>${esc(g.name)} — targets it</h3>${list(targeters)}</div>`;
    };
    renderDetail(esc(c.name), `
      <div class="detail-hero"><div class="d-meta">
        <div class="trait-list">${traitBanner(id)}</div>
        <div class="c-theme" style="margin-top:.4rem">${c.kind === "guild" ? "Guild category" : c.kind === "resource" ? "Resource category" : "Functional category"}</div>
      </div></div>
      ${c.guildsSharing.length ? `<div class="d-section"><h3>Guilds carrying this category</h3><div class="d-tags">${c.guildsSharing.map(guildTag).join("")}</div></div>` : ""}
      ${usersFor(a)}${usersFor(b)}`);
  }

  function openEventDetail(id) {
    const ev = eventById.get(id) || { name: id, note: "" };
    const [a, b] = state.pair.map((x) => (x ? guildById.get(x) : null));
    const sideFor = (g) => {
      if (!g) return "";
      const emit = (buildingsByGuild.get(g.id) || []).filter((x) => x.emits.includes(id));
      const listen = (buildingsByGuild.get(g.id) || []).filter((x) => x.listens.includes(id));
      const list = (arr) => arr.length ? `<div class="detail-users">${arr.map((x) => `<span class="u" data-action="detail-building" data-key="${esc(x.key)}">${x.sprite ? iconImg(x.sprite) : ""}${esc(x.name)}</span>`).join("")}</div>` : `<p class="empty-note">None.</p>`;
      return `<div class="d-section"><h3>${esc(g.name)} — ▲ emits</h3>${list(emit)}</div>
        <div class="d-section"><h3>${esc(g.name)} — ▼ listens</h3>${list(listen)}</div>`;
    };
    renderDetail(esc(ev.name), `${ev.note ? `<div class="d-desc">${esc(ev.note)}</div>` : ""}${sideFor(a)}${sideFor(b)}`);
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
    switch (el.dataset.action) {
      case "close-appendix": closeAppendix(); break;
      // A result opens its detail page on the layer above; appendix stays open.
      case "detail-building": openBuildingDetail(el.dataset.key); break;
      case "detail-heirloom": openHeirloomDetail(el.dataset.key); break;
      case "detail-counselor": openCounselorDetail(el.dataset.name); break;
      case "detail-event": openEventDetail(el.dataset.id); break;
      case "detail-nature": openNatureDetail(el.dataset.key); break;
      case "nav-cat": openCategoryDetail(el.dataset.cat); break;
    }
  }

  // ═══════════════════════════════════ EVENT DELEGATION ══════════════════════
  function onAppClick(e) {
    const el = e.target.closest("[data-action]"); if (!el) return;
    switch (el.dataset.action) {
      case "open-guild": openGuildSelector(Number(el.dataset.side)); break;
      case "clear": state.pair = [null, null]; persist(); renderApp(); break;
      case "appendix": openAppendix(); break;
      case "toggle-section": toggleSection(el.dataset.sid); break;
      case "detail-building": openBuildingDetail(el.dataset.key); break;
      case "detail-heirloom": openHeirloomDetail(el.dataset.key); break;
      case "detail-counselor": openCounselorDetail(el.dataset.name); break;
      case "detail-event": openEventDetail(el.dataset.id); break;
      case "detail-nature": openNatureDetail(el.dataset.key); break;
      case "nav-cat": openCategoryDetail(el.dataset.cat); break;
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
    if (!el) { if (e.target.id === "detail-overlay-root") closeDetail(); return; }
    switch (el.dataset.action) {
      case "close-detail": closeDetail(); break;
      // cross-navigation between detail pages (stays on the detail layer)
      case "detail-building": openBuildingDetail(el.dataset.key); break;
      case "detail-heirloom": openHeirloomDetail(el.dataset.key); break;
      case "detail-counselor": openCounselorDetail(el.dataset.name); break;
      case "detail-event": openEventDetail(el.dataset.id); break;
      case "detail-nature": openNatureDetail(el.dataset.key); break;
      case "nav-cat": openCategoryDetail(el.dataset.cat); break;
    }
  }
  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (!document.getElementById("detail-overlay-root").classList.contains("hidden")) return closeDetail();
    if (!document.getElementById("appendix-root").classList.contains("hidden")) return closeAppendix();
    if (state.ovl) closeSelector(false);
  }

  // ── init ──
  document.getElementById("app").addEventListener("click", onAppClick);
  document.getElementById("overlay-root").addEventListener("click", onOverlayClick);
  document.getElementById("appendix-root").addEventListener("click", onAppendixClick);
  document.getElementById("detail-overlay-root").addEventListener("click", onDetailClick);
  document.addEventListener("keydown", onKeydown);
  renderApp();
})();
