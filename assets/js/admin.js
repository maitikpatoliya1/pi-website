/* ============================================================
   Pansuriya Impex — admin approvals dashboard (DEMO)
   Reviews PIAuth accounts and sets status approved / rejected.
   NOTE: demo only — accounts live in THIS browser's localStorage,
   so this approves the applications created on this device. With a
   real backend (Supabase) this becomes a shared, access-controlled
   admin panel.
   ============================================================ */
(function () {
  "use strict";

  // Demo passcode. With a real backend this is replaced by proper
  // admin authentication / roles.
  var ADMIN_CODE = "pi-admin";
  var GATE_FLAG = "pi_admin_ok";

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- gate ---------- */
  var gateView = $("gateView"), dashView = $("dashView");
  function openDash() {
    gateView.hidden = true;
    dashView.hidden = false;
    render();
  }
  if (sessionStorage.getItem(GATE_FLAG) === "1") openDash();

  $("gateBtn").addEventListener("click", tryGate);
  $("gateCode").addEventListener("keydown", function (e) { if (e.key === "Enter") tryGate(); });
  function tryGate() {
    if ($("gateCode").value === ADMIN_CODE) {
      sessionStorage.setItem(GATE_FLAG, "1");
      openDash();
    } else {
      var m = $("gateMsg");
      m.textContent = "Incorrect passcode.";
      m.classList.add("error", "show");
    }
  }

  /* ---------- tabs ---------- */
  var activeTab = "pending";
  $("adminTabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".admin-tab");
    if (!btn) return;
    activeTab = btn.getAttribute("data-tab");
    Array.prototype.forEach.call(this.querySelectorAll(".admin-tab"), function (b) {
      b.classList.toggle("active", b === btn);
    });
    render();
  });

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function row(label, value) {
    if (!value) return "";
    return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
  }
  function fullName(a) {
    return [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" ") || a.username;
  }
  function place(a) {
    return [a.city, a.state, a.country].filter(Boolean).join(", ");
  }
  function when(ts) {
    if (!ts) return "";
    try { return new Date(ts).toLocaleString(); } catch (e) { return ""; }
  }
  function roleOptions(current) {
    return PIAuth.ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === current ? " selected" : "") + ">" + PIAuth.roleLabel(r) + "</option>";
    }).join("");
  }

  /* ---------- render ---------- */
  function render() {
    var all = window.PIAuth ? PIAuth.listAccounts() : [];
    var counts = { pending: 0, approved: 0, rejected: 0, all: all.length };
    all.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });
    $("cntPending").textContent = counts.pending;
    $("cntApproved").textContent = counts.approved;
    $("cntRejected").textContent = counts.rejected;
    $("cntAll").textContent = counts.all;

    var list = activeTab === "all" ? all : all.filter(function (a) { return a.status === activeTab; });
    var wrap = $("appList");

    if (!list.length) {
      wrap.innerHTML =
        '<div class="admin-empty"><svg><use href="#i-inbox"/></svg>' +
        "<p>No " + (activeTab === "all" ? "" : activeTab + " ") + "applications.</p></div>";
      return;
    }

    wrap.innerHTML = list.map(function (a) {
      var docs = (a.documents || []).map(function (d) {
        return '<span class="app-doc"><svg><use href="#i-doc"/></svg>' + esc(d.type) + " — " + esc(d.name) + "</span>";
      }).join("");

      var details =
        row("Username", a.username) +
        row("Email", a.email) +
        row("Phone", (a.countryCode ? a.countryCode + " " : "") + (a.phone || "")) +
        row("Location", a.location) +
        row("Address", a.address) +
        row("City / State / Country", place(a)) +
        row("Pincode", a.pincode) +
        row("Jurisdiction", a.jurisdiction) +
        row(a.taxLabel1 || "Tax ID", a.taxId1) +
        row(a.taxLabel2 || "Tax ID", a.taxId2) +
        row("Fax", a.fax) +
        row("Emergency contact", a.emergencyName) +
        row("Emergency phone", a.emergencyPhone) +
        row("Emergency address", a.emergencyAddress) +
        row("Applied", when(a.createdAt));

      var actions;
      if (a.status === "pending") {
        actions =
          '<button class="btn-approve" data-act="approved" data-u="' + esc(a.username) + '"><svg><use href="#i-check"/></svg> Approve</button>' +
          '<button class="btn-reject" data-act="rejected" data-u="' + esc(a.username) + '"><svg><use href="#i-x"/></svg> Reject</button>';
      } else if (a.status === "approved") {
        actions = '<button class="btn-reject" data-act="rejected" data-u="' + esc(a.username) + '"><svg><use href="#i-x"/></svg> Revoke access</button>';
      } else {
        actions = '<button class="btn-approve" data-act="approved" data-u="' + esc(a.username) + '"><svg><use href="#i-check"/></svg> Approve</button>';
      }

      return '<article class="app-card">' +
        '<div class="app-card-top">' +
          '<div><div class="app-company">' + esc(a.company || a.username) + "</div>" +
            '<div class="app-person">' + esc(fullName(a)) + " · " + esc(a.email) + "</div></div>" +
          '<div class="badges">' +
            '<span class="badge role">' + esc(PIAuth.roleLabel(a.role)) + "</span>" +
            '<span class="badge ' + a.status + '">' + a.status + "</span>" +
          "</div>" +
        "</div>" +
        '<dl class="app-detail">' + details + "</dl>" +
        (docs ? '<div class="app-docs">' + docs + "</div>" : "") +
        '<div class="app-actions">' +
          '<label class="role-pick">Role' +
            '<select data-role-for="' + esc(a.username) + '">' + roleOptions(a.role) + "</select>" +
          "</label>" +
          actions +
        "</div>" +
      "</article>";
    }).join("");

    Array.prototype.forEach.call(wrap.querySelectorAll("[data-act]"), function (btn) {
      btn.addEventListener("click", function () {
        PIAuth.setStatus(btn.getAttribute("data-u"), btn.getAttribute("data-act"));
        render();
      });
    });
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-role-for]"), function (sel) {
      sel.addEventListener("change", function () {
        PIAuth.setRole(sel.getAttribute("data-role-for"), sel.value);
        render();
      });
    });
  }
})();
