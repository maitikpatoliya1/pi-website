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
    var VIEWS = ["dashboard", "inventory", "users"];
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
      if (r === "salesperson" && ids.indexOf("dashboard") > -1) return "dashboard";
      return ids.indexOf("inventory") > -1 ? "inventory" : (ids[0] || "inventory");
    }

    function renderNav() {
      var pages = pagesFor(viewRole);
      currentIds = pages.map(function (p) { return p.id; });
      nav.innerHTML = pages.map(function (p) {
        return '<button class="sm-link" data-view="' + p.id + '"><svg class="ic"><use href="#' + p.icon + '"/></svg><span>' + esc(p.label) + '</span></button>';
      }).join("");
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
      if (id === "users" && window.PIUserMgmt) PIUserMgmt.render();
      document.title = (id === "dashboard" ? "Dashboard" : id === "users" ? "User Management" : "Diamond Inventory") + " — Pansuriya Impex";
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
      PIAuth.logout().then(function () { location.replace("login.html"); });
    });

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

    /* initial render */
    renderNav();
    updateRoleLabel();
    showView(defaultViewFor(viewRole));
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
    return nat.concat(fan);
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
  function renderSalesStatCard(card) {
    return '<article class="sales-stat-card ' + esc(card.tone || "neutral") + '">' +
      (card.icon ? '<span class="sales-stat-icon"><svg class="ic"><use href="#' + card.icon + '"/></svg></span>' : '') +
      '<span class="sales-stat-label">' + esc(card.label) + '</span>' +
      '<span class="sales-stat-sub">' + esc(card.sub) + '</span>' +
      '<strong class="sales-stat-value">' + esc(card.value) + '</strong>' +
    '</article>';
  }
  function renderSalespersonDashboard() {
    var statusCounts = { memo: 0, memo_out: 0, hold: 0, offer: 0 };
    allStones().forEach(function (d) {
      var st = normalizeStatus(d.status);
      if (st === "memo") statusCounts.memo++;
      if (st === "memo_out" || st === "memoout") statusCounts.memo_out++;
      if (st === "hold") statusCounts.hold++;
      if (st === "offer") statusCounts.offer++;
    });

    var salesDocs = [
      { label: "Proforma", sub: "Generated today", value: n0(storeNumber(["salesDocuments.proforma", "documents.proforma", "proforma"])), tone: "good", icon: "ic-doc" },
      { label: "Invoice Stones", sub: "Invoiced today", value: n0(storeNumber(["salesDocuments.invoiceStones", "documents.invoiceStones", "invoiceStones"])), tone: "good", icon: "ic-receipt" },
      { label: "Cancel Sell", sub: "Cancelled sales today", value: n0(storeNumber(["salesDocuments.cancelSell", "documents.cancelSell", "cancelSell"])), tone: "neutral", icon: "ic-xcircle" }
    ];
    var mixSales = [
      { label: "Mix Proforma", sub: "Amount for today's proforma", value: money(storeNumber(["mixSaleAmounts.proforma", "amounts.mixProforma", "mixProforma"])), tone: "warm", icon: "ic-doc" },
      { label: "Mix Invoice", sub: "Amount for today's invoice", value: money(storeNumber(["mixSaleAmounts.invoice", "amounts.mixInvoice", "mixInvoice"])), tone: "warm", icon: "ic-receipt" },
      { label: "Mix Cancel Sell", sub: "Cancelled mix sales amount", value: money(storeNumber(["mixSaleAmounts.cancelSell", "amounts.mixCancelSell", "mixCancelSell"])), tone: "neutral", icon: "ic-xcircle" }
    ];
    var ops = [
      { label: "Memo Stones", sub: "Current memo activity", value: n0(statusCounts.memo), tone: "blue", icon: "ic-clipboard" },
      { label: "Memo Out Stones", sub: "Stones currently sent out", value: n0(statusCounts.memo_out), tone: "blue", icon: "ic-arrowout" },
      { label: "Hold Stones", sub: "Reserved and blocked inventory", value: n0(statusCounts.hold), tone: "orange", icon: "ic-lock" },
      { label: "Offer Stones", sub: "Active offers in pipeline", value: n0(statusCounts.offer), tone: "olive", icon: "ic-tag" }
    ];

    $("dashRoot").innerHTML =
      '<div class="sales-dashboard" aria-label="Salesperson dashboard">' +
        '<div class="sales-stack">' +
          '<section class="sales-panel sales-docs-panel">' +
            '<h1 class="sales-panel-title">Sales Documents</h1>' +
            '<p class="sales-panel-sub">Daily document counts from the dashboard store.</p>' +
            '<div class="sales-card-grid">' + salesDocs.map(renderSalesStatCard).join("") + '</div>' +
          '</section>' +
          '<section class="sales-panel sales-mix-panel">' +
            '<h2 class="sales-panel-title">Mix Sale Amounts</h2>' +
            '<p class="sales-panel-sub">Amounts surfaced as cards since this data is stronger than a chart.</p>' +
            '<div class="sales-card-grid">' + mixSales.map(renderSalesStatCard).join("") + '</div>' +
          '</section>' +
        '</div>' +
        '<section class="sales-panel sales-ops-panel">' +
          '<h2 class="sales-panel-title">Operations Snapshot</h2>' +
          '<p class="sales-panel-sub">Quick access to the main count-based dashboard stats.</p>' +
          '<div class="sales-card-grid sales-card-grid-ops">' + ops.map(renderSalesStatCard).join("") + '</div>' +
        '</section>' +
      '</div>';
  }
  function renderDashboard() {
    if (viewRole === "salesperson") { renderSalespersonDashboard(); return; }
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
