/* ============================================================
   Pansuriya Impex — client-side auth + account store (DEMO)
   ------------------------------------------------------------
   Front-end-only auth for the static site. Accounts live in the
   browser's localStorage; passwords are salted + SHA-256 hashed.

   DEMO LIMITATIONS (until a real backend / Supabase is wired in):
     • Accounts only exist in the browser that created them — there
       is no shared database, so "admin approval" only works on the
       same browser. Real cross-device approval needs a backend.
     • Email OTP is simulated (the code is shown on screen, because
       a static site cannot actually send email).
     • Uploaded documents are recorded by name/size only; the files
       are not stored anywhere (no server storage in the demo).

   Account model:
     accounts[usernameLower] = {
       username, email, salt, hash, createdAt,
       company, firstName, middleName, lastName,
       countryCode, phone, address, country, state, city,
       pincode, fax,
       jurisdiction, taxLabel1, taxId1, taxLabel2, taxId2,
       emergencyName, emergencyPhone, emergencyAddress, location,
       documents: [{ name, type, size }],
       emailVerified: bool,
       role: "admin" | "stock_manager" | "salesperson" | "customer",
       status: "pending" | "approved" | "rejected"
     }
   Public sign-ups default to role "customer". Staff roles are
   assigned by an admin. "status" gates access; "role" gates what
   the user can do once approved.
   Session: pi_session = { user, ts }   (set only for APPROVED users)
   ============================================================ */
