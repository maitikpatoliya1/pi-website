/* ============================================================
   Pansuriya Impex — User Management (in-page, admin) — Supabase
   ------------------------------------------------------------
   Sub-tabs: Applications (search + approve/reject KYC + roles) and
   Role Permissions (role x page matrix). Reads/writes the database
   via PIAuth + PIPerms. Exposes window.PIUserMgmt.render().
   ============================================================ */
(function (global) {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function sb() { return global.PI_SB; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var activeSub = "applications";
  var activeFilter = "pending";
  var searchQuery = "";

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

    var me = PIAuth.currentProfile && PIAuth.currentProfile();
    var canRemove = a.id && (!me || a.id !== me.id);
    var removeBtn = canRemove
      ? '<button type="button" class="um-remove" data-del="' + esc(a.id) +
        '" data-name="' + esc(a.company || fullName(a) || a.username) +
        '" title="Delete account" aria-label="Delete account"><svg class="ic"><use href="#ic-x"/></svg></button>'
      : "";

    return '<article class="um-card"><div class="um-card-top">' +
      '<div><div class="um-company">' + esc(a.company || a.username) + '</div>' +
        '<div class="um-person">' + esc(fullName(a)) + " · " + esc(a.email) + "</div></div>" +
      '<div class="um-badges"><span class="um-badge role">' + esc(PIAuth.roleLabel(a.role)) + '</span>' +
        '<span class="um-badge ' + a.status + '">' + a.status + "</span>" + removeBtn + "</div></div>" +
      '<dl class="um-detail">' + details + "</dl>" +
      (docs ? '<div class="um-docs">' + docs + "</div>" : "") +
      '<div class="um-actions"><label class="um-rolepick">Role' +
        '<select data-role-for="' + esc(a.username) + '">' + roleOptions(a.role) + "</select></label>" + actions + "</div></article>";
  }

  function matchesSearch(a) {
    var q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    var hay = [a.company, a.username, a.email, fullName(a), a.phone, a.countryCode,
      a.taxId1, a.taxId2, a.city, a.state, a.country, a.location, PIAuth.roleLabel(a.role)]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(q) > -1;
  }
  function pillsHTML(counts) {
    return [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(function (p) {
      return '<button class="um-pill' + (activeFilter === p[0] ? " active" : "") + '" data-filter="' + p[0] + '">' + p[1] +
        ' <span class="um-cnt">' + counts[p[0]] + "</span></button>";
    }).join("");
  }

  // fetch all accounts + their documents, then paint pills + list
  function updateApplications() {
    var listEl = $("umList");
    if (listEl && !listEl.innerHTML) listEl.innerHTML = '<div class="um-empty"><p>Loading…</p></div>';

    return Promise.all([
      PIAuth.listAccounts(),
      sb().from("documents").select("profile_id,doc_type,file_name").then(function (r) { return r.data || []; })
    ]).then(function (out) {
      var all = out[0], allDocs = out[1];
      var byProfile = {};
      allDocs.forEach(function (d) { (byProfile[d.profile_id] = byProfile[d.profile_id] || []).push({ type: d.doc_type, name: d.file_name }); });
      all.forEach(function (a) { a.documents = byProfile[a.id] || []; });

      var counts = { pending: 0, approved: 0, rejected: 0, all: all.length };
      all.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });

      var pillsEl = $("umPills");
      if (pillsEl) {
        pillsEl.innerHTML = pillsHTML(counts);
        Array.prototype.forEach.call(pillsEl.querySelectorAll(".um-pill"), function (b) {
          b.addEventListener("click", function () { activeFilter = b.getAttribute("data-filter"); updateApplications(); });
        });
      }

      var base = activeFilter === "all" ? all : all.filter(function (a) { return a.status === activeFilter; });
      var list = base.filter(matchesSearch);
      var el = $("umList");
      if (!el) return;
      if (!list.length) {
        var m = searchQuery.trim() ? 'No results for &ldquo;' + esc(searchQuery.trim()) + '&rdquo;.'
          : "No " + (activeFilter === "all" ? "" : activeFilter + " ") + "applications.";
        el.innerHTML = '<div class="um-empty"><svg class="ic"><use href="#ic-inbox"/></svg><p>' + m + "</p></div>";
      } else {
        el.innerHTML = list.map(cardHTML).join("");
      }
      Array.prototype.forEach.call(el.querySelectorAll("[data-act]"), function (b) {
        b.addEventListener("click", function () {
          b.disabled = true;
          PIAuth.setStatus(b.getAttribute("data-u"), b.getAttribute("data-act")).then(updateApplications);
        });
      });
      Array.prototype.forEach.call(el.querySelectorAll("[data-role-for]"), function (sel) {
        sel.addEventListener("change", function () {
          PIAuth.setRole(sel.getAttribute("data-role-for"), sel.value).then(updateApplications);
        });
      });
      Array.prototype.forEach.call(el.querySelectorAll("[data-del]"), function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-del");
          var name = b.getAttribute("data-name") || "this account";
          if (!global.confirm('Permanently delete "' + name + '"?\n\nThis removes their login and all of their data. This cannot be undone.')) return;
          b.disabled = true;
          sb().functions.invoke("delete-user", { body: { id: id } }).then(function (r) {
            if (r.data && r.data.ok) { updateApplications(); return; }
            b.disabled = false;
            var emsg = (r.data && r.data.error) || (r.error && r.error.message) || "Please try again.";
            global.alert("Could not delete the account: " + emsg);
          }).catch(function (e) {
            b.disabled = false;
            global.alert("Could not delete the account: " + (e && e.message ? e.message : e));
          });
        });
      });
    }).catch(function (err) {
      var el = $("umList");
      if (el) el.innerHTML = '<div class="um-empty"><p>Could not load accounts: ' + esc(err.message || err) + "</p></div>";
    });
  }

  function renderApplications() {
    $("umBody").innerHTML =
      '<div class="um-toolbar">' +
        '<div class="um-search"><svg class="ic"><use href="#ic-search"/></svg>' +
          '<input id="umSearch" type="search" autocomplete="off" placeholder="Search company, name, email, username…" value="' + esc(searchQuery) + '"></div>' +
        '<div class="um-pills" id="umPills"></div>' +
      "</div>" +
      '<div class="um-list" id="umList"></div>';
    var s = $("umSearch");
    s.addEventListener("input", function () { searchQuery = s.value; updateApplications(); });
    updateApplications();
  }

  function renderPermissions() {
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

    $("umBody").innerHTML =
      '<p class="um-hint">Tick which pages each role can open from the menu. The Admin row is locked to full access so no one gets locked out.</p>' +
      '<div class="perm-wrap"><table class="perm-table"><thead><tr>' + head + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="dash-note">Changes save to the database and apply the next time that role opens the menu.</p>';

    Array.prototype.forEach.call($("umBody").querySelectorAll(".perm-box input"), function (cb) {
      cb.addEventListener("change", function () {
        var rl = cb.getAttribute("data-role"), picked = [];
        Array.prototype.forEach.call($("umBody").querySelectorAll('.perm-box input[data-role="' + rl + '"]'), function (x) {
          if (x.checked) picked.push(x.getAttribute("data-page"));
        });
        PIPerms.setRolePages(rl, picked);
      });
    });
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
      '<div class="um-body" id="umBody"></div>';

    Array.prototype.forEach.call(root.querySelectorAll(".um-subtab"), function (b) {
      b.addEventListener("click", function () {
        activeSub = b.getAttribute("data-sub");
        Array.prototype.forEach.call(root.querySelectorAll(".um-subtab"), function (x) { x.classList.toggle("active", x === b); });
        if (activeSub === "applications") renderApplications(); else renderPermissions();
      });
    });

    if (activeSub === "applications") renderApplications(); else renderPermissions();
  }

  global.PIUserMgmt = { render: renderRoot };
})(window);
