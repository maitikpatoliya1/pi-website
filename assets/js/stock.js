/* ============================================================
   Pansuriya Impex — diamond inventory logic
   ============================================================ */
(function () {
  "use strict";

  var DATASETS = {
    natural: Array.isArray(window.PI_STOCK) ? window.PI_STOCK : [],
    fancy: Array.isArray(window.PI_FANCY_STOCK) ? window.PI_FANCY_STOCK : []
  };
  var CHUNK = 60;

  /* ---------- lookups ---------- */
  var SHAPE_ICON = {
    Round: "sh-round", Princess: "sh-princess", Cushion: "sh-cushion",
    Oval: "sh-oval", Emerald: "sh-emerald", Asscher: "sh-emerald", Radiant: "sh-radiant",
    Pear: "sh-pear", Marquise: "sh-marquise", Heart: "sh-heart"
  };
  var FLR = { NONE: "None", FNT: "Faint", MED: "Medium", STG: "Strong", VST: "Very Strong", NON: "None" };
  var ORDER = {
    shape: ["Round", "Princess", "Cushion", "Oval", "Emerald", "Asscher", "Radiant", "Pear", "Marquise", "Heart"],
    col: ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-P", "Q-R", "S-T", "U-V", "W-X", "Y-Z"],
    cla: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"],
    cut: ["EX", "VG", "G", "F", "P"], pol: ["EX", "VG", "G", "F", "P"], sym: ["EX", "VG", "G", "F", "P"],
    flr: ["NONE", "FNT", "MED", "STG", "VST"]
  };

  /* ---------- formatters ---------- */
  function trimNum(n) {
    if (n === null || n === undefined || n === "") return "—";
    var s = (Math.round(n * 100) / 100).toString();
    return s;
  }
  function fmtCarat(n) { return n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "") || "0"; }
  function fmtPct(n) { return n == null ? "—" : trimNum(n) + "%"; }
  function fmtRatio(n) { return n == null ? "—" : n.toFixed(2); }
  function fmtUSD(n) {
    if (n == null) return "—";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtUSD0(n) { return n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"); }
  function flrLabel(v) { return FLR[v] || (v ? v.charAt(0) + v.slice(1).toLowerCase() : "—"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function shapeIcon(s) { return SHAPE_ICON[s] || "sh-round"; }
  function svg(id, cls) { return '<svg class="' + (cls || "ic") + '"><use href="#' + id + '"/></svg>'; }

  /* ---------- media URLs (derived from stone id) ---------- */
  var MEDIA = "https://www.mydiamondinfo.com/media";
  function imgURL(d) { return MEDIA + "/" + d.id + "/" + d.id + ".jpg"; }
  function videoURL(d) { return MEDIA + "/" + d.id + "/" + d.id + ".mp4"; }
  function v360URL(d) { return MEDIA + "/Vision360.html?d=" + d.id; }
  function photoTag(d, cls, loading) {
    return '<img class="' + cls + '" src="' + esc(imgURL(d)) + '" loading="' + (loading || "eager") + '" decoding="async" alt="" onerror="this.style.display=\'none\'" />';
  }

  var CAT_STORE_KEY = "pi-stock-category";
  function validCat(cat) { return cat === "natural" || cat === "fancy" || cat === "lab"; }
  function initialCategory() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get("cat");
    if (validCat(fromUrl)) return fromUrl;
    try {
      var saved = window.localStorage.getItem(CAT_STORE_KEY);
      if (validCat(saved)) return saved;
    } catch (e) {}
    return "natural";
  }
  function rememberCategory(cat) {
    if (!validCat(cat)) return;
    try { window.localStorage.setItem(CAT_STORE_KEY, cat); } catch (e) {}
    if (window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set("cat", cat);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }

  /* ---------- quality flags (shade / milky / eye-clean) ---------- */
  function shadeInfo(d) {
    var t = (d.tinge || "").toUpperCase();
    if (!t || t === "NONE" || t === "NON") return { t: "No shade", c: "ok" };
    return { t: "Shade (" + esc(d.tinge) + ")", c: "warn" };
  }
  function milkyInfo(d) {
    var m = (d.milky || "").toUpperCase();
    if (!m || m === "NONE") return { t: "No milky", c: "ok" };
    if (m === "ML1") return { t: "Light milky", c: "warn" };
    return { t: esc(d.milky) + " milky", c: "warn" };
  }
  function eyeInfo(d) {
    var e = (d.eye || "").toUpperCase();
    if (e === "YES") return { t: "100% Eye clean", c: "ok" };
    if (e === "NO") return { t: "Not eye clean", c: "bad" };
    return { t: "Eye clean —", c: "muted" };
  }
  function lusterInfo(d) {
    var l = (d.luster || "").toUpperCase();
    if (l === "EX") return { t: "Excellent luster", c: "ok" };
    if (!l) return null;
    return { t: esc(d.luster) + " luster", c: "warn" };
  }
  function flagsLine(d) {
    var parts = [shadeInfo(d)];
    var lu = lusterInfo(d); if (lu) parts.push(lu);
    parts.push(eyeInfo(d));
    return parts.map(function (p) { return '<span class="flag ' + p.c + '">' + p.t + "</span>"; }).join('<i class="fdot">·</i>');
  }
  function milkyShort(d) { var m = (d.milky || "").toUpperCase(); if (!m || m === "NONE") return "None"; if (m === "ML1") return "Light"; return esc(d.milky); }
  function fmtPct2(n) { return n == null ? "-" : n.toFixed(2) + "%"; }
  function titleLine(d) {
    return [d.shape, fmtCarat(d.cts) + "ct", d.col, d.cla, d.cut || "—", d.pol, d.sym, flrLabel(d.flr)]
      .filter(function (x) { return x; }).join(" ");
  }
  function lusterInfo(d) {
    var l = (d.luster || "").toUpperCase();
    if (l === "EX") return { t: "Excellent luster", c: "ok" };
    if (l === "VG") return { t: "Very good luster", c: "ok" };
    if (l === "G") return { t: "Good luster", c: "ok" };
    if (l) return { t: esc(d.luster) + " luster", c: "warn" };
    return { t: "Luster —", c: "muted" };
  }

  /* ---------- state ---------- */
  var state = {
    cat: initialCategory(), view: "list", sort: "price-asc", search: "",
    chips: { image: false, video: false, mystock: false },
    f: {
      lab: [], shape: [], col: [], cla: [], cut: [], pol: [], sym: [], flr: [], loc: [], key: [],
      fancyColor: [], fancyIntensity: [], fancyOvertone: [],
      cMin: null, cMax: null, pMin: null, pMax: null, ppcMin: null, ppcMax: null,
      rapMin: null, rapMax: null, ratioMin: null, ratioMax: null, tblMin: null, tblMax: null,
      depthMin: null, depthMax: null, lenMin: null, lenMax: null, widthMin: null, widthMax: null, heightMin: null, heightMax: null
    }
  };
  var filtered = [];
  var shown = 0;
  var filterDraft = null;
  var filterTab = "main";

  /* ---------- elements ---------- */
  var $ = function (s) { return document.querySelector(s); };
  var tbody = $("#tbody");
  var gridView = $("#gridView");
  var tableScroll = $("#tableScroll");
  var invCard = $(".inv-card");
  var tabsNav = $(".tabs");
  var detailView = $("#detailView");
  var resultCount = $("#resultCount");
  var emptyState = $("#emptyState");
  function activeStock() { return DATASETS[state.cat] || []; }
  function emptyFilterState() {
    return {
      lab: [], shape: [], col: [], cla: [], cut: [], pol: [], sym: [], flr: [], loc: [], key: [],
      fancyColor: [], fancyIntensity: [], fancyOvertone: [],
      cMin: null, cMax: null, pMin: null, pMax: null, ppcMin: null, ppcMax: null,
      rapMin: null, rapMax: null, ratioMin: null, ratioMax: null, tblMin: null, tblMax: null,
      depthMin: null, depthMax: null, lenMin: null, lenMax: null, widthMin: null, widthMax: null, heightMin: null, heightMax: null
    };
  }
  function cloneFilter(f) {
    var out = emptyFilterState();
    Object.keys(out).forEach(function (k) {
      if (Array.isArray(out[k])) out[k] = Array.isArray(f[k]) ? f[k].slice() : [];
      else out[k] = f[k] == null ? null : f[k];
    });
    return out;
  }
  function cloneChips(c) {
    return { image: !!c.image, video: !!c.video, mystock: !!c.mystock };
  }

  /* ============================================================
     FILTERING + SORTING
     ============================================================ */
  function measureParts(d) {
    var nums = String(d.meas || "").match(/\d+(?:\.\d+)?/g);
    nums = nums ? nums.map(Number) : [];
    if (nums.length < 2) return { len: null, width: null, height: null };
    var a = nums[0], b = nums[1], h = nums.length > 2 ? nums[2] : null;
    return { len: Math.max(a, b), width: Math.min(a, b), height: h };
  }
  function hasRangeValue(value, min, max) {
    if (min != null && (value == null || value < min)) return false;
    if (max != null && (value == null || value > max)) return false;
    return true;
  }
  function keyTokens(d) {
    return String(d.keys || "")
      .split(",")
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }
  var FANCY_INTENSITY_ORDER = ["Faint", "Very Light", "Light", "Fancy Light", "Fancy", "Fancy Dark", "Fancy Intense", "Fancy Vivid", "Fancy Deep"];
  var FANCY_COLOR_ORDER = ["Yellow", "Pink", "Blue", "Red", "Green", "Purple", "Orange", "Violet", "Grey", "Black", "Brown"];
  var FANCY_OVERTONE_ORDER = ["None", "Yellow", "Yellowish", "Pink", "Pinkish", "Blue", "Blueish", "Red", "Reddish", "Green", "Greenish", "Purple", "Purpleish", "Orange", "Orangish", "Violet", "Violetish", "Grey", "Greyish", "Black", "Blackish", "Brown", "Brownish"];
  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/\b[a-z]/g, function (m) { return m.toUpperCase(); });
  }
  function normalizeFancyHue(s) {
    var v = titleCase(s).replace(/Gray/g, "Grey").replace(/Bluish/g, "Blueish");
    return v;
  }
  function parseFancyColorLabel(label) {
    var raw = String(label || "").split(",")[0].replace(/\s+/g, " ").trim();
    var intensity = "";
    var hue = raw;
    var ordered = FANCY_INTENSITY_ORDER.slice().sort(function (a, b) { return b.length - a.length; });
    ordered.forEach(function (name) {
      if (intensity) return;
      if (raw === name || raw.indexOf(name + " ") === 0) {
        intensity = name;
        hue = raw.slice(name.length).trim();
      }
    });
    var tokens = hue.split(/[\s-]+/).map(normalizeFancyHue).filter(function (token) {
      return FANCY_COLOR_ORDER.indexOf(token.replace(/ish$/, "")) >= 0 ||
        FANCY_COLOR_ORDER.indexOf(token) >= 0 ||
        FANCY_OVERTONE_ORDER.indexOf(token) >= 0;
    });
    var color = "Other";
    for (var i = tokens.length - 1; i >= 0; i--) {
      var base = tokens[i].replace(/ish$/, "");
      if (FANCY_COLOR_ORDER.indexOf(base) >= 0) { color = base; break; }
      if (FANCY_COLOR_ORDER.indexOf(tokens[i]) >= 0) { color = tokens[i]; break; }
    }
    var overtones = tokens.filter(function (token, idx) { return idx < tokens.length - 1; });
    if (!overtones.length) overtones = ["None"];
    return { color: color, intensity: intensity || "Other", overtones: overtones };
  }
  function passes(d) {
    var f = state.f, c = state.chips;
    var m = measureParts(d);
    var fancy = parseFancyColorLabel(d.col);
    if (f.lab.length && f.lab.indexOf(d.lab) < 0) return false;
    if (f.shape.length && f.shape.indexOf(d.shape) < 0) return false;
    if (f.col.length && f.col.indexOf(d.col) < 0) return false;
    if (f.cla.length && f.cla.indexOf(d.cla) < 0) return false;
    if (f.cut.length && f.cut.indexOf(d.cut) < 0) return false;
    if (f.pol.length && f.pol.indexOf(d.pol) < 0) return false;
    if (f.sym.length && f.sym.indexOf(d.sym) < 0) return false;
    if (f.flr.length && f.flr.indexOf(d.flr) < 0) return false;
    if (f.loc.length && f.loc.indexOf(d.loc) < 0) return false;
    if (f.fancyColor.length && f.fancyColor.indexOf(fancy.color) < 0) return false;
    if (f.fancyIntensity.length && f.fancyIntensity.indexOf(fancy.intensity) < 0) return false;
    if (f.fancyOvertone.length && !f.fancyOvertone.some(function (o) { return fancy.overtones.indexOf(o) >= 0; })) return false;
    if (f.key.length) {
      var keys = keyTokens(d);
      if (!f.key.some(function (k) { return keys.indexOf(k) >= 0; })) return false;
    }
    if (!hasRangeValue(d.cts, f.cMin, f.cMax)) return false;
    if (!hasRangeValue(d.total, f.pMin, f.pMax)) return false;
    if (!hasRangeValue(d.ppc, f.ppcMin, f.ppcMax)) return false;
    if (!hasRangeValue(d.rap, f.rapMin, f.rapMax)) return false;
    if (!hasRangeValue(d.ratio, f.ratioMin, f.ratioMax)) return false;
    if (!hasRangeValue(d.tbl, f.tblMin, f.tblMax)) return false;
    if (!hasRangeValue(d.depth, f.depthMin, f.depthMax)) return false;
    if (!hasRangeValue(m.len, f.lenMin, f.lenMax)) return false;
    if (!hasRangeValue(m.width, f.widthMin, f.widthMax)) return false;
    if (!hasRangeValue(m.height, f.heightMin, f.heightMax)) return false;
    if ((c.image || c.video) && !d.media) return false;
    if (c.mystock && d.status !== "Available") return false;
    if (state.search) {
      var q = state.search.toLowerCase();
      if (String(d.rpt).toLowerCase().indexOf(q) < 0 && String(d.id).toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  }

  var SORTS = {
    "price-asc": function (a, b) { return (a.total || 0) - (b.total || 0); },
    "price-desc": function (a, b) { return (b.total || 0) - (a.total || 0); },
    "carat-asc": function (a, b) { return (a.cts || 0) - (b.cts || 0); },
    "carat-desc": function (a, b) { return (b.cts || 0) - (a.cts || 0); },
    "disc-desc": function (a, b) { return (a.dis || 0) - (b.dis || 0); },
    "ppc-asc": function (a, b) { return (a.ppc || 0) - (b.ppc || 0); }
  };

  function applyFilters() {
    filtered = activeStock().filter(passes);
    filtered.sort(SORTS[state.sort] || SORTS["price-asc"]);
    shown = 0;
    resultCount.textContent = filtered.length.toLocaleString("en-US") + " result" + (filtered.length === 1 ? "" : "s");
    gridView.innerHTML = "";
    tbody.innerHTML = "";
    emptyState.hidden = filtered.length > 0;
    renderMore();
    updateFilterBadge();
  }

  /* ============================================================
     RENDER — LIST
     ============================================================ */
  function statusClass(s) { return (s || "").toLowerCase().replace(/[^a-z_]/g, ""); }

  function rowHTML(d, i) {
    var disc = d.dis != null ? (d.dis > 0 ? "+" + d.dis : d.dis) + "%" : "—";
    var discCls = d.dis != null && d.dis <= -30 ? "disc up" : "disc";
    var play = d.media ? '<span class="play">' + svg("ic-play") + "</span>" : "";
    var cert = d.rpt
      ? '<a class="cert-link" href="https://www.gia.edu/report-check?reportno=' + encodeURIComponent(d.rpt) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(d.rpt) + "</a>"
      : "—";
    return (
      '<tr class="drow" data-i="' + i + '">' +
        '<td class="col-check"><div class="cell-check">' +
          '<input type="checkbox" class="row-check" />' +
          '<button class="expand-btn" aria-label="Details">' + svg("ic-chevron") + "</button>" +
        "</div></td>" +
        '<td class="col-media"><div class="media-cell">' + svg(shapeIcon(d.shape), "sh") + photoTag(d, "media-photo", "lazy") + play + "</div></td>" +
        '<td><span class="badge ' + statusClass(d.status) + '">' + esc(d.status || "—") + "</span></td>" +
        "<td>" + esc(d.lab || "—") + "</td>" +
        "<td>" + esc(d.id || "—") + "</td>" +
        '<td><span class="shape-cell">' + svg(shapeIcon(d.shape), "sh") + esc(d.shape) + "</span></td>" +
        '<td class="num">' + fmtCarat(d.cts) + "</td>" +
        "<td>" + esc(d.col || "—") + "</td>" +
        "<td>" + esc(d.cla || "—") + "</td>" +
        "<td>" + esc(d.cut || "—") + "</td>" +
        "<td>" + esc(d.pol || "—") + "</td>" +
        "<td>" + esc(d.sym || "—") + "</td>" +
        "<td>" + flrLabel(d.flr) + "</td>" +
        '<td class="num">' + fmtUSD0(d.rap) + "</td>" +
        '<td class="num"><span class="' + discCls + '">' + disc + "</span></td>" +
        '<td class="num">' + fmtUSD0(d.ppc) + "</td>" +
        '<td class="num col-price"><span class="total">' + fmtUSD(d.total) + "</span></td>" +
        "<td>" + esc(d.loc || "—") + "</td>" +
        '<td class="cert">' + cert + "</td>" +
      "</tr>"
    );
  }

  function detailHTML(d) {
    function kv(k, v) { return '<div class="dd-kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>"; }
    var summary = [d.shape, fmtCarat(d.cts) + "ct", d.col, d.cla, d.cut || "—", d.pol, d.sym, flrLabel(d.flr)]
      .filter(function (x) { return x && x !== "—"; }).join(" ");
    var sh = shadeInfo(d), mk = milkyInfo(d), ey = eyeInfo(d);
    var disc = d.dis != null ? (d.dis > 0 ? "+" + d.dis : d.dis) + "%" : "—";
    var keys = d.keys && d.keys.trim() ? '<p class="dd-keys"><b>Key to symbols:</b> ' + esc(d.keys) + "</p>" : "";
    return (
      '<div class="detail-inner">' +
        /* media */
        '<div class="dcol dcol-media">' +
          '<span class="dcol-h">Media</span>' +
          '<div class="media-photo-lg">' + svg(shapeIcon(d.shape), "sh") +
            '<img src="' + imgURL(d) + '" alt="' + esc(d.shape) + ' diamond" loading="lazy" onerror="this.style.display=\'none\'" />' +
            (d.media ? '<a class="media-play" href="' + v360URL(d) + '" target="_blank" rel="noopener" title="Play 360° video">' + svg("ic-play") + "</a>" : "") +
          "</div>" +
          '<span class="nat-tag">Natural</span>' +
        "</div>" +
        /* information */
        '<div class="dcol">' +
          '<span class="dcol-h">Information</span>' +
          '<div class="info-line strong">' + esc(d.lab || "—") + "</div>" +
          '<div class="info-line ' + sh.c + '">' + sh.t + "</div>" +
          '<div class="info-line ' + mk.c + '">' + mk.t + "</div>" +
          '<div class="info-line ' + ey.c + '">' + ey.t + "</div>" +
        "</div>" +
        /* diamond details */
        '<div class="dcol dcol-wide">' +
          '<span class="dcol-h">Diamond details</span>' +
          '<p class="dd-summary">' + esc(summary) + "</p>" +
          '<div class="dd-grid">' +
            kv("Measurement", esc(d.meas || "—")) +
            kv("Depth", fmtPct(d.depth)) +
            kv("Table", fmtPct(d.tbl)) +
            kv("Ratio", fmtRatio(d.ratio)) +
            kv("Cr. angle", esc(d.crang || "—")) +
            kv("Treatment", "No") +
          "</div>" + keys +
        "</div>" +
        /* supplier */
        '<div class="dcol">' +
          '<span class="dcol-h">Supplier information</span>' +
          '<div class="supplier"><span class="sup-ava">PI</span><span class="sup-name">Pansuriya Impex</span></div>' +
          '<p class="sup-loc">Location : ' + esc(d.loc || "—") + "</p>" +
        "</div>" +
        /* price */
        '<div class="dcol">' +
          '<span class="dcol-h">Price</span>' +
          '<p class="price-disc">' + disc + "</p>" +
          '<div class="price-kv"><span class="k">Diamond price</span><strong>' + fmtUSD(d.total) + "</strong></div>" +
          '<div class="price-kv"><span class="k">Price/Ct</span><strong>' + fmtUSD0(d.ppc) + "/ct</strong></div>" +
        "</div>" +
        /* actions */
        '<div class="dcol dcol-actions">' +
          '<span class="dcol-h">Actions</span>' +
          (d.media ? '<a class="more-btn" href="' + esc(d.media) + '" target="_blank" rel="noopener">' + svg("ic-search") + " More details</a>" : "") +
          (d.rpt ? '<a class="more-btn ghost" href="https://www.gia.edu/report-check?reportno=' + encodeURIComponent(d.rpt) + '" target="_blank" rel="noopener">' + svg("ic-cert") + " Verify " + esc(d.lab || "") + "</a>" : "") +
        "</div>" +
      "</div>"
    );
  }

  function gcardHTML(d, i) {
    var disc = d.dis != null ? (d.dis > 0 ? "+" + d.dis : d.dis) + "%" : "—";
    var discCls = d.dis != null && d.dis <= -30 ? "disc up" : "disc";
    var title = [d.shape, fmtCarat(d.cts) + "ct", d.col, d.cla, d.cut || "—", d.pol, d.sym, flrLabel(d.flr)]
      .filter(Boolean).join(" ");
    var sh = shadeInfo(d), ey = eyeInfo(d), lu = lusterInfo(d);
    var milky = (d.milky || "").toUpperCase();
    var milkyLabel = !milky ? "Hidden" : (milky === "NONE" || milky === "NON" ? "None" : d.milky);
    var media = photoTag(d, "gphoto", "eager");
    return (
      '<article class="gcard" data-i="' + i + '" tabindex="0" role="button" aria-label="View details for ' + esc(title) + '">' +
        '<div class="gcard-media">' +
          svg(shapeIcon(d.shape), "sh") + media +
          '<span class="gstatus-badge ' + statusClass(d.status) + ' gcard-media-ui">' + esc(d.status || "—") + "</span>" +
        "</div>" +
        '<div class="gcard-body">' +
          '<div class="gcard-lab">' + esc(d.lab || "—") + "</div>" +
          '<div class="gcard-title">' + esc(title) + "</div>" +
        "</div>" +
        '<div class="gcard-metrics">' +
          '<span><b>T:</b> ' + fmtPct(d.tbl) + "</span>" +
          '<span><b>D:</b> ' + fmtPct(d.depth) + "</span>" +
          '<span><b>R:</b> ' + fmtRatio(d.ratio) + "</span>" +
          '<span><b>M:</b> ' + esc(milkyLabel) + "</span>" +
        "</div>" +
        '<div class="gcard-quality">' +
          '<span class="' + sh.c + '">' + sh.t + "</span>" +
          '<span class="dot">&bull;</span><span class="' + lu.c + '">' + lu.t + "</span>" +
          '<span class="dot">&bull;</span><span class="' + ey.c + '">' + ey.t + "</span>" +
        "</div>" +
        '<div class="gcard-location">Location : ' + esc(d.loc || "—") + "</div>" +
        '<div class="gcard-price">' +
          '<div><span>Diamond price</span><strong>Price/Ct: ' + fmtUSD0(d.ppc) + "/ct</strong></div>" +
          '<div><span class="' + discCls + '">' + disc + '</span><strong class="gprice-total">' + fmtUSD(d.total) + "</strong></div>" +
        "</div>" +
      "</article>"
    );
  }

  function renderMore() {
    if (shown >= filtered.length) return;
    var end = Math.min(shown + CHUNK, filtered.length);
    if (state.view === "grid") {
      var g = "";
      for (var i = shown; i < end; i++) g += gcardHTML(filtered[i], i);
      gridView.insertAdjacentHTML("beforeend", g);
    } else {
      var h = "";
      for (var j = shown; j < end; j++) h += rowHTML(filtered[j], j);
      tbody.insertAdjacentHTML("beforeend", h);
    }
    shown = end;
  }

  /* infinite scroll */
  function onScroll(el) {
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 480) renderMore();
  }
  tableScroll.addEventListener("scroll", function () { onScroll(tableScroll); });
  gridView.addEventListener("scroll", function () { onScroll(gridView); });

  /* ============================================================
     ROW EXPAND (list) + CARD DETAIL PAGE (grid)
     ============================================================ */
  tbody.addEventListener("click", function (e) {
    var row = e.target.closest("tr.drow");
    if (!row || e.target.closest(".row-check")) return;
    toggleRow(row);
  });

  function toggleRow(row) {
    var i = +row.getAttribute("data-i");
    var next = row.nextElementSibling;
    if (next && next.classList.contains("detail-row")) {
      next.remove(); row.classList.remove("open"); return;
    }
    row.classList.add("open");
    var tr = document.createElement("tr");
    tr.className = "detail-row";
    tr.style.setProperty("--detail-width", tableScroll.clientWidth + "px");
    tr.innerHTML = '<td colspan="19">' + detailHTML(filtered[i]) + "</td>";
    row.parentNode.insertBefore(tr, row.nextElementSibling);
  }
  function syncDetailWidths() {
    document.querySelectorAll("tr.detail-row").forEach(function (tr) {
      tr.style.setProperty("--detail-width", tableScroll.clientWidth + "px");
    });
  }
  window.addEventListener("resize", syncDetailWidths);

  function detailTypeLabel() {
    if (state.cat === "fancy") return "Fancy color";
    if (state.cat === "lab") return "Lab grown";
    return "Natural";
  }
  function specItem(label, value) {
    return '<div class="stock-spec"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }
  function degreeValue(v) {
    return v ? esc(v) + "°" : "—";
  }
  function detailPageHTML(d) {
    var disc = d.dis != null ? (d.dis > 0 ? "+" + d.dis : d.dis) + "%" : "—";
    var discCls = d.dis != null && d.dis <= -30 ? "disc up" : "disc";
    var typeLabel = detailTypeLabel();
    var status = d.status || "—";
    return (
      '<div class="detail-backbar">' +
        '<button class="detail-back" id="detailBack" type="button">' +
          '<svg class="ic"><use href="#ic-chevron"/></svg> Back to search result' +
        "</button>" +
      "</div>" +
      '<article class="stock-detail-card">' +
        '<div class="stock-detail-media">' +
          svg(shapeIcon(d.shape), "sh") +
          '<img src="' + esc(imgURL(d)) + '" alt="' + esc(d.shape || "Diamond") + ' diamond" decoding="async" />' +
        "</div>" +
        '<div class="stock-detail-info">' +
          '<h2>' + esc(titleLine(d)) + "</h2>" +
          '<div class="detail-pills">' +
            '<span class="detail-pill">' + esc(typeLabel) + "</span>" +
            '<span class="detail-pill status ' + statusClass(status) + '">' + esc(status) + "</span>" +
          "</div>" +
          '<p class="detail-lab">Lab ' + esc(d.lab || "—") + "</p>" +
          '<div class="detail-summary-row">' +
            '<div class="detail-location">' +
              '<svg class="ic"><use href="#ic-bookmark"/></svg>' +
              '<span>Location : ' + esc(d.loc || "—") + "</span>" +
            "</div>" +
            '<div class="detail-price-box">' +
              '<div><span>Diamond price</span><strong>' + fmtUSD(d.total) + "</strong></div>" +
              '<div><span>Price/Ct: <b>' + fmtUSD0(d.ppc) + "/ct</b></span><strong class=\"" + discCls + "\">" + disc + "</strong></div>" +
            "</div>" +
          "</div>" +
          '<div class="detail-flags">' + flagsLine(d) + "</div>" +
          '<div class="stock-spec-grid">' +
            specItem("Shape", esc(d.shape || "—")) +
            specItem("Cut", esc(d.cut || "—")) +
            specItem("Measurements", esc(d.meas || "—")) +
            specItem("Crown angle", degreeValue(d.crang)) +
            specItem("Girdle", "—") +
            specItem("Carat", fmtCarat(d.cts) + " ct") +
            specItem("Polish", esc(d.pol || "—")) +
            specItem("Table", fmtPct2(d.tbl)) +
            specItem("Colour", esc(d.col || "—")) +
            specItem("Symmetry", esc(d.sym || "—")) +
            specItem("Depth", fmtPct2(d.depth)) +
            specItem("Clarity", esc(d.cla || "—")) +
            specItem("Fluorescence", flrLabel(d.flr)) +
            specItem("Ratio", fmtRatio(d.ratio)) +
            specItem("Milky", milkyShort(d)) +
            specItem("Stock ID", esc(d.id || "—")) +
            specItem("Certificate", d.rpt ? '<a href="https://www.gia.edu/report-check?reportno=' + encodeURIComponent(d.rpt) + '" target="_blank" rel="noopener">' + esc(d.rpt) + "</a>" : "—") +
            specItem("Key to symbols", esc(d.keys || "—")) +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }
  var detailReturnScroll = 0;
  function showDetailPage(index) {
    var d = filtered[index];
    if (!d) return;
    detailReturnScroll = state.view === "grid" ? gridView.scrollTop : tableScroll.scrollTop;
    detailView.innerHTML = detailPageHTML(d);
    tabsNav.hidden = true;
    invCard.hidden = true;
    detailView.hidden = false;
    window.scrollTo(0, 0);
  }
  function hideDetailPage() {
    detailView.hidden = true;
    detailView.innerHTML = "";
    tabsNav.hidden = false;
    invCard.hidden = false;
    if (state.view === "grid") gridView.scrollTop = detailReturnScroll;
    else tableScroll.scrollTop = detailReturnScroll;
  }
  gridView.addEventListener("click", function (e) {
    var card = e.target.closest(".gcard");
    if (!card) return;
    showDetailPage(+card.getAttribute("data-i"));
  });
  gridView.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".gcard");
    if (!card) return;
    e.preventDefault();
    showDetailPage(+card.getAttribute("data-i"));
  });
  detailView.addEventListener("click", function (e) {
    if (e.target.closest("#detailBack")) hideDetailPage();
  });

  /* ============================================================
     TOOLBAR — search, chips, sort, price
     ============================================================ */
  var searchEl = $("#search"), tDeb;
  searchEl.addEventListener("input", function () {
    clearTimeout(tDeb);
    tDeb = setTimeout(function () { state.search = searchEl.value.trim(); applyFilters(); }, 220);
  });

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var k = chip.getAttribute("data-chip");
      state.chips[k] = !state.chips[k];
      chip.classList.toggle("on", state.chips[k]);
      applyFilters();
    });
  });

  /* generic dropdown open/close */
  function bindDropdown(id) {
    var dd = $(id); if (!dd) return;
    dd.querySelector(".drop-toggle").addEventListener("click", function (e) {
      e.stopPropagation();
      document.querySelectorAll(".dropdown.open").forEach(function (o) { if (o !== dd) o.classList.remove("open"); });
      dd.classList.toggle("open");
    });
    dd.querySelector(".drop-menu").addEventListener("click", function (e) { e.stopPropagation(); });
  }
  bindDropdown("#priceDrop"); bindDropdown("#sortDrop");
  document.addEventListener("click", function () {
    document.querySelectorAll(".dropdown.open").forEach(function (o) { o.classList.remove("open"); });
    var hm = $("#helpMenu"); if (hm) hm.hidden = true;
  });

  /* sort */
  $("#sortDrop").querySelectorAll("[data-sort]").forEach(function (b) {
    b.addEventListener("click", function () {
      $("#sortDrop").querySelectorAll("[data-sort]").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      state.sort = b.getAttribute("data-sort");
      $("#sortLabel").textContent = b.textContent.trim();
      $("#sortDrop").classList.remove("open");
      applyFilters();
    });
  });

  /* price dropdown */
  $("[data-apply-price]").addEventListener("click", function () {
    state.f.pMin = numOrNull($("#priceMin").value);
    state.f.pMax = numOrNull($("#priceMax").value);
    $("#priceDrop").classList.remove("open");
    applyFilters();
  });
  $("[data-clear-price]").addEventListener("click", function () {
    $("#priceMin").value = ""; $("#priceMax").value = "";
    state.f.pMin = state.f.pMax = null;
    applyFilters();
  });
  function numOrNull(v) { v = parseFloat(v); return isNaN(v) ? null : v; }

  /* ============================================================
     FILTER PANEL
     ============================================================ */
  function distinctOrdered(key) {
    var set = {}; activeStock().forEach(function (d) { if (d[key]) set[d[key]] = 1; });
    var ord = ORDER[key] || [];
    var present = Object.keys(set);
    present.sort(function (a, b) {
      var ia = ord.indexOf(a), ib = ord.indexOf(b);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib || a.localeCompare(b);
    });
    return present;
  }
  var SHORT_LABEL = {
    cut: { EX: "Excellent", VG: "Very good", GD: "Good", G: "Good", F: "Fair", P: "Poor" },
    pol: { EX: "Excellent", VG: "Very good", GD: "Good", G: "Good", F: "Fair", P: "Poor" },
    sym: { EX: "Excellent", VG: "Very good", GD: "Good", G: "Good", F: "Fair", P: "Poor" }
  };
  function labelFor(key, val) {
    if (key === "flr") return flrLabel(val);
    if (SHORT_LABEL[key] && SHORT_LABEL[key][val]) return SHORT_LABEL[key][val];
    return val;
  }
  function activeCatLabel() {
    var tab = document.querySelector('.tab[data-cat="' + state.cat + '"]');
    return tab ? tab.textContent.trim() : "Diamonds";
  }
  function draft() {
    if (!filterDraft) filterDraft = { f: cloneFilter(state.f), chips: cloneChips(state.chips) };
    return filterDraft;
  }
  function section(title, body, cls) {
    if (!body) return "";
    return '<section class="fp-section ' + (cls || "") + '"><h3>' + esc(title) + "</h3>" + body + "</section>";
  }
  function optionButton(key, val, label, extraClass, extraInner) {
    var f = draft().f;
    var on = f[key] && f[key].indexOf(val) >= 0;
    return '<button type="button" class="fp-opt ' + (extraClass || "") + (on ? " on" : "") + '" data-fkey="' + esc(key) + '" data-val="' + esc(val) + '">' +
      (extraInner || "") + '<span>' + esc(label == null ? val : label) + "</span></button>";
  }
  function optBlock(title, key, opts, labelFn, cls) {
    opts = opts.filter(Boolean);
    if (!opts.length) return "";
    var html = '<div class="fp-block ' + (cls || "") + '"><h4>' + esc(title) + '</h4><div class="fp-opts">';
    opts.forEach(function (o) { html += optionButton(key, o, labelFn ? labelFn(o) : labelFor(key, o)); });
    return html + "</div></div>";
  }
  function shapeBlock() {
    var opts = distinctOrdered("shape");
    if (!opts.length) return "";
    var html = '<div class="fp-shape-grid">';
    opts.forEach(function (o) {
      html += optionButton("shape", o, o, "fp-shape", svg(shapeIcon(o), "sh"));
    });
    return section("Shape", html, "fp-full");
  }
  function hasStockInRange(key, min, max) {
    return activeStock().some(function (d) { return hasRangeValue(d[key], min, max); });
  }
  function rangeInput(label, key, placeholder, step, suffix) {
    var value = draft().f[key];
    return '<label class="fp-number"><span>' + esc(label) + '</span><span class="fp-input-wrap">' +
      '<input type="number" data-range-key="' + esc(key) + '" step="' + esc(step || "1") + '" placeholder="' + esc(placeholder || "") + '" value="' + esc(value == null ? "" : value) + '" />' +
      (suffix ? '<em>' + esc(suffix) + "</em>" : "") + "</span></label>";
  }
  function rangePair(label, minKey, maxKey, suffix, step) {
    return '<div class="fp-range-pair"><h4>' + esc(label) + '</h4><div class="fp-range">' +
      rangeInput("Min", minKey, "Min", step, suffix) +
      rangeInput("Max", maxKey, "Max", step, suffix) +
      "</div></div>";
  }
  function caratBlock() {
    var presets = [
      ["30s", 0.3, 0.39], ["40s", 0.4, 0.49], ["50s", 0.5, 0.59], ["60s", 0.6, 0.69],
      ["70s", 0.7, 0.79], ["80s", 0.8, 0.89], ["90s", 0.9, 0.99], ["1ct", 1, 1.09],
      ["1.1ct", 1.1, 1.19], ["1.2ct", 1.2, 1.49], ["1.5ct", 1.5, 1.99], ["2ct", 2, 2.49],
      ["2.5ct", 2.5, 2.99], ["3ct", 3, 3.99], ["4ct", 4, 4.99], ["5ct+", 5, null]
    ].filter(function (p) { return hasStockInRange("cts", p[1], p[2]); });
    var html = '<div class="fp-carat-layout"><div class="fp-carat-row">' + rangeInput("Min", "cMin", "Min", "0.01", "ct") + rangeInput("Max", "cMax", "Max", "0.01", "ct") + '</div><span class="fp-carat-divider"></span>';
    if (presets.length) {
      html += '<div class="fp-presets">';
      presets.forEach(function (p) {
        var on = draft().f.cMin === p[1] && draft().f.cMax === p[2];
        html += '<button type="button" class="fp-opt fp-preset' + (on ? " on" : "") + '" data-carat-min="' + p[1] + '" data-carat-max="' + (p[2] == null ? "" : p[2]) + '">' + esc(p[0]) + "</button>";
      });
      html += "</div>";
    }
    html += "</div>";
    return section("Carat (ct)", html, "fp-full");
  }
  function priceBlock() {
    return section("Price (USD)",
      '<div class="fp-price-grid">' +
        rangePair("Total price", "pMin", "pMax", "USD", "1") +
        rangePair("Price/ct", "ppcMin", "ppcMax", "USD", "1") +
      "</div>",
      "fp-full"
    );
  }
  function switchButton(label, key) {
    var on = !!draft().chips[key];
    return '<button type="button" class="fp-switch' + (on ? " on" : "") + '" data-chip-toggle="' + esc(key) + '"><span class="fp-toggle"></span><span>' + esc(label) + "</span></button>";
  }
  function optionList(key, opts, labelFn) {
    opts = opts.filter(Boolean);
    if (!opts.length) return "";
    var html = '<div class="fp-opts">';
    opts.forEach(function (o) { html += optionButton(key, o, labelFn ? labelFn(o) : labelFor(key, o)); });
    return html + "</div>";
  }
  function orderByList(values, order) {
    values.sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia < 0) ia = 999; if (ib < 0) ib = 999;
      return ia - ib || a.localeCompare(b);
    });
    return values;
  }
  function fancyDropdownOptions(kind) {
    var set = {};
    activeStock().forEach(function (d) {
      var info = parseFancyColorLabel(d.col);
      if (kind === "color") set[info.color] = 1;
      if (kind === "intensity") set[info.intensity] = 1;
      if (kind === "overtone") info.overtones.forEach(function (o) { set[o] = 1; });
    });
    var values = Object.keys(set).filter(function (v) { return v && v !== "Other"; });
    if (kind === "color") return orderByList(values, FANCY_COLOR_ORDER);
    if (kind === "intensity") return orderByList(values, FANCY_INTENSITY_ORDER);
    return orderByList(values, FANCY_OVERTONE_ORDER);
  }
  function selectField(label, key, opts) {
    var selected = draft().f[key][0] || "";
    var html = '<label class="fp-select-field"><span>' + esc(label) + '</span><select data-select-key="' + esc(key) + '">';
    html += '<option value="">' + esc(label) + "</option>";
    opts.forEach(function (o) {
      html += '<option value="' + esc(o) + '"' + (selected === o ? " selected" : "") + ">" + esc(o) + "</option>";
    });
    return html + "</select></label>";
  }
  function multiSelectSummary(label, selected) {
    if (!selected.length) return label;
    if (selected.length <= 2) return selected.join(", ");
    return selected.length + " selected";
  }
  function multiSelectField(label, key, opts) {
    var selected = draft().f[key];
    var html = '<details class="fp-multi-select' + (selected.length ? " has-selection" : "") + '" data-multi-select="' + esc(key) + '" data-placeholder="' + esc(label) + '">' +
      '<summary><span class="fp-multi-value">' + esc(multiSelectSummary(label, selected)) + "</span></summary>" +
      '<div class="fp-multi-menu">';
    opts.forEach(function (o) {
      var on = selected.indexOf(o) >= 0;
      html += '<button type="button" class="fp-multi-option' + (on ? " on" : "") + '" data-multi-val="' + esc(o) + '">' +
        '<span class="fp-checkmark"></span><span>' + esc(o) + "</span></button>";
    });
    return html + "</div></details>";
  }
  function fancyColourBlock() {
    return '<div class="fp-fancy-colour">' +
      '<div class="fp-colour-title"><h4>Colour</h4><div class="fp-segment"><button type="button" disabled>White</button><button type="button" class="active" disabled>Fancy</button></div></div>' +
      multiSelectField("Colour", "fancyColor", fancyDropdownOptions("color")) +
      selectField("Intensity", "fancyIntensity", fancyDropdownOptions("intensity")) +
      multiSelectField("Overtone", "fancyOvertone", fancyDropdownOptions("overtone")) +
    "</div>";
  }
  function visibilityBlock() {
    return section("Show/hide results",
      switchButton("Show only image", "image") +
      switchButton("Show only video", "video") +
      switchButton("Show only available for immediate purchase", "mystock"),
      "fp-visibility"
    );
  }
  function distinctKeys() {
    var set = {};
    activeStock().forEach(function (d) { keyTokens(d).forEach(function (k) { set[k] = 1; }); });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }
  function buildMainFilters() {
    var top = '<div class="fp-two-col">' + section("Certificate", optionList("lab", distinctOrdered("lab")), "") + visibilityBlock() + "</div>";
    var quality = '<div class="fp-split">' +
      (state.cat === "fancy" ? fancyColourBlock() : optBlock("Colour", "col", distinctOrdered("col"))) +
      optBlock("Clarity", "cla", distinctOrdered("cla")) +
      "</div>";
    var finishing = '<div class="fp-three-col">' +
      optBlock("Cut", "cut", distinctOrdered("cut")) +
      optBlock("Polish", "pol", distinctOrdered("pol")) +
      optBlock("Symmetry", "sym", distinctOrdered("sym")) +
      "</div>";
    return top + shapeBlock() + caratBlock() + section("Colour & clarity", quality, "fp-full") +
      section("Cut, polish & symmetry", finishing, "fp-full") +
      section("Fluorescence", optBlock("Fluorescence", "flr", distinctOrdered("flr"), flrLabel), "fp-full") +
      priceBlock();
  }
  function buildAdvancedFilters() {
    var measurements = '<div class="fp-three-col">' +
      rangePair("Length (mm)", "lenMin", "lenMax", "", "0.01") +
      rangePair("Width (mm)", "widthMin", "widthMax", "", "0.01") +
      rangePair("Depth (mm)", "heightMin", "heightMax", "", "0.01") +
      rangePair("Ratio", "ratioMin", "ratioMax", "", "0.01") +
      rangePair("Table (%)", "tblMin", "tblMax", "%", "0.1") +
      rangePair("Depth (%)", "depthMin", "depthMax", "%", "0.1") +
      rangePair("Rap", "rapMin", "rapMax", "USD", "1") +
      "</div>";
    var location = optBlock("Location", "loc", distinctOrdered("loc"));
    var keys = optBlock("Key to symbols", "key", distinctKeys());
    return section("Parameters", measurements, "fp-full") +
      '<div class="fp-split">' + location + keys + "</div>";
  }
  function syncFilterControls() {
    document.querySelectorAll(".chip").forEach(function (chip) {
      var k = chip.getAttribute("data-chip");
      chip.classList.toggle("on", !!state.chips[k]);
    });
    $("#priceMin").value = state.f.pMin == null ? "" : state.f.pMin;
    $("#priceMax").value = state.f.pMax == null ? "" : state.f.pMax;
  }
  function buildFilterPanel() {
    var g = $("#fpGrid");
    $("#fpSubtitle").textContent = activeCatLabel();
    document.querySelectorAll(".fp-tab").forEach(function (tab) {
      tab.classList.toggle("active", tab.getAttribute("data-filter-tab") === filterTab);
    });
    g.innerHTML = filterTab === "advanced" ? buildAdvancedFilters() : buildMainFilters();
    g.querySelectorAll("[data-fkey]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-fkey"), val = btn.getAttribute("data-val");
        var arr = draft().f[key], idx = arr.indexOf(val);
        if (idx < 0) arr.push(val); else arr.splice(idx, 1);
        btn.classList.toggle("on", idx < 0);
      });
    });
    g.querySelectorAll("[data-chip-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-chip-toggle");
        draft().chips[key] = !draft().chips[key];
        btn.classList.toggle("on", draft().chips[key]);
      });
    });
    g.querySelectorAll("[data-range-key]").forEach(function (inp) {
      inp.addEventListener("input", function () { draft().f[inp.getAttribute("data-range-key")] = numOrNull(inp.value); });
    });
    g.querySelectorAll("[data-select-key]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var key = sel.getAttribute("data-select-key");
        draft().f[key] = sel.value ? [sel.value] : [];
      });
    });
    g.querySelectorAll("[data-multi-select]").forEach(function (box) {
      box.addEventListener("toggle", function () {
        if (!box.open) return;
        g.querySelectorAll("[data-multi-select]").forEach(function (other) {
          if (other !== box) other.open = false;
        });
      });
    });
    g.querySelectorAll("[data-multi-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var box = btn.closest("[data-multi-select]");
        var key = box.getAttribute("data-multi-select");
        var val = btn.getAttribute("data-multi-val");
        var arr = draft().f[key];
        var idx = arr.indexOf(val);
        if (idx < 0) arr.push(val); else arr.splice(idx, 1);
        btn.classList.toggle("on", idx < 0);
        box.classList.toggle("has-selection", arr.length > 0);
        box.querySelector(".fp-multi-value").textContent = multiSelectSummary(box.getAttribute("data-placeholder"), arr);
      });
    });
    g.querySelectorAll("[data-carat-min]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft().f.cMin = numOrNull(btn.getAttribute("data-carat-min"));
        draft().f.cMax = numOrNull(btn.getAttribute("data-carat-max"));
        buildFilterPanel();
      });
    });
  }
  function resetFilterScroll() {
    var g = $("#fpGrid");
    if (!g) return;
    g.scrollTop = 0;
    window.requestAnimationFrame(function () { g.scrollTop = 0; });
  }
  function openFilters() {
    filterDraft = { f: cloneFilter(state.f), chips: cloneChips(state.chips) };
    filterTab = "main";
    $("#filterPanel").hidden = false;
    document.body.classList.add("filter-open");
    buildFilterPanel();
    resetFilterScroll();
  }
  function closeFilters() {
    $("#filterPanel").hidden = true;
    document.body.classList.remove("filter-open");
    filterDraft = null;
  }
  function applyFilterDraft() {
    state.f = cloneFilter(draft().f);
    state.chips = cloneChips(draft().chips);
    syncFilterControls();
    closeFilters();
    applyFilters();
  }
  $("#filtersBtn").addEventListener("click", openFilters);
  $("#fpClose").addEventListener("click", closeFilters);
  $("#fpCancel").addEventListener("click", closeFilters);
  $("#filterPanel").addEventListener("click", function (e) { if (e.target === $("#filterPanel")) closeFilters(); });
  document.querySelectorAll(".fp-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      filterTab = tab.getAttribute("data-filter-tab");
      buildFilterPanel();
      resetFilterScroll();
    });
  });
  $("#fpApply").addEventListener("click", applyFilterDraft);
  $("#fpReset").addEventListener("click", function () {
    filterDraft = { f: emptyFilterState(), chips: { image: false, video: false, mystock: false } };
    buildFilterPanel();
  });
  $("#emptyReset").addEventListener("click", resetAll);

  function resetAll() {
    state.f = emptyFilterState();
    state.chips = { image: false, video: false, mystock: false };
    state.search = "";
    searchEl.value = "";
    filterDraft = null;
    syncFilterControls();
    closeFilters();
    applyFilters();
  }

  function countFilters() {
    var f = state.f, n = 0;
    ["lab", "shape", "col", "cla", "cut", "pol", "sym", "flr", "loc", "key", "fancyColor", "fancyIntensity", "fancyOvertone"].forEach(function (k) { n += f[k].length; });
    [
      "cMin", "cMax", "pMin", "pMax", "ppcMin", "ppcMax", "rapMin", "rapMax",
      "ratioMin", "ratioMax", "tblMin", "tblMax", "depthMin", "depthMax",
      "lenMin", "lenMax", "widthMin", "widthMax", "heightMin", "heightMax"
    ].forEach(function (k) { if (f[k] != null) n++; });
    Object.keys(state.chips).forEach(function (k) { if (state.chips[k]) n++; });
    return n;
  }
  function updateFilterBadge() {
    var n = countFilters(), b = $("#filterBadge");
    b.hidden = n === 0; b.textContent = n;
  }
  function syncCategoryUI() {
    var active = null;
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.getAttribute("data-cat") === state.cat;
      t.classList.toggle("active", on);
      if (on) active = t;
    });
    if (active) $(".inv-title").firstChild.textContent = active.textContent.trim() + " ";
  }
  function setCategory(cat, shouldReset) {
    if (!validCat(cat)) return;
    state.cat = cat;
    rememberCategory(cat);
    syncCategoryUI();
    if (shouldReset) resetAll();
    else applyFilters();
  }

  /* ============================================================
     VIEW TOGGLE + TABS
     ============================================================ */
  document.querySelectorAll(".vt-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".vt-btn").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      state.view = b.getAttribute("data-view");
      var grid = state.view === "grid";
      gridView.hidden = !grid; tableScroll.hidden = grid;
      applyFilters();
    });
  });

  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      setCategory(t.getAttribute("data-cat"), true);
    });
  });

  /* ============================================================
     CALCULATOR + HELP + MENU
     ============================================================ */
  var calcModal = $("#calcModal");
  $("#calcBtn").addEventListener("click", function () { calcModal.hidden = false; });
  document.querySelectorAll("[data-close-calc]").forEach(function (b) { b.addEventListener("click", function () { calcModal.hidden = true; }); });
  calcModal.addEventListener("click", function (e) { if (e.target === calcModal) calcModal.hidden = true; });
  function calc() {
    var cts = parseFloat($("#calcCts").value) || 0;
    var ppc = parseFloat($("#calcPpc").value) || 0;
    var disc = parseFloat($("#calcDisc").value);
    var total = cts * ppc;
    if (!isNaN(disc)) total = total * (1 + disc / 100);
    $("#calcOut").textContent = fmtUSD(total);
  }
  ["calcCts", "calcPpc", "calcDisc"].forEach(function (id) { $("#" + id).addEventListener("input", calc); });

  $("#helpBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    var hm = $("#helpMenu"); hm.hidden = !hm.hidden;
  });
  $("#menuBtn").addEventListener("click", function () { window.location.href = "index.html"; });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      calcModal.hidden = true;
      closeFilters();
      if (!detailView.hidden) hideDetailPage();
    }
  });

  /* ============================================================
     INIT
     ============================================================ */
  syncCategoryUI();
  rememberCategory(state.cat);
  applyFilters();
})();
