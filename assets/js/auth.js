/* ============================================================
   Pansuriya Impex — authentication + accounts (LOCAL / NO-DATABASE)
   ------------------------------------------------------------
   The Supabase backend has been removed "for now". There is no
   real sign-up/approval/login anymore: ANY username + password is
   accepted and signs you straight in as an approved admin, so the
   whole app is usable without a backend.

   The session + any registered accounts are kept in localStorage
   only (this browser), purely so pages like stock.html / admin.html
   stop bouncing back to the login screen. Nothing leaves the browser.
   The method surface (login, getSession, fetchOwnProfile, logout,
   register, listAccounts, setStatus, setRole, …) is unchanged so the
   rest of the app keeps working.
   ============================================================ */
(function (global) {
  "use strict";

  var ROLES = ["admin", "stock_manager", "salesperson", "customer"];
  var ROLE_LABELS = { admin: "Admin", stock_manager: "Stock Manager", salesperson: "Salesperson", customer: "Customer" };

  var SESSION_KEY = "pi_local_session";
  var ACCOUNTS_KEY = "pi_local_accounts";

  function readJSON(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function getAccounts() { return readJSON(ACCOUNTS_KEY, []); }
  function saveAccounts(list) { writeJSON(ACCOUNTS_KEY, list); }

  // Build an approved-admin profile from whatever identifier was typed.
  function profileFromIdentifier(identifier) {
    identifier = String(identifier || "").trim();
    var isEmail = identifier.indexOf("@") > -1;
    var username = isEmail ? identifier.split("@")[0] : identifier;
    var email = isEmail ? identifier : (username + "@local");
    var existing = getAccounts().filter(function (a) {
      return a.username === username || a.email === email;
    })[0];
    if (existing) {
      // always treat as approved admin for the no-database build
      existing.role = "admin";
      existing.status = "approved";
      return existing;
    }
    return {
      id: "local-" + username,
      username: username,
      email: email,
      company: "",
      firstName: "",
      lastName: "",
      role: "admin",
      status: "approved",
      createdAt: Date.now(),
      documents: []
    };
  }

  var cachedProfile = readJSON(SESSION_KEY, null);

  var PIAuth = {
    ROLES: ROLES,
    ROLE_LABELS: ROLE_LABELS,
    roleLabel: function (r) { return ROLE_LABELS[r] || "Customer"; },

    /* ---------- registration (local only) ---------- */
    register: function (profile) {
      var email = String(profile.email || "").trim().toLowerCase();
      var username = String(profile.username || (email ? email.split("@")[0] : "user")).trim();
      var list = getAccounts();
      var record = {
        id: "local-" + username,
        username: username,
        email: email || (username + "@local"),
        company: profile.company || "",
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        role: "admin",
        status: "approved",
        createdAt: Date.now(),
        documents: []
      };
      // upsert by username/email
      list = list.filter(function (a) { return a.username !== username && a.email !== record.email; });
      list.push(record);
      saveAccounts(list);
      // sign them in immediately
      cachedProfile = record;
      writeJSON(SESSION_KEY, record);
      return Promise.resolve({ email: record.email, userId: record.id, needsConfirmation: false });
    },

    // No storage backend — accept and ignore any KYC files.
    uploadDocuments: function () { return Promise.resolve([]); },

    /* ---------- login: ANY username + password works ---------- */
    login: function (identifier, password) {
      identifier = String(identifier || "").trim();
      if (!identifier || !password) {
        return Promise.reject(new Error("Please enter both your username and password."));
      }
      var profile = profileFromIdentifier(identifier);
      // remember this account so it shows up in User Management
      var list = getAccounts().filter(function (a) {
        return a.username !== profile.username && a.email !== profile.email;
      });
      list.push(profile);
      saveAccounts(list);

      cachedProfile = profile;
      writeJSON(SESSION_KEY, profile);
      return Promise.resolve({ username: profile.username, status: "approved", role: profile.role });
    },

    /* ---------- session / profile ---------- */
    getSession: function () {
      var s = readJSON(SESSION_KEY, null);
      // shell.js only checks truthiness, so return the profile as the "session"
      return Promise.resolve(s || null);
    },
    fetchOwnProfile: function () {
      cachedProfile = readJSON(SESSION_KEY, null);
      return Promise.resolve(cachedProfile);
    },
    currentProfile: function () { return cachedProfile; },
    logout: function () {
      cachedProfile = null;
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
      return Promise.resolve();
    },

    /* ---------- admin: accounts (local only) ---------- */
    listAccounts: function () {
      var list = getAccounts();
      if (cachedProfile && !list.some(function (a) { return a.username === cachedProfile.username; })) {
        list = list.concat([cachedProfile]);
      }
      // newest first
      return Promise.resolve(list.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }));
    },
    listDocuments: function () { return Promise.resolve([]); },
    setStatus: function (username, status) {
      var list = getAccounts().map(function (a) {
        if (a.username === username) a.status = status;
        return a;
      });
      saveAccounts(list);
      return Promise.resolve(true);
    },
    setRole: function (username, role) {
      var list = getAccounts().map(function (a) {
        if (a.username === username) a.role = role;
        return a;
      });
      saveAccounts(list);
      return Promise.resolve(true);
    }
  };

  global.PIAuth = PIAuth;
})(window);