(function (global) {
  "use strict";

  var ACCOUNTS_KEY = "pi_accounts";
  var SESSION_KEY = "pi_session";

  /* ---------- storage ---------- */
  function readAccounts() {
    try {
      var obj = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "null");
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) { return {}; }
  }
  function writeAccounts(a) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }

  /* ---------- hashing ---------- */
  function toHex(buffer) {
    var b = new Uint8Array(buffer), s = "";
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }
  function randomSalt() {
    var arr = new Uint8Array(16);
    (global.crypto || global.msCrypto).getRandomValues(arr);
    return toHex(arr.buffer);
  }
  function weakHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
    return "w" + (h >>> 0).toString(16);
  }
  function hashPassword(salt, password) {
    var subtle = global.crypto && global.crypto.subtle;
    var input = salt + ":" + password;
    if (!subtle) return Promise.resolve(weakHash(input));
    return subtle.digest("SHA-256", new TextEncoder().encode(input)).then(toHex);
  }

  /* ---------- helpers ---------- */
  function normUser(u) { return String(u || "").trim(); }
  function userKey(u) { return normUser(u).toLowerCase(); }
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function isEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim()); }
  function statusOf(acct) { return acct ? (acct.status || "pending") : null; }

  // Public copy of an account (never expose salt/hash).
  function publicAccount(acct) {
    if (!acct) return null;
    var out = {};
    for (var k in acct) if (k !== "salt" && k !== "hash") out[k] = acct[k];
    out.status = statusOf(acct);
    return out;
  }

  /* ---------- public API ---------- */
  var PIAuth = {
    // Role catalogue (most → least privileged). Public sign-ups are
    // "customer"; the rest are staff roles an admin assigns.
    ROLES: ["admin", "stock_manager", "salesperson", "customer"],
    ROLE_LABELS: {
      admin: "Admin",
      stock_manager: "Stock Manager",
      salesperson: "Salesperson",
      customer: "Customer"
    },
    roleLabel: function (role) { return PIAuth.ROLE_LABELS[role] || "Customer"; },

    isUsernameTaken: function (u) { return !!readAccounts()[userKey(u)]; },
    isEmailTaken: function (email) {
      var a = readAccounts(), e = normEmail(email);
      return Object.keys(a).some(function (k) { return normEmail(a[k].email) === e; });
    },

    /**
     * Create an account from a full profile object. Created as
     * status "pending" (awaiting admin approval). Resolves with the
     * public account, rejects with a user-safe Error.
     * `profile` must include: username, password, email. Other
     * fields are optional and stored as-is.
     */
    register: function (profile) {
      profile = profile || {};
      var name = normUser(profile.username);
      var key = userKey(profile.username);
      var pw = String(profile.password || "");

      if (name.length < 3) return Promise.reject(new Error("Username must be at least 3 characters."));
      if (pw.length < 6) return Promise.reject(new Error("Password must be at least 6 characters."));
      if (!isEmail(profile.email)) return Promise.reject(new Error("Please enter a valid email address."));

      var accounts = readAccounts();
      if (accounts[key]) return Promise.reject(new Error("That username is already taken."));
      if (PIAuth.isEmailTaken(profile.email)) return Promise.reject(new Error("An account with that email already exists."));

      var salt = randomSalt();
      return hashPassword(salt, pw).then(function (hash) {
        var rec = {
          username: name,
          email: String(profile.email || "").trim(),
          salt: salt,
          hash: hash,
          createdAt: Date.now(),
          company: profile.company || "",
          firstName: profile.firstName || "",
          middleName: profile.middleName || "",
          lastName: profile.lastName || "",
          countryCode: profile.countryCode || "",
          phone: profile.phone || "",
          address: profile.address || "",
          country: profile.country || "",
          state: profile.state || "",
          city: profile.city || "",
          pincode: profile.pincode || "",
          fax: profile.fax || "",
          jurisdiction: profile.jurisdiction || "",
          taxLabel1: profile.taxLabel1 || "",
          taxId1: profile.taxId1 || "",
          taxLabel2: profile.taxLabel2 || "",
          taxId2: profile.taxId2 || "",
          emergencyName: profile.emergencyName || "",
          emergencyPhone: profile.emergencyPhone || "",
          emergencyAddress: profile.emergencyAddress || "",
          location: profile.location || "",
          documents: Array.isArray(profile.documents) ? profile.documents : [],
          emailVerified: !!profile.emailVerified,
          role: PIAuth.ROLES.indexOf(profile.role) > -1 ? profile.role : "customer",
          status: "pending"
        };
        accounts[key] = rec;
        writeAccounts(accounts);
        return publicAccount(rec);
      });
    },

    /** Verify credentials without starting a session. */
    verifyCredentials: function (username, password) {
      var acct = readAccounts()[userKey(username)];
      var bad = new Error("Incorrect username or password.");
      if (!acct) return Promise.reject(bad);
      return hashPassword(acct.salt, password).then(function (h) {
        if (h !== acct.hash) throw bad;
        return acct;
      });
    },

    /**
     * Verify credentials; start a session ONLY if approved.
     * Resolves with { username, status, emailVerified } so the caller
     * can branch (approved -> stock, pending -> wait, rejected -> msg).
     */
    login: function (username, password) {
      return PIAuth.verifyCredentials(username, password).then(function (acct) {
        if (statusOf(acct) === "approved") PIAuth.startSession(acct.username);
        return {
          username: acct.username,
          status: statusOf(acct),
          role: acct.role || "customer",
          emailVerified: !!acct.emailVerified
        };
      });
    },

    startSession: function (username) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: username, ts: Date.now() }));
    },
    logout: function () { localStorage.removeItem(SESSION_KEY); },
    currentUser: function () {
      try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.user ? s.user : null; }
      catch (e) { return null; }
    },
    isAuthenticated: function () { return !!PIAuth.currentUser(); },

    accountStatus: function (username) { return statusOf(readAccounts()[userKey(username)]); },
    getAccount: function (username) { return publicAccount(readAccounts()[userKey(username)]); },

    accountRole: function (username) {
      var a = readAccounts()[userKey(username)];
      return a ? (a.role || "customer") : null;
    },
    currentRole: function () {
      var u = PIAuth.currentUser();
      return u ? PIAuth.accountRole(u) : null;
    },
    setRole: function (username, role) {
      if (PIAuth.ROLES.indexOf(role) === -1) return false;
      var a = readAccounts(), k = userKey(username);
      if (!a[k]) return false;
      a[k].role = role;
      writeAccounts(a);
      return true;
    },

    /** Guard for approved-only pages (e.g. stock.html). */
    requireApproved: function (redirect) {
      var u = PIAuth.currentUser();
      if (!u || PIAuth.accountStatus(u) !== "approved") {
        location.replace(redirect || "login.html");
        return false;
      }
      return true;
    },

    /**
     * Guard a page to specific role(s). `allowed` is a role string or
     * array. Requires an approved account whose role is allowed.
     */
    requireRole: function (allowed, redirect) {
      allowed = [].concat(allowed);
      var u = PIAuth.currentUser();
      if (!u || PIAuth.accountStatus(u) !== "approved" || allowed.indexOf(PIAuth.accountRole(u)) === -1) {
        location.replace(redirect || "login.html");
        return false;
      }
      return true;
    },

    /* ---------- admin (demo) ---------- */
    listAccounts: function () {
      var a = readAccounts();
      return Object.keys(a).map(function (k) { return publicAccount(a[k]); })
        .sort(function (x, y) { return (y.createdAt || 0) - (x.createdAt || 0); });
    },
    setStatus: function (username, status) {
      var a = readAccounts(), k = userKey(username);
      if (!a[k]) return false;
      a[k].status = status;
      writeAccounts(a);
      // if the affected user is currently signed-in but no longer
      // approved, drop their session.
      if (status !== "approved" && PIAuth.currentUser() &&
          userKey(PIAuth.currentUser()) === k) PIAuth.logout();
      return true;
    }
  };

  global.PIAuth = PIAuth;
})(window);
