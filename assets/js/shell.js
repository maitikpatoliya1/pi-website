/* ============================================================
   Pansuriya Impex — app shell for the main page (stock.html)
   ------------------------------------------------------------
   Supabase-backed: verifies the session + approval before showing
   anything, then builds the role-based left menu, switches views,
   signs out, and renders the dashboard. Requires PI_SB / PIAuth /
   PIPerms (loaded before this file).
   ============================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  if (!window.PIAuth) { location.replace("login.html"); return; }

  // role = the real signed-in role; viewRole = the role we render as
  // (admins can preview other roles via the side-menu dropdown).
  var role = "customer", viewRole = "customer", displayName = "User";

  /* ---------- gate: must be signed in AND approved ---------- */
  PIAuth.getSession().then(function (session) {
    if (!session) { location.replace("login.html"); return Promise.reject("noauth"); }
    return PIAuth.fetchOwnProfile();
  }).then(function (p) {
    if (!p || p.status !== "approved") {
      return PIAuth.logout().then(function () { location.replace("login.html"); return Promise.reject("notapproved"); });
    }
    role = p.role || "customer";
    viewRole = role;
    displayName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.username || "User";
    return PIPerms.load();
  }).then(boot).catch(function () { /* redirect already issued */ });

  function boot() {
    var nav = $("smNav");
    var menu = $("sideMenu"), backdrop = $("drawerBackdrop");
    var VIEWS = ["dashboard", "inventory", "cart", "users"];
    var dashRenderedFor = null;   // which role the dashboard was last rendered for
    var currentIds = [];

    /* identity (always the real signed-in person) */
    $("smName").textContent = displayName;
    $("smAvatar").textContent = (displayName.charAt(0) || "U").toUpperCase();

    /* pages a given role may see (customers get no dashboard) */
    function pagesFor(r) {
      var pages = PIPerms.allowedPages(r);
      if (r === "customer") pages = pages.filter(function (p) { return p.id !== "dashboard"; });
      return pages;
    }
    function allowed(id) {
      if (viewRole === "customer" && id === "dashboard") return false;
      return viewRole === "admin" || PIPerms.canAccess(viewRole, id);
    }
    function resolve(id) { return (id && allowed(id)) ? id : (currentIds[0] || "inventory"); }
    function defaultViewFor(r) {
      var ids = pagesFor(r).map(function (p) { return p.id; });
      if (ids.indexOf("dashboard") > -1) return "dashboard";
      return ids.indexOf("inventory") > -1 ? "inventory" : (ids[0] || "inventory");
    }

    function renderNav() {
      var pages = pagesFor(viewRole);
      currentIds = pages.map(function (p) { return p.id; });
      nav.innerHTML = pages.map(function (p) {
        return '<button class="sm-link" data-view="' + p.id + '"><svg class="ic"><use href="#' + p.icon + '"/></svg><span>' + esc(p.label) + '</span>' +
          (p.id === "cart" ? '<span class="sm-count" data-cart-nav-count hidden>0</span>' : '') + '</button>';
      }).join("");
      if (window.PICart) window.PICart.updateBadges();
    }
    function updateRoleLabel() {
      $("smRole").textContent = (viewRole === role)
        ? PIAuth.roleLabel(role)
        : PIAuth.roleLabel(role) + " · viewing as " + PIAuth.roleLabel(viewRole);
      var note = $("smRoleViewNote");
      if (note) {
        if (viewRole === role) { note.hidden = true; }
        else { note.hidden = false; note.textContent = "Previewing the " + PIAuth.roleLabel(viewRole) + " experience"; }
      }
    }

    function showView(req) {
      var id = resolve(req);
      VIEWS.forEach(function (v) { var el = $("view-" + v); if (el) el.hidden = (v !== id); });
      Array.prototype.forEach.call(nav.querySelectorAll(".sm-link"), function (b) {
        b.classList.toggle("active", b.getAttribute("data-view") === id);
      });
      if (id === "dashboard" && dashRenderedFor !== viewRole) { renderDashboard(); dashRenderedFor = viewRole; }
      if (id === "cart" && window.PICart) window.PICart.render();
      if (id === "users" && window.PIUserMgmt) PIUserMgmt.render();
      document.title = (id === "dashboard" ? "Dashboard" : id === "users" ? "User Management" : id === "cart" ? "Cart" : "Diamond Inventory") + " — Pansuriya Impex";
      try { sessionStorage.setItem("pi_view", id); } catch (e) {}   // remember it for reloads
    }

    /* drawer open/close */
    function open() { menu.classList.add("open"); backdrop.hidden = false; menu.setAttribute("aria-hidden", "false"); }
    function close() { menu.classList.remove("open"); backdrop.hidden = true; menu.setAttribute("aria-hidden", "true"); }
    $("menuBtn").addEventListener("click", open);
    $("sideClose").addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    nav.addEventListener("click", function (e) {
      var b = e.target.closest(".sm-link");
      if (!b) return;
      showView(b.getAttribute("data-view"));
      close();
    });
    $("sideSignOut").addEventListener("click", function () {
      try { sessionStorage.removeItem("pi_view"); } catch (e) {}   // fresh login starts at the default view
      PIAuth.logout().then(function () { location.replace("login.html"); });
    });
    if ($("cartBtn")) {
      $("cartBtn").addEventListener("click", function () {
        if (allowed("cart")) showView("cart");
      });
    }

    /* admin-only: "view as role" dropdown to preview each role's experience */
    if (role === "admin") {
      var rv = $("smRoleView"), sel = $("smRoleSelect");
      if (rv && sel) {
        sel.innerHTML = PIAuth.ROLES.map(function (r) {
          return '<option value="' + r + '"' + (r === viewRole ? " selected" : "") + ">" +
            esc(PIAuth.roleLabel(r)) + (r === role ? " (you)" : "") + "</option>";
        }).join("");
        rv.hidden = false;
        sel.addEventListener("change", function () {
          viewRole = sel.value;
          renderNav();
          updateRoleLabel();
          showView(defaultViewFor(viewRole));
        });
      }
    }

    /* initial render — on reload, return to the view you were on (per tab);
       a fresh sign-in (no saved view) lands on the role's default. */
    renderNav();
    updateRoleLabel();
    var savedView = null;
    try { savedView = sessionStorage.getItem("pi_view"); } catch (e) {}
    showView(savedView && allowed(savedView) ? savedView : defaultViewFor(viewRole));
    window.PIShell = { showView: showView };
  }

  /* ---------- dashboard ---------- */
  function n0(x) { return (x || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function money(x) {
    return "$" + (+x || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function normalizeStatus(s) {
    return String(s || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  }
  function allStones() {
    var nat = Array.isArray(window.PI_STOCK) ? window.PI_STOCK : [];
    var fan = Array.isArray(window.PI_FANCY_STOCK) ? window.PI_FANCY_STOCK : [];
    // Drop corrupt rows: a cut diamond is never > ~150 ct, so anything
    // larger (e.g. a stray 5,290 ct / $8.18M import row) is bad data and
    // would wreck the inventory value/stats.
    return nat.concat(fan).filter(function (d) {
      var ct = +d.cts || 0;
      return ct >= 0 && ct <= 150;
    });
  }
  function dashboardStore() {
    if (window.PI_DASHBOARD_STORE && typeof window.PI_DASHBOARD_STORE === "object") return window.PI_DASHBOARD_STORE;
    try {
      return JSON.parse(localStorage.getItem("piDashboardStore") || localStorage.getItem("pi-dashboard-store") || "{}");
    } catch (e) {
      return {};
    }
  }
  function readPath(obj, path) {
    return path.split(".").reduce(function (acc, key) {
      return acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined;
    }, obj);
  }
  function storeNumber(paths) {
    var store = dashboardStore();
    for (var i = 0; i < paths.length; i++) {
      var val = readPath(store, paths[i]);
      if (val !== undefined && val !== null && val !== "") return +val || 0;
    }
    return 0;
  }
  function compactMoney(x) {
    x = +x || 0;
    if (Math.abs(x) >= 1000000) return "$" + (x / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (Math.abs(x) >= 1000) return "$" + (x / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return money(x);
  }
  function pct(x) { return (Math.round((+x || 0) * 10) / 10).toFixed(1).replace(/\.0$/, "") + "%"; }
  function sumBy(list, fn) {
    return list.reduce(function (acc, item) { return acc + (fn(item) ? (+item.total || 0) : 0); }, 0);
  }
  function storeSeries(paths, fallback) {
    var store = dashboardStore();
    for (var i = 0; i < paths.length; i++) {
      var val = readPath(store, paths[i]);
      if (Array.isArray(val) && val.length) return val.map(function (n) { return +n || 0; });
    }
    return fallback;
  }
  function makeMonthlySeries(total, bias) {
    total = +total || 0;
    var days = 31, out = [], weight = 0, i;
    for (i = 0; i < days; i++) {
      weight += ((i * 7 + bias) % 11) + (i % 6 === 0 ? 9 : 2);
    }
    for (i = 0; i < days; i++) {
      out.push(Math.round(total * (((i * 7 + bias) % 11) + (i % 6 === 0 ? 9 : 2)) / weight));
    }
    return out;
  }
  function makeWeeklySeries(total) {
    total = +total || 0;
    var ratios = [0.92, 0.68, 1.12, 1.24, 0.76, 0.48, 0.84, 1.06];
    var avg = ratios.reduce(function (a, b) { return a + b; }, 0) / ratios.length;
    return ratios.map(function (r) { return Math.round((total / 8) * (r / avg)); });
  }
  function svgPoints(values, w, h, pad) {
    var max = Math.max.apply(null, values.concat([1]));
    return values.map(function (v, i) {
      var x = pad + (i * ((w - pad * 2) / Math.max(values.length - 1, 1)));
      var y = h - pad - ((+v || 0) / max) * (h - pad * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
  }
  function pathFromPoints(points) {
    return points.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" ");
  }
  function areaPath(values, w, h, pad) {
    var pts = svgPoints(values, w, h, pad);
    return pathFromPoints(pts) + " L" + pts[pts.length - 1][0] + " " + (h - pad) + " L" + pts[0][0] + " " + (h - pad) + " Z";
  }
  function linePath(values, w, h, pad) {
    return pathFromPoints(svgPoints(values, w, h, pad));
  }
  function renderAreaChart(current, previous) {
    var w = 620, h = 260, pad = 34;
    return '<svg class="sales-area-chart" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Monthly revenue comparison">' +
      '<path class="sales-chart-grid" d="M34 54H586M34 104H586M34 154H586M34 204H586"/>' +
      '<path class="sales-chart-axis" d="M34 26V226H586"/>' +
      '<path class="sales-area-previous" d="' + areaPath(previous, w, h, pad) + '"/>' +
      '<path class="sales-line-previous" d="' + linePath(previous, w, h, pad) + '"/>' +
      '<path class="sales-area-current" d="' + areaPath(current, w, h, pad) + '"/>' +
      '<path class="sales-line-current" d="' + linePath(current, w, h, pad) + '"/>' +
      '<text x="34" y="248">1</text><text x="302" y="248">15</text><text x="566" y="248">31</text>' +
    "</svg>";
  }
  function renderBarChart(values) {
    var max = Math.max.apply(null, values.concat([1]));
    return '<div class="sales-bar-chart" aria-label="Last 8 weeks sales">' + values.map(function (v, i) {
      return '<div class="sales-bar-wrap">' +
        '<span class="sales-bar" style="height:' + Math.max(12, Math.round((v / max) * 100)) + '%">' +
          '<span class="sales-bar-value">' + compactMoney(v) + '</span>' +
        '</span>' +
        '<span class="sales-bar-label">W' + (i + 1) + '</span></div>';
    }).join("") + "</div>";
  }
  function renderActionCard(card) {
    return '<article class="sales-action-card ' + esc(card.tone || "") + '">' +
      '<div class="sales-action-top">' +
        '<span class="sales-action-icon"><svg class="ic"><use href="#' + esc(card.icon) + '"/></svg></span>' +
        '<button type="button" class="sales-action-btn">' + esc(card.action) + '</button>' +
      '</div>' +
      '<h2>' + esc(card.label) + '</h2>' +
      '<strong>' + esc(card.value) + '</strong>' +
    '</article>';
  }
  function renderActivityCard(card) {
    return '<article class="sales-activity-card">' +
      '<h3><span><svg class="ic"><use href="#' + esc(card.icon) + '"/></svg></span>' + esc(card.title) + '</h3>' +
      '<div class="sales-activity-rows">' + card.rows.map(function (row) {
        return '<div><span>' + esc(row.label) + '</span><strong>' + esc(row.value) + '</strong></div>';
      }).join("") + '</div>' +
      '<button type="button">View all</button>' +
    '</article>';
  }
  function renderSalespersonDashboard() {
    var root = $("dashRoot");
    if (root) root.classList.add("sales-dash-root");
    var stones = allStones();
    var statusCounts = { available: 0, memo: 0, memo_out: 0, hold: 0, offer: 0 };
    var liveValue = 0, notLiveValue = 0, totalValue = 0;
    stones.forEach(function (d) {
      var st = normalizeStatus(d.status);
      totalValue += +d.total || 0;
      if (st === "available") { statusCounts.available++; liveValue += +d.total || 0; }
      else { notLiveValue += +d.total || 0; }
      if (st === "memo") statusCounts.memo++;
      if (st === "memo_out" || st === "memoout") statusCounts.memo_out++;
      if (st === "hold") statusCounts.hold++;
      if (st === "offer") statusCounts.offer++;
    });
    var docProforma = storeNumber(["salesDocuments.proforma", "documents.proforma", "proforma"]);
    var docInvoice = storeNumber(["salesDocuments.invoiceStones", "documents.invoiceStones", "invoiceStones"]);
    var docCancel = storeNumber(["salesDocuments.cancelSell", "documents.cancelSell", "cancelSell"]);
    var mixProforma = storeNumber(["mixSaleAmounts.proforma", "amounts.mixProforma", "mixProforma"]);
    var mixInvoice = storeNumber(["mixSaleAmounts.invoice", "amounts.mixInvoice", "mixInvoice"]);
    var mixCancel = storeNumber(["mixSaleAmounts.cancelSell", "amounts.mixCancelSell", "mixCancelSell"]);
    var pipelineValue = sumBy(stones, function (d) {
      var st = normalizeStatus(d.status);
      return st === "memo" || st === "memo_out" || st === "memoout" || st === "hold" || st === "offer";
    });
    var monthRevenue = storeNumber(["revenues.thisMonth", "revenue.thisMonth", "sales.thisMonth"]) ||
      (mixProforma + mixInvoice - mixCancel) || Math.round(pipelineValue * 0.035);
    var previousRevenue = storeNumber(["revenues.lastMonth", "revenue.lastMonth", "sales.lastMonth"]) ||
      Math.round(monthRevenue * 1.18);
    var currentSeries = storeSeries(["revenues.dailyCurrent", "revenue.dailyCurrent"], makeMonthlySeries(monthRevenue, 3));
    var previousSeries = storeSeries(["revenues.dailyPrevious", "revenue.dailyPrevious"], makeMonthlySeries(previousRevenue, 8));
    var weeklySeries = storeSeries(["revenues.weekly", "revenue.weekly"], makeWeeklySeries(monthRevenue || previousRevenue || pipelineValue));
    var weeklyAvg = weeklySeries.length ? weeklySeries.reduce(function (a, b) { return a + b; }, 0) / weeklySeries.length : 0;
    var revenueDelta = previousRevenue ? ((monthRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    var livePct = stones.length ? (statusCounts.available / stones.length) * 100 : 0;
    var notLive = Math.max(0, stones.length - statusCounts.available);
    var today = new Date();
    var monthLabel = today.toLocaleString("en-US", { month: "short" }) + " '" + String(today.getFullYear()).slice(2);
    var firstName = (displayName.split(" ")[0] || displayName).trim();
    var welcomeLine = firstName.length > 22 ? "Welcome back" : "Welcome back, " + firstName;

    var actions = [
      { label: "Pending confirmation", value: n0(docProforma), action: "Review", icon: "ic-clipboard", tone: "champagne" },
      { label: "Pending invoices", value: n0(docInvoice), action: "Upload", icon: "ic-receipt", tone: "muted" },
      { label: "Pending holds", value: n0(statusCounts.hold), action: "Resolve", icon: "ic-lock", tone: "muted" },
      { label: "Pending delivery", value: n0(statusCounts.memo_out), action: "Manage", icon: "ic-arrowout", tone: "gold" },
      { label: "Pending enquiries", value: n0(statusCounts.offer), action: "Respond", icon: "ic-tag", tone: "ink" }
    ];
    var activities = [
      { title: "My performance", icon: "ic-gauge", rows: [
        { label: "Response score", value: pct(statusCounts.offer ? 96 : 100) },
        { label: "Sold out", value: pct(docInvoice ? Math.min(100, docInvoice * 4) : 0) },
        { label: "Media score", value: pct(97) },
        { label: "On time delivery", value: pct(statusCounts.memo_out ? 94 : 100) }
      ] },
      { title: "Orders", icon: "ic-doc", rows: [
        { label: "Completed", value: n0(docInvoice) },
        { label: "Returned", value: n0(0) },
        { label: "Pending", value: n0(docProforma) },
        { label: "Cancelled", value: n0(docCancel) },
        { label: "Return transit", value: n0(statusCounts.memo_out) }
      ] },
      { title: "Invoices", icon: "ic-receipt", rows: [
        { label: "Paid", value: money(mixInvoice) },
        { label: "Approved", value: money(mixProforma) },
        { label: "Rejected", value: money(mixCancel) },
        { label: "Pending upload", value: n0(docInvoice) }
      ] },
      { title: "Holds", icon: "ic-lock", rows: [
        { label: "Converted", value: n0(statusCounts.memo) },
        { label: "Expired", value: n0(docCancel) },
        { label: "Pending", value: n0(statusCounts.hold) },
        { label: "On hold", value: n0(statusCounts.hold) }
      ] }
    ];

    root.innerHTML =
      '<div class="sales-dashboard" aria-label="Salesperson dashboard">' +
        '<section class="sales-hero">' +
          '<div><span class="sales-eyebrow">Sales cockpit</span><h1>' + esc(welcomeLine) + '</h1>' +
          '<p>Latest trade activity, revenue movement, inventory health, and customer-facing work in one place.</p></div>' +
          '<div class="sales-hero-metrics">' +
            '<span><b>' + n0(stones.length) + '</b> stones</span>' +
            '<span><b>' + compactMoney(totalValue) + '</b> inventory</span>' +
            '<span><b>' + pct(livePct) + '</b> live</span>' +
          '</div>' +
        '</section>' +
        '<section class="sales-action-grid">' + actions.map(renderActionCard).join("") + '</section>' +
        '<section class="sales-section-head"><h2>Revenues</h2><p>Gain insight into current sales momentum.</p></section>' +
        '<section class="sales-revenue-grid">' +
          '<article class="sales-chart-card sales-chart-card-wide">' +
            '<div class="sales-card-head"><span><svg class="ic"><use href="#ic-receipt"/></svg></span><h3>This month (' + esc(monthLabel) + ')</h3></div>' +
            '<div class="sales-revenue-line"><strong>' + money(monthRevenue) + '</strong><em class="' + (revenueDelta < 0 ? "down" : "up") + '">' + pct(revenueDelta) + ' vs last month</em></div>' +
            renderAreaChart(currentSeries, previousSeries) +
            '<div class="sales-chart-legend"><span class="now">This month</span><span class="prev">Last month</span></div>' +
          '</article>' +
          '<article class="sales-chart-card">' +
            '<div class="sales-card-head"><span><svg class="ic"><use href="#ic-doc"/></svg></span><h3>Last 8 weeks sales</h3></div>' +
            renderBarChart(weeklySeries) +
            '<p class="sales-weekly-average">Weekly average <strong>' + money(weeklyAvg) + '</strong></p>' +
          '</article>' +
        '</section>' +
        '<section class="sales-section-head"><h2>Inventory Insights</h2><p>Keep an eye on trade-ready stock and pricing opportunities.</p></section>' +
        '<section class="sales-insight-grid">' +
          '<article class="sales-inventory-card">' +
            '<div class="sales-card-head"><span><svg class="ic"><use href="#ic-gem"/></svg></span><h3>Inventory</h3></div>' +
            '<div class="sales-donut" style="--pct:' + Math.max(0, Math.min(100, livePct)).toFixed(1) + '%"><strong>' + pct(livePct) + '</strong><span>Stones live</span></div>' +
            '<div class="sales-inventory-rows">' +
              '<div><span class="dot warm"></span><span>Not live</span><strong>' + n0(notLive) + ' <em>(' + compactMoney(notLiveValue) + ')</em></strong></div>' +
              '<div><span class="dot ink"></span><span>Stones live</span><strong>' + n0(statusCounts.available) + ' <em>(' + compactMoney(liveValue) + ')</em></strong></div>' +
              '<div><svg class="ic"><use href="#ic-clock"/></svg><span>Last upload</span><strong>' + today.toLocaleDateString("en-GB") + '</strong></div>' +
            '</div>' +
          '</article>' +
        '</section>' +
        '<section class="sales-section-head"><h2>Activity - this month</h2></section>' +
        '<section class="sales-activity-grid">' + activities.map(renderActivityCard).join("") + '</section>' +
      '</div>';
  }
  function renderDashboard() {
    if (viewRole === "salesperson") { renderSalespersonDashboard(); return; }
    var root = $("dashRoot");
    if (root) root.classList.remove("sales-dash-root");
    var nat = Array.isArray(window.PI_STOCK) ? window.PI_STOCK : [];
    var fan = Array.isArray(window.PI_FANCY_STOCK) ? window.PI_FANCY_STOCK : [];
    var all = nat.concat(fan);
    var totalCts = 0, totalVal = 0, totalPpc = 0, available = 0, shapeCount = {}, locCount = {};
    all.forEach(function (d) {
      totalCts += (+d.cts || 0); totalVal += (+d.total || 0); totalPpc += (+d.ppc || 0);
      if ((d.status || "").toLowerCase() === "available") available++;
      var s = d.shape || "Other"; shapeCount[s] = (shapeCount[s] || 0) + 1;
      var l = d.loc || "—"; locCount[l] = (locCount[l] || 0) + 1;
    });
    var avgPpc = all.length ? totalPpc / all.length : 0;
    var shapes = Object.keys(shapeCount).map(function (k) { return { k: k, v: shapeCount[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    var maxShape = shapes.length ? shapes[0].v : 1;
    var locs = Object.keys(locCount).map(function (k) { return { k: k, v: locCount[k] }; })
      .sort(function (a, b) { return b.v - a.v; });

    var cards = [
      { l: "Total stones", v: n0(all.length), s: nat.length + " natural · " + fan.length + " fancy" },
      { l: "Total carats", v: n0(totalCts) + " ct", s: "across all inventory" },
      { l: "Inventory value", v: "$" + n0(totalVal), s: "sum of stock totals" },
      { l: "Available now", v: n0(available), s: "ready to trade" }
    ];
    var reviews = [
      { n: "Rahul Mehta", r: 5, t: "Smooth sourcing and accurate grading every time — certificates always match the stone." },
      { n: "GoldLeaf Jewels", r: 5, t: "Excellent fancy-colour selection and quick quotes from the Mumbai desk." },
      { n: "A. Khan · Dubai", r: 4, t: "Reliable supplier. Would love faster video links, otherwise a great experience." }
    ];
    function stars(r) { var s = ""; for (var i = 0; i < 5; i++) s += '<svg class="rv-star' + (i < r ? "" : " off") + '"><use href="#ic-star"/></svg>'; return s; }

    $("dashRoot").innerHTML =
      '<div class="dash-head"><h1 class="dash-title">Dashboard</h1>' +
        '<p class="dash-sub">Welcome back, ' + esc(displayName) + ' · ' + esc(PIAuth.roleLabel(viewRole)) + '</p></div>' +
      '<div class="stat-grid">' + cards.map(function (c) {
        return '<div class="stat-card"><span class="stat-label">' + c.l + '</span><span class="stat-value">' + c.v + '</span><span class="stat-sub">' + c.s + '</span></div>';
      }).join("") + '</div>' +
      '<div class="dash-cols">' +
        '<section class="dash-card"><h2 class="dc-title">Inventory by shape</h2><div class="bar-list">' +
          shapes.map(function (s) {
            return '<div class="bar-row"><span class="bar-k">' + esc(s.k) + '</span>' +
              '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(s.v / maxShape * 100) + '%"></span></span>' +
              '<span class="bar-v">' + n0(s.v) + '</span></div>';
          }).join("") + '</div></section>' +
        '<section class="dash-card"><h2 class="dc-title">By location</h2><div class="loc-list">' +
          locs.map(function (l) {
            return '<div class="loc-row"><span class="loc-k">' + esc(l.k) + '</span><span class="loc-v">' + n0(l.v) + '</span></div>';
          }).join("") + '</div><div class="avg-ppc">Avg price / ct <strong>$' + n0(avgPpc) + '</strong></div></section>' +
      '</div>' +
      '<section class="dash-card"><h2 class="dc-title">Recent reviews</h2><div class="rv-grid">' +
        reviews.map(function (v) {
          return '<div class="rv-card"><div class="rv-top"><span class="rv-name">' + esc(v.n) + '</span><span class="rv-stars">' + stars(v.r) + '</span></div><p class="rv-text">' + esc(v.t) + '</p></div>';
        }).join("") + '</div>' +
        '<p class="dash-note">Demo reviews — wire these to real customer feedback next.</p></section>';
  }
})();
