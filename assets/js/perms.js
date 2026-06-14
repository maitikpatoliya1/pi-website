/* ============================================================
   Pansuriya Impex — page permissions (role -> pages)
   ------------------------------------------------------------
   Defines the pages that can appear in the main left menu and a
   role->pages matrix that decides which menu items each role sees.
   The admin can edit this matrix from User Management; overrides are
   saved in localStorage. Admin always has access to everything (so
   an admin can never lock themselves out).
   (Demo: stored per-browser. With Supabase this moves to a shared,
   server-enforced policy table.)
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "pi_perms";

  // The catalogue of navigable pages/sections in the app shell.
  var PAGES = [
    { id: "dashboard", label: "Dashboard",       icon: "ic-gauge" },
    { id: "inventory", label: "Stock",           icon: "ic-list" },
    { id: "users",     label: "User Management",  icon: "ic-users" }
  ];

  // Default visibility per role.
  var DEFAULTS = {
    admin:         ["dashboard", "inventory", "users"],
    stock_manager: ["dashboard", "inventory"],
    salesperson:   ["inventory"],
    customer:      ["inventory"]
  };

  // "users" is admin-only and not toggleable for other roles, to keep
  // user/role management restricted.
  var ADMIN_ONLY = ["users"];

  function read() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || "null"); return o && typeof o === "object" ? o : null; }
    catch (e) { return null; }
  }
  function write(m) { localStorage.setItem(KEY, JSON.stringify(m)); }

  function matrix() {
    var stored = read() || {};
    var m = {};
    Object.keys(DEFAULTS).forEach(function (role) {
      m[role] = Array.isArray(stored[role]) ? stored[role].slice() : DEFAULTS[role].slice();
    });
    // admin is always full access
    m.admin = PAGES.map(function (p) { return p.id; });
    return m;
  }

  var PIPerms = {
    PAGES: PAGES,
    ADMIN_ONLY: ADMIN_ONLY,
    pageById: function (id) {
      for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return PAGES[i];
      return null;
    },
    isEditable: function (role, pageId) {
      // admin row is fixed; admin-only pages can't be granted to others
      if (role === "admin") return false;
      return ADMIN_ONLY.indexOf(pageId) === -1;
    },
    matrix: matrix,
    allowedPages: function (role) {
      var ids = matrix()[role] || [];
      return PAGES.filter(function (p) { return ids.indexOf(p.id) > -1; });
    },
    canAccess: function (role, pageId) {
      if (role === "admin") return true;
      return (matrix()[role] || []).indexOf(pageId) > -1;
    },
    /** Replace the page list for a role. Admin is not editable. */
    setRolePages: function (role, pageIds) {
      if (role === "admin") return false;
      var stored = read() || {};
      // never allow admin-only pages onto another role
      stored[role] = pageIds.filter(function (id) { return ADMIN_ONLY.indexOf(id) === -1; });
      write(stored);
      return true;
    },
    resetDefaults: function () { localStorage.removeItem(KEY); }
  };

  global.PIPerms = PIPerms;
})(window);
