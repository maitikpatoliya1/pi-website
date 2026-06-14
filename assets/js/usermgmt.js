/* ============================================================
   Pansuriya Impex — User Management (in-page, admin only)
   ------------------------------------------------------------
   Rendered into #umRoot inside stock.html. Two sub-tabs:
     • Applications — approve/reject KYC + assign roles
     • Role Permissions — choose which pages each role can open
   Exposes window.PIUserMgmt.render(). Backed by PIAuth + PIPerms.
   ============================================================ */
(function (global) {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var activeSub = "applications";
  var activeFilter = "pending";

  function roleOptions(cur) {
    return PIAuth.ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === cur ? " selected" : "") + ">" + esc(PIAuth.roleLabel(r)) + "</option>";
    }).join("");
  }
  function row(l, v) { return v ? "<div><dt>" + esc(l) + "</dt><dd>" + esc(v) + "</dd></div>" : ""; }
  function fullName(a) { return [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" ") || a.username; }
  function place(a) { return [a.city, a.state, a.country].filter(Boolean).join(", "); }
  function when(ts) { if (!ts) return ""; try { return new Date(ts).toLocaleString(); } catch (e) { return ""; } }

  function cardHTML(a) {
    var docs = (a.documents || []).map(function (d) {
      return '<span class="um-doc"><svg class="ic"><use href="#ic-doc"/></svg>' + esc(d.type) + " — " + esc(d.name) + "</span>";
    }).join("");
    var details =
      row("Username", a.username) + row("Email", a.email) +
      row("Phone", (a.countryCode ? a.countryCode + " " : "") + (a.phone || "")) +
      row("Location", a.location) + row("City / State / Country", place(a)) + row("Pincode", a.pincode) +
      row("Jurisdiction", a.jurisdiction) + row(a.taxLabel1 || "Tax ID", a.taxId1) + row(a.taxLabel2 || "Tax ID", a.taxId2) +
      row("Address", a.address) + row("Emergency contact", a.emergencyName) + row("Emergency phone", a.emergencyPhone) +
      row("Applied", when(a.createdAt));

    var actions;
    if (a.status === "pending") {
      actions = '<button class="um-approve" data-act="approved" data-u="' + esc(a.username) + '"><svg class="ic"><use href="#ic-check"/></svg> Approve</button>' +
                '<button class="um-reject" data-act="rejected" data-u="' + esc(a.username) + '"><svg class="ic"><use href="#ic-x"/></svg> Reject</button>';
    } else if (a.status === "approved") {
      actions = '<button class="um-reject" data-act="rejected" data-u="' + esc(a.username) + '"><svg class="ic"><use href="#ic-x"/></svg> Revoke access</button>';
    } else {
      actions = '<button class="um-approve" data-act="approved" data-u="' + esc(a.username) + '"><svg class="ic"><use href="#ic-check"/></svg> Approve</button>';
    }

    return '<article class="um-card"><div class="um-card-top">' +
      '<div><div class="um-company">' + esc(a.company || a.username) + '</div>' +
        '<div class="um-person">' + esc(fullName(a)) + " · " + esc(a.email) + "</div></div>" +
      '<div class="um-badges"><span class="um-badge role">' + esc(PIAuth.roleLabel(a.role)) + '</span>' +
        '<span class="um-badge ' + a.status + '">' + a.status + "</span></div></div>" +
      '<dl class="um-detail">' + details + "</dl>" +
      (docs ? '<div class="um-docs">' + docs + "</div>" : "") +
      '<div class="um-actions"><label class="um-rolepick">Role' +
        '<select data-role-for="' + esc(a.username) + '">' + roleOptions(a.role) + "</select></label>" + actions + "</div></article>";
  }

  function applicationsHTML() {
    var all = PIAuth.listAccounts();
    var counts = { pending: 0, approved: 0, rejected: 0, all: all.length };
    all.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });
    var list = activeFilter === "all" ? all : all.filter(function (a) { return a.status === activeFilter; });
    var pills = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(function (p) {
      return '<button class="um-pill' + (activeFilter === p[0] ? " active" : "") + '" data-filter="' + p[0] + '">' + p[1] +
        ' <span class="um-cnt">' + counts[p[0]] + "</span></button>";
    }).join("");
    var body = list.length ? list.map(cardHTML).join("") :
      '<div class="um-empty"><svg class="ic"><use href="#ic-inbox"/></svg><p>No ' + (activeFilter === "all" ? "" : activeFilter + " ") + "applications.</p></div>";
    return '<div class="um-pills">' + pills + '</div><div class="um-list">' + body + "</div>";
  }

  function permsHTML() {
    var PAGES = PIPerms.PAGES, m = PIPerms.matrix();
    var head = "<th>Role</th>" + PAGES.map(function (p) { return "<th>" + esc(p.label) + "</th>"; }).join("");
    var rows = PIAuth.ROLES.map(function (rl) {
      var cells = PAGES.map(function (p) {
        var on = (m[rl] || []).indexOf(p.id) > -1;
        var editable = PIPerms.isEditable(rl, p.id);
        return '<td><label class="perm-box"><input type="checkbox" data-role="' + rl + '" data-page="' + p.id + '"' +
          (on ? " checked" : "") + (editable ? "" : " disabled") + "><span></span></label></td>";
      }).join("");
      return '<tr><th class="perm-role">' + esc(PIAuth.roleLabel(rl)) + "</th>" + cells + "</tr>";
    }).join("");
    return '<p class="um-hint">Tick which pages each role can open from the menu. The Admin row is locked to full access so no one gets locked out.</p>' +
      '<div class="perm-wrap"><table class="perm-table"><thead><tr>' + head + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="dash-note">Changes save instantly and apply to that role the next time they open the menu.</p>';
  }

  function renderRoot() {
    var root = $("umRoot");
    if (!root) return;
    root.innerHTML =
      '<div class="um-head"><h1 class="um-title">User Management</h1>' +
        '<p class="um-sub">Approve KYC applications, assign roles, and control which pages each role can see.</p></div>' +
      '<div class="um-subtabs">' +
        '<button class="um-subtab' + (activeSub === "applications" ? " active" : "") + '" data-sub="applications"><svg class="ic"><use href="#ic-users"/></svg> Applications</button>' +
        '<button class="um-subtab' + (activeSub === "permissions" ? " active" : "") + '" data-sub="permissions"><svg class="ic"><use href="#ic-shield"/></svg> Role Permissions</button>' +
      "</div>" +
      '<div class="um-body">' + (activeSub === "applications" ? applicationsHTML() : permsHTML()) + "</div>";
    wire(root);
  }

  function wire(root) {
    Array.prototype.forEach.call(root.querySelectorAll(".um-subtab"), function (b) {
      b.addEventListener("click", function () { activeSub = b.getAttribute("data-sub"); renderRoot(); });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".um-pill"), function (b) {
      b.addEventListener("click", function () { activeFilter = b.getAttribute("data-filter"); renderRoot(); });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-act]"), function (b) {
      b.addEventListener("click", function () { PIAuth.setStatus(b.getAttribute("data-u"), b.getAttribute("data-act")); renderRoot(); });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-role-for]"), function (sel) {
      sel.addEventListener("change", function () { PIAuth.setRole(sel.getAttribute("data-role-for"), sel.value); renderRoot(); });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".perm-box input"), function (cb) {
      cb.addEventListener("change", function () {
        var rl = cb.getAttribute("data-role"), picked = [];
        Array.prototype.forEach.call(root.querySelectorAll('.perm-box input[data-role="' + rl + '"]'), function (x) {
          if (x.checked) picked.push(x.getAttribute("data-page"));
        });
        PIPerms.setRolePages(rl, picked);
      });
    });
  }

  global.PIUserMgmt = { render: renderRoot };
})(window);
