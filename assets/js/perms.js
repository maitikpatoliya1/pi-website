/* ============================================================
   Pansuriya Impex — page permissions (Supabase-backed)
   ------------------------------------------------------------
   PAGES is client-side UI metadata; the role -> pages matrix lives
   in the role_permissions table. Call PIPerms.load() once after sign
   in to cache it, then the sync helpers (matrix/allowedPages/
   canAccess) read the cache. setRolePages writes to the DB (admins).
   ============================================================ */
(function (global) {
  "use strict";
  function sb() { return global.PI_SB; }

  var PAGES = [
    { id: "dashboard", label: "Dashboard",      icon: "ic-gauge" },
    { id: "inventory", label: "Stock",          icon: "ic-list" },
    { id: "cart",      label: "Cart",           icon: "ic-cart" },
    { id: "orders",    label: "Confirmations",  icon: "ic-clipboard" },
    { id: "users",     label: "User Management", icon: "ic-users" }
  ];
  var ADMIN_ONLY = ["users"];
  var DEFAULTS = {
    admin:         ["dashboard", "inventory", "cart", "orders", "users"],
    stock_manager: ["dashboard", "inventory", "cart", "orders"],
    salesperson:   ["dashboard", "inventory", "cart", "orders"],
    customer:      ["inventory", "cart"]
  };

  function withDefaults(m) {
    Object.keys(DEFAULTS).forEach(function (role) { if (!m[role]) m[role] = DEFAULTS[role].slice(); });
    m.admin = PAGES.map(function (p) { return p.id; }); // admin always full access
    m.customer = (m.customer || []).filter(function (id) { return id !== "dashboard"; });
    return m;
  }
  var cache = null;

  var PIPerms = {
    PAGES: PAGES,
    ADMIN_ONLY: ADMIN_ONLY,
    pageById: function (id) { for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return PAGES[i]; return null; },
    isEditable: function (role, pageId) {
      if (role === "admin") return false;
      if (role === "customer" && pageId === "dashboard") return false;
      return ADMIN_ONLY.indexOf(pageId) === -1;
    },

    // fetch the matrix from the DB and cache it
    load: function () {
      return sb().from("role_permissions").select("role,pages").then(function (r) {
        var m = {};
        (r.data || []).forEach(function (row) { m[row.role] = row.pages || []; });
        cache = withDefaults(m);
        return cache;
      }).catch(function () { cache = withDefaults({}); return cache; });
    },
    matrix: function () { return cache || withDefaults({}); },
    allowedPages: function (role) {
      var ids = PIPerms.matrix()[role] || [];
      return PAGES.filter(function (p) { return ids.indexOf(p.id) > -1; });
    },
    canAccess: function (role, pageId) {
      if (role === "admin") return true;
      return (PIPerms.matrix()[role] || []).indexOf(pageId) > -1;
    },
    setRolePages: function (role, pageIds) {
      if (role === "admin") return Promise.resolve(false);
      var clean = pageIds.filter(function (id) { return ADMIN_ONLY.indexOf(id) === -1; });
      if (role === "customer") clean = clean.filter(function (id) { return id !== "dashboard"; });
      if (cache) cache[role] = clean;
      return sb().from("role_permissions").update({ pages: clean }).eq("role", role)
        .then(function (r) { return !r.error; });
    }
  };
  global.PIPerms = PIPerms;
})(window);
