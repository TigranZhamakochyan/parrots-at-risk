// visualization2.js: Where are parrots most at risk?
// Dynamic choropleth of BIRDBASE parrot species by biogeographic realm (Tigran Zhamakochyan)
// Rendered into #visualization-2 (call at the bottom of this file). Needs d3 v7, loaded in <head>.

function drawParrotChoropleth(selector, dataPath = "data/") {
  const REALM_NAMES = {
    L: "Neotropical", N: "Nearctic", F: "Afrotropical", M: "Madagascar & islands", P: "Palearctic",
    I: "Indomalayan", W: "Wallacea", A: "Australian", O: "Oceania", Z: "New Zealand & islands",
  };
  // where each realm's value label sits [lon, lat]
  const LABEL_AT = { L: [-60, -12], N: [-100, 48], F: [20, 2], M: [47, -20], P: [85, 52], I: [80, 20],
                     W: [123, -2], A: [134, -25], O: [-160, -14], Z: [172, -42] };
  // small islands that vanish at world scale; drawn as dots in their realm's color
  const ISLANDS = [
    ["O", -172.1, -13.8, "Samoa"], ["O", -149.4, -17.6, "Society Is."], ["O", 158.2, 6.9, "Pohnpei"],
    ["O", -128.3, -24.4, "Henderson I."], ["O", -152.8, -22.6, "Rimatara"], ["O", -175.2, -21.1, "Tonga"],
    ["O", -139.5, -9.0, "Marquesas"], ["O", -159.8, -21.2, "Cook Is."],
    ["M", 57.6, -20.3, "Mauritius"], ["M", 55.5, -21.1, "Réunion"], ["M", 55.5, -4.6, "Seychelles"],
    ["M", 43.3, -11.7, "Comoros"], ["M", 63.4, -19.7, "Rodrigues"],
  ];
  const THREATENED = new Set(["VU", "EN", "CR", "CR (PE)", "CR (PEW)"]);
  const EXTINCT = new Set(["EX", "EW", "CR (PE)", "CR (PEW)"]);
  const ASSESSED = new Set(["LC", "NT", "VU", "EN", "CR", "CR (PE)", "CR (PEW)"]);
  const IUCN = [ // IUCN Red List hues, softened slightly so they sit together on the page
    ["EX", "Extinct", "#2b2a28"], ["EW", "Extinct in the wild", "#6b3a5c"], ["CR", "Critically endangered", "#c8362b"],
    ["EN", "Endangered", "#e7793a"], ["VU", "Vulnerable", "#e8c13a"], ["NT", "Near threatened", "#a8c255"],
    ["LC", "Least concern", "#5a9f68"], ["DD", "Data deficient / not assessed", "#c4c0b6"],
  ];
  const iucnKey = s => !s ? "DD" : s.startsWith("CR") ? "CR" : s;
  const iucnOf = s => IUCN.find(i => i[0] === iucnKey(s)) || IUCN[IUCN.length - 1];
  const MIN_N = 3;

  // perceptually ordered sequential ramps (light -> dark), interpolated in Lab
  const ramp = stops => d3.piecewise(d3.interpolateLab, stops);
  const RISK = ramp(["#fbf1e6", "#f5cfa6", "#eb9a63", "#d4613f", "#a5332c", "#651b22"]);

  // ---- Parameter 1: what the colour shows -------------------------------
  const METRICS = {
    pct_threat: { label: "% of species threatened (VU/EN/CR)", short: "threatened", fmt: v => d3.format(".0f")(v) + "%",
                  denom: s => s.filter(d => ASSESSED.has(d.status)),
                  value: (s, ok) => 100 * ok.filter(d => THREATENED.has(d.status)).length / ok.length,
                  scheme: RISK, fixed: [0, 100] },
    n_threat:   { label: "Number of threatened species", short: "threatened species", fmt: d3.format(".0f"),
                  denom: s => s, value: s => s.filter(d => THREATENED.has(d.status)).length, scheme: RISK },
    n_extinct:  { label: "Extinct or possibly extinct species", short: "extinct", fmt: d3.format(".0f"),
                  denom: s => s, value: s => s.filter(d => EXTINCT.has(d.status)).length,
                  scheme: ramp(["#f2f0eb", "#cfcbc1", "#9a958a", "#625e55", "#2b2925"]) },
    n_species:  { label: "Number of parrot species", short: "species", fmt: d3.format(".0f"),
                  denom: s => s, value: s => s.length,
                  scheme: ramp(["#eef5ec", "#c2dfbb", "#82bb83", "#438d59", "#1d5d3c", "#0f3a27"]) },
    mass:       { label: "Median body mass (g)", short: "median mass", fmt: v => d3.format(".0f")(v) + " g",
                  denom: s => s.filter(d => d.mass != null), value: (s, ok) => d3.median(ok, d => d.mass),
                  scheme: ramp(["#f4f0f9", "#d6cae8", "#aa9acd", "#7b66ae", "#533f89", "#30235a"]) },
    hb:         { label: "Mean habitat breadth (# habitats)", short: "habitats", fmt: d3.format(".1f"),
                  denom: s => s.filter(d => d.hb != null), value: (s, ok) => d3.mean(ok, d => d.hb),
                  scheme: ramp(["#e8f1fc", "#a6c9f3", "#5d9be6", "#2a6fc4", "#1a4f93", "#0d356a"]) },
  };
  // ---- Parameter 2: which parrots are counted ---------------------------
  const GROUPS = {
    all: { label: "All parrots", test: () => true },
    island: { label: "Island-restricted breeders", test: d => d.isl === 1 },
    mainland: { label: "Mainland species", test: d => d.isl === 0 },
    rr: { label: "Restricted range (< 50,000 km²)", test: d => d.rr === 1 },
    wide: { label: "Wide-ranging", test: d => d.rr === 0 },
    forest: { label: "Forest is primary habitat", test: d => d.habitat === "Forest" },
    small: { label: "Small (< 120 g)", test: d => d.mass != null && d.mass < 120 },
    large: { label: "Large (≥ 120 g)", test: d => d.mass != null && d.mass >= 120 },
  };

  const root = d3.select(selector).classed("chor", true).classed("visualization-placeholder", false);
  root.html(`
    <section class="chor-card chor-toolbar" aria-label="Map controls">
      <div class="chor-controls">
        <label class="chor-field"><span>Color realms by</span><select class="chor-metric"></select></label>
        <label class="chor-field"><span>Show</span><select class="chor-group"></select></label>
      </div>
      <div class="chor-stats">
        <div class="chor-stat"><b data-stat="n">–</b><span>species in view</span></div>
        <div class="chor-stat"><b data-stat="thr">–</b><span>threatened (VU–CR)</span></div>
        <div class="chor-stat"><b data-stat="ext">–</b><span>extinct or possibly</span></div>
      </div>
    </section>
    <div class="chor-main">
      <section class="chor-card chor-mapcard">
        <div class="chor-cardhead">
          <div><p class="chor-kicker">World map by biogeographic realm</p><h2 class="chor-h2 chor-maptitle"></h2></div>
          <div class="chor-highest"></div>
        </div>
        <div class="chor-map"></div>
        <div class="chor-legend">
          <div class="chor-scale">
            <div class="chor-scale-title"></div>
            <div class="chor-ramp"></div>
            <div class="chor-ticks"></div>
          </div>
          <span class="chor-keyitem"><svg viewBox="0 0 22 12"><rect width="22" height="12" fill="var(--nodata)"/><rect width="22" height="12" fill="url(#chor-hatch)"/></svg>Fewer than ${MIN_N} species</span>
          <span class="chor-keyitem"><svg viewBox="0 0 22 12"><rect width="22" height="12" fill="var(--land-empty)"/></svg>No parrots</span>
        </div>
      </section>
      <aside class="chor-card chor-panelcard" aria-label="Realm details"><div class="chor-panel"></div></aside>
    </div>
    <section class="chor-card chor-rankcard">
      <div class="chor-cardhead">
        <div><p class="chor-kicker">Ranking</p><h2 class="chor-h2 chor-ranktitle"></h2></div>
      </div>
      <p class="chor-rankdesc">Realms sorted from highest to lowest. Hover a bar to find it on the map, or click to open its details.</p>
      <div class="chor-bars"></div>
    </section>
    <p class="chor-note"></p>
    <div class="chor-tip" hidden></div>`);

  // ---- tooltip ----
  const tip = root.select(".chor-tip");
  const showTip = (ev, html) => {
    if (html != null) tip.html(html);
    tip.attr("hidden", null);
    const n = tip.node(), w = n.offsetWidth, h = n.offsetHeight, pad = 14;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
    tip.style("left", Math.max(8, x) + "px").style("top", Math.max(8, y) + "px");
  };
  const hideTip = () => tip.attr("hidden", true);

  root.select(".chor-metric").selectAll("option").data(Object.entries(METRICS)).join("option")
    .attr("value", d => d[0]).text(d => d[1].label);
  root.select(".chor-group").selectAll("option").data(Object.entries(GROUPS)).join("option")
    .attr("value", d => d[0]).text(d => d[1].label);

  const emptyPanel = () => root.select(".chor-panel").attr("class", "chor-panel").html(`
    <div class="chor-empty-state">
      <div class="chor-glyph"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg></div>
      <h3>Select a realm</h3>
      <p>Click a region on the map or a bar in the ranking to see its parrots and their Red List status.</p>
    </div>`);
  emptyPanel();

  Promise.all([d3.json(dataPath + "parrots.json"), d3.json(dataPath + "realms.geojson")]).then(([parrots, realms]) => {
    let metric = "pct_threat", group = "all", selected = null, hovered = null;
    let st = {}, color = null;
    const T = () => d3.transition().duration(600).ease(d3.easeCubicInOut);

    // ---- map ----
    const mapEl = root.select(".chor-map");
    const W = Math.max(mapEl.node().clientWidth || 760, 320), H = Math.round(W * 0.5);
    const svg = mapEl.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img").attr("aria-label", "World map of parrot conservation metrics by biogeographic realm");
    const defs = svg.append("defs");
    defs.append("pattern").attr("id", "chor-hatch").attr("patternUnits", "userSpaceOnUse")
      .attr("width", 5).attr("height", 5).attr("patternTransform", "rotate(45)")
      .append("line").attr("class", "chor-hatch-line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 5);
    const proj = d3.geoEqualEarth().rotate([-150, 0]).fitExtent([[2, 2], [W - 2, H - 2]], { type: "Sphere" }); // Pacific-centred so Oceania stays whole
    const path = d3.geoPath(proj);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("class", "chor-sphere");
    svg.append("path").datum(d3.geoGraticule10()).attr("d", path).attr("class", "chor-graticule");
    const shapeG = svg.append("g");
    const shapes = shapeG.selectAll("path").data(realms.features).join("path")
      .attr("class", "chor-realm").attr("d", path)
      .classed("chor-empty", el => !REALM_NAMES[el.properties.realm]);
    const hatches = svg.append("g").selectAll("path").data(realms.features.filter(el => REALM_NAMES[el.properties.realm]))
      .join("path").attr("class", "chor-hatch").attr("d", path);
    const dots = svg.append("g").selectAll("circle").data(ISLANDS).join("circle")
      .attr("class", "chor-realm chor-island").attr("r", Math.max(3.5, W / 190))
      .attr("cx", d => proj([d[1], d[2]])[0]).attr("cy", d => proj([d[1], d[2]])[1]);
    const labels = svg.append("g").selectAll("text").data(Object.keys(LABEL_AT)).join("text")
      .attr("class", "chor-label").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("x", k => proj(LABEL_AT[k])[0]).attr("y", k => proj(LABEL_AT[k])[1]);

    const realmOf = el => el.properties ? el.properties.realm : el[0];

    function stats() {
      const sub = parrots.filter(GROUPS[group].test);
      const M = METRICS[metric];
      const out = {};
      for (const k of Object.keys(REALM_NAMES)) {
        const s = sub.filter(d => d.realms.includes(k));
        const ok = M.denom(s);
        out[k] = { k, all: s, n: ok.length, value: ok.length >= MIN_N ? M.value(s, ok) : null };
      }
      return out;
    }

    function update() {
      st = stats();
      const M = METRICS[metric];
      const vals = Object.values(st).map(d => d.value).filter(v => v != null);
      const dom = M.fixed || [0, d3.max(vals) || 1];
      color = d3.scaleSequential(M.scheme).domain([dom[0] - (dom[1] - dom[0]) * 0.08, dom[1]]);
      const fill = el => { const s = st[realmOf(el)]; return s && s.value != null ? color(s.value) : null; };
      const keepFill = function (el) { return fill(el) || this.getAttribute("fill") || "#d8d3c8"; };

      shapes.filter(el => REALM_NAMES[el.properties.realm]).transition(T()).attr("fill", keepFill);
      dots.transition(T()).attr("fill", keepFill);
      shapes.classed("chor-nodata", el => !!REALM_NAMES[realmOf(el)] && st[realmOf(el)].value == null);
      dots.classed("chor-nodata", el => st[realmOf(el)].value == null);
      hatches.classed("on", el => st[realmOf(el)].value == null);

      // value labels count smoothly between states
      labels.transition(T()).tween("text", function (k) {
        const v1 = st[k].value, v0 = this.__v ?? v1, self = d3.select(this);
        this.__v = v1;
        if (v1 == null) return () => self.text("");
        const i = d3.interpolateNumber(v0 ?? v1, v1);
        return t => self.text(M.fmt(i(t)));
      });

      // headings + annotation of the highest realm
      root.select(".chor-maptitle").text(M.label);
      root.select(".chor-ranktitle").text(`Which realms rank highest: ${M.label.charAt(0).toLowerCase() + M.label.slice(1)}`);
      const top = Object.values(st).filter(d => d.value != null).sort((a, b) => b.value - a.value)[0];
      root.select(".chor-highest").html(top
        ? `<i style="background:${color(top.value)}"></i>Highest: <b>${REALM_NAMES[top.k]}</b> ${M.fmt(top.value)} <span class="chor-muted">· n = ${top.n}</span>`
        : "No realm has enough species");

      // summary stats for the current group
      const sub = parrots.filter(GROUPS[group].test);
      root.select('[data-stat="n"]').text(d3.format(",")(sub.length));
      root.select('[data-stat="thr"]').text(d3.format(",")(sub.filter(d => THREATENED.has(d.status)).length));
      root.select('[data-stat="ext"]').text(d3.format(",")(sub.filter(d => EXTINCT.has(d.status)).length));

      // legend
      root.select(".chor-scale-title").text(M.label);
      root.select(".chor-ramp").style("background",
        `linear-gradient(to right, ${d3.range(0, 1.001, 0.1).map(t => color(dom[0] + t * (dom[1] - dom[0]))).join(",")})`);
      const lx = d3.scaleLinear().domain(dom).range([0, 100]);
      root.select(".chor-ticks").selectAll("span").data(lx.ticks(5)).join("span")
        .style("left", t => lx(t) + "%").text(M.fmt);

      drawBars();
      if (selected) drawPanel(st[selected], false);
      paintHighlight();
      root.select(".chor-note").text(
        `Showing: ${GROUPS[group].label.toLowerCase()}. ` +
        (metric === "pct_threat" ? "Percent is out of species with an IUCN assessment (extinct, data-deficient and unassessed species excluded). " : "") +
        `Realms with fewer than ${MIN_N} qualifying species are hatched rather than colored. ` +
        "Species found in two realms are counted in both. Realm borders follow countries and are approximate. Source: BIRDBASE v2025.1 (Şekercioğlu et al.).");
    }

    // ---- ranked bars (linked to map) ----
    const barsEl = root.select(".chor-bars");
    const barSvg = barsEl.append("svg");
    const barPath = (w, h, r) => { // flat at the baseline, rounded at the data end
      if (w <= 0) return "";
      r = Math.min(r, w, h / 2);
      return `M0,0H${w - r}Q${w},0 ${w},${r}V${h - r}Q${w},${h} ${w - r},${h}H0Z`;
    };
    function drawBars() {
      const M = METRICS[metric];
      const data = Object.values(st).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
      const topK = data[0] && data[0].value != null ? data[0].k : null;
      const bw = Math.max(barsEl.node().clientWidth || 760, 300), narrow = bw < 560;
      const rowH = 36, barH = 14, m = { l: narrow ? 150 : 210, r: narrow ? 92 : 150 };
      const x = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).range([0, bw - m.l - m.r]);
      barSvg.attr("viewBox", `0 0 ${bw} ${data.length * rowH}`);

      const row = barSvg.selectAll("g.chor-row").data(data, d => d.k).join(enter => {
        const g = enter.append("g").attr("class", "chor-row").attr("tabindex", 0).attr("role", "button")
          .attr("transform", (d, i) => `translate(0,${i * rowH})`);
        g.append("rect").attr("class", "chor-hit").attr("rx", 8);
        g.append("text").attr("class", "chor-rank").attr("x", 10);
        g.append("text").attr("class", "chor-rname");
        g.append("rect").attr("class", "chor-track").attr("rx", 3);
        g.append("path").attr("class", "chor-bar");
        g.append("text").attr("class", "chor-vtext");
        return g;
      });
      row.attr("aria-label", d => `${REALM_NAMES[d.k]}: ${d.value == null ? "too few species" : M.fmt(d.value)}`)
        .classed("chor-top", d => d.k === topK).classed("chor-selrow", d => d.k === selected)
        .on("mouseenter", (ev, d) => { hovered = d.k; paintHighlight(); })
        .on("mouseleave", () => { hovered = null; paintHighlight(); })
        .on("click", (ev, d) => select(d.k))
        .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(d.k); } });
      row.transition(T()).attr("transform", (d, i) => `translate(0,${i * rowH})`);

      row.select(".chor-hit").attr("x", 0).attr("y", 2).attr("width", bw).attr("height", rowH - 4);
      row.select(".chor-rank").attr("y", rowH / 2).attr("dy", "0.35em").text((d, i) => String(i + 1).padStart(2, "0"));
      row.select(".chor-rname").attr("x", m.l - 12).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
        .text(d => REALM_NAMES[d.k]);
      row.select(".chor-track").attr("x", m.l).attr("y", (rowH - barH) / 2).attr("height", barH)
        .attr("width", x.range()[1]).attr("opacity", .55);
      row.select(".chor-bar").attr("transform", `translate(${m.l},${(rowH - barH) / 2})`)
        .transition(T())
        .attr("d", d => barPath(d.value == null ? 0 : x(d.value), barH, 4))
        .attr("fill", d => d.value == null ? "none" : color(d.value));
      row.select(".chor-vtext").attr("y", rowH / 2).attr("dy", "0.35em")
        .html(d => d.value == null
          ? `<tspan class="chor-n">too few species (n = ${d.n})</tspan>`
          : `<tspan class="chor-val">${M.fmt(d.value)}</tspan><tspan class="chor-n" dx="6">n = ${d.n}</tspan>` +
            (d.k === topK && !narrow ? `<tspan class="chor-tag" dx="10">HIGHEST</tspan>` : ""))
        .transition(T()).attr("x", d => m.l + (d.value == null ? 0 : x(d.value)) + 10);
    }

    function paintHighlight() {
      const k = hovered;
      shapes.classed("chor-dim", el => k && realmOf(el) !== k).classed("chor-hot", el => k && realmOf(el) === k)
        .classed("chor-sel", el => !k && selected && realmOf(el) === selected);
      dots.classed("chor-dim", el => k && realmOf(el) !== k).classed("chor-hot", el => k && realmOf(el) === k);
      labels.classed("chor-dim", d => k && d !== k);
      root.selectAll(".chor-row").classed("chor-dim", d => k && d.k !== k);
      const lift = k || selected;
      if (lift) shapes.filter(function (el) { return realmOf(el) === lift && this.nextSibling; }).raise();
    }

    // ---- detail panel ----
    function drawPanel(s, animate) {
      const panel = root.select(".chor-panel").html("");
      if (animate) { panel.classed("chor-enter", false); panel.node().offsetWidth; panel.classed("chor-enter", true); }
      const head = panel.append("div").attr("class", "chor-phead");
      head.append("div").html(`<p class="chor-kicker">Biogeographic realm</p>`).append("h3").text(REALM_NAMES[s.k]);
      head.append("button").attr("class", "chor-close").attr("aria-label", "Clear selection").text("×")
        .on("click", () => select(null));
      panel.append("div").attr("class", "chor-total")
        .html(`<b>${s.all.length}</b><span>parrot species</span>`);
      panel.append("p").attr("class", "chor-sub").text(GROUPS[group].label);

      // IUCN stacked bar
      const counts = IUCN.map(([c, lab, col]) => ({ c, lab, col, n: s.all.filter(d => iucnKey(d.status) === c).length }));
      const total = d3.sum(counts, d => d.n) || 1;
      panel.append("p").attr("class", "chor-section-title").text("Red List status");
      panel.append("div").attr("class", "chor-stack").attr("role", "img")
        .attr("aria-label", counts.filter(d => d.n).map(d => `${d.lab} ${d.n}`).join(", "))
        .selectAll("div").data(counts.filter(d => d.n)).join("div")
        .style("flex-grow", d => d.n).style("background", d => d.col)
        .on("mousemove", (ev, d) => showTip(ev, `<div class="tt-title">${d.lab}</div>
            <div class="tt-big"><i style="background:${d.col}"></i><b>${d.n}</b><span class="chor-muted">${d3.format(".0%")(d.n / total)} of species</span></div>`))
        .on("mouseleave", hideTip);
      panel.append("ul").attr("class", "chor-keys").selectAll("li").data(counts.filter(d => d.n)).join("li")
        .attr("title", d => d.lab)
        .html(d => `<i style="background:${d.col}"></i><span>${d.c} · ${d.lab}</span><b>${d.n}</b>`);

      // threatened / extinct list, grouped by status (most severe first)
      const order = ["EX", "EW", "CR", "EN", "VU"];
      const risky = s.all.filter(d => order.includes(iucnKey(d.status)))
        .sort((a, b) => order.indexOf(iucnKey(a.status)) - order.indexOf(iucnKey(b.status)));
      panel.append("p").attr("class", "chor-section-title").style("margin-top", "4px")
        .text(`${risky.length} threatened or extinct`);
      if (!risky.length) { panel.append("p").attr("class", "chor-none").text("No threatened or extinct species in this selection."); return; }
      for (const [key, items] of d3.group(risky, d => iucnKey(d.status))) {
        const [, lab, col] = iucnOf(key);
        panel.append("div").attr("class", "chor-group-title")
          .html(`<i style="background:${col}"></i>${lab} <span>${items.length}</span>`);
        panel.append("ul").attr("class", "chor-list").selectAll("li").data(items).join("li").html(d => {
          const meta = [d.latin ? `<em>${d.latin}</em>` : "", d.mass ? d.mass + " g" : "", d.isl ? "island" : "", d.rr ? "small range" : ""]
            .filter(Boolean).join(" · ");
          return `<span class="chor-badge"><i style="background:${iucnOf(d.status)[2]}"></i>${d.status}</span>` +
                 `<span class="chor-name">${d.name}</span><span class="chor-meta">${meta}</span>`;
        });
      }
    }

    function select(k) {
      const changed = k !== selected;
      selected = k;
      hovered = null;
      hideTip();
      update();
      if (!k) emptyPanel();
      else if (changed) drawPanel(st[k], true);
    }

    // ---- events ----
    const tipHtml = (el) => {
      const k = realmOf(el), s = st[k], M = METRICS[metric];
      if (!s) return `<div class="tt-title">No parrots</div>`;
      const thr = s.all.filter(d => THREATENED.has(d.status)).length;
      const assessed = s.all.filter(d => ASSESSED.has(d.status)).length;
      const ext = s.all.filter(d => EXTINCT.has(d.status)).length;
      const big = s.value == null
        ? `<div class="tt-warn">Too few species to compute (n = ${s.n}; at least ${MIN_N} needed)</div>`
        : `<div class="tt-big"><i style="background:${color(s.value)}"></i><b>${M.fmt(s.value)}</b></div><div class="tt-lab">${M.label}</div>`;
      return `<div class="tt-title">${REALM_NAMES[k]}${el.length ? ` <span>· ${el[3]}</span>` : ""}</div>${big}
        <dl>
          <dt>Parrot species</dt><dd>${s.all.length}</dd>
          <dt>Threatened (VU–CR)</dt><dd>${thr}</dd>
          <dt>% of assessed threatened</dt><dd>${assessed ? d3.format(".0f")(100 * thr / assessed) + "%" : "–"}</dd>
          <dt>Extinct or possibly</dt><dd>${ext}</dd>
          ${s.n !== s.all.length ? `<dt>Counted for this metric</dt><dd>${s.n}</dd>` : ""}
        </dl>
        <div class="tt-hint">Click for species details</div>`;
    };
    const enter = (ev, el) => { hovered = realmOf(el); paintHighlight(); showTip(ev, tipHtml(el)); };
    const move = (ev) => showTip(ev);
    const leave = () => { hovered = null; hideTip(); paintHighlight(); };
    shapes.filter(el => REALM_NAMES[el.properties.realm])
      .on("mouseenter", enter).on("mousemove", move).on("mouseleave", leave)
      .on("click", (ev, el) => select(realmOf(el)));
    dots.on("mouseenter", enter).on("mousemove", move).on("mouseleave", leave).on("click", (ev, el) => select(realmOf(el)));
    root.select(".chor-metric").on("change", function () { metric = this.value; update(); });
    root.select(".chor-group").on("change", function () { group = this.value; update(); });
    window.addEventListener("keydown", ev => { if (ev.key === "Escape" && selected) select(null); });

    // keep the ranking chart crisp when the window is resized
    let lastW = barsEl.node().clientWidth;
    new ResizeObserver(() => {
      const w = barsEl.node().clientWidth;
      if (Math.abs(w - lastW) > 8) { lastW = w; drawBars(); paintHighlight(); }
    }).observe(barsEl.node());

    update();
  });
}

drawParrotChoropleth("#visualization-2", "data/");
