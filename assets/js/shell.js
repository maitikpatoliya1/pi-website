/* ============================================================
   Pansuriya Impex — app shell for the main page (stock.html)
   ------------------------------------------------------------
   • Top-left Menu button opens a left navigation drawer.
   • The drawer shows only the pages the signed-in role may access
     (per PIPerms), switches between in-page views, and signs out.
   • Renders the Dashboard view (live inventory stats + reviews).
   ============================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  if (!window.PIAuth) return;

  var user = PIAuth.currentUser();
  var role = PIAuth.currentRole() || "customer";
  var acct = PIAuth.getAccount(user) || {};
  var displayName = [acct.firstName, acct.lastName].filter(Boolean).join(" ") || user || "User";

  /* ---------- drawer identity ---------- */
  $("smName").textContent = displayName;
  $("smRole").textContent = PIAuth.roleLabel(role);
  $("smAvatar").textContent = (displayName.charAt(0) || "U").toUpperCase();

  /* ---------- nav from permissions ---------- */
  var pages = window.PIPerms ? PIPerms.allowedPages(role) : [];
  var ids = pages.map(function (p) { return p.id; });
  var nav = $("smNav");
  nav.innerHTML = pages.map(function (p) {
    return '<button class="sm-link" data-view="' + p.id + '">' +
      '<svg class="ic"><use href="#' + p.icon + '"/></svg><span>' + esc(p.label) + '</span></button>';
  }).join("");

  /* ---------- view switching ---------- */
  var VIEWS = ["dashboard", "inventory", "users"];
  var dashRendered = false;
  function allowed(id) { return role === "admin" || (window.PIPerms && PIPerms.canAccess(role, id)); }
  function resolve(id) { return (id && allowed(id)) ? id : (ids[0] || "inventory"); }

  function showView(reqId) {
    var id = resolve(reqId);
    VIEWS.forEach(function (v) { var el = $("view-" + v); if (el) el.hidden = (v !== id); });
    Array.prototype.forEach.call(nav.querySelectorAll(".sm-link"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === id);
    });
    if (id === "dashboard" && !dashRendered) { renderDashboard(); dashRendered = true; }
    if (id === "users" && window.PIUserMgmt) PIUserMgmt.render();
    document.title = (id === "dashboard" ? "Dashboard" : id === "users" ? "User Management" : "Diamond Inventory") + " — Pansuriya Impex";
    try { sessionStorage.setItem("pi_view", id); } catch (e) {}
  }

  /* ---------- drawer open/close ---------- */
  var menu = $("sideMenu"), backdrop = $("drawerBackdrop");
  function openDrawer() { menu.classList.add("open"); backdrop.hidden = false; menu.setAttribute("aria-hidden", "false"); }
  function closeDrawer() { menu.classList.remove("open"); backdrop.hidden = true; menu.setAttribute("aria-hidden", "true"); }
  $("menuBtn").addEventListener("click", openDrawer);
  $("sideClose").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  nav.addEventListener("click", function (e) {
    var b = e.target.closest(".sm-link");
    if (!b) return;
    showView(b.getAttribute("data-view"));
    closeDrawer();
  });

  /* ---------- sign out ---------- */
  $("sideSignOut").addEventListener("click", function () {
    PIAuth.logout();
    location.replace("login.html");
  });

  /* ---------- initial view ---------- */
  var want = null; try { want = sessionStorage.getItem("pi_view"); } catch (e) {}
  var initial = (want && ids.indexOf(want) > -1) ? want : (ids.indexOf("dashboard") > -1 ? "dashboard" : ids[0]);
  showView(initial);

  /* ---------- dashboard ---------- */
  function n0(x) { return (x || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function renderDashboard() {
    var nat = Array.isArray(window.PI_STOCK) ? window.PI_STOCK : [];
    var fan = Array.isArray(window.PI_FANCY_STOCK) ? window.PI_FANCY_STOCK : [];
    var all = nat.concat(fan);
    var totalCts = 0, totalVal = 0, totalPpc = 0, available = 0, shapeCount = {}, locCount = {};
    all.forEach(function (d) {
      totalCts += (+d.cts || 0);
      totalVal += (+d.total || 0);
      totalPpc += (+d.ppc || 0);
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
        '<p class="dash-sub">Welcome back, ' + esc(displayName) + ' · ' + esc(PIAuth.roleLabel(role)) + '</p></div>' +
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
        '<p class="dash-note">Demo reviews — these will pull from real customer feedback once the backend is connected.</p></section>';
  }
})();
