/* ============================================================
   Pansuriya Impex — lightweight client-side authentication
   ------------------------------------------------------------
   This is a front-end-only auth layer for a static site
   (GitHub Pages has no backend). Accounts are stored in the
   browser's localStorage; passwords are never kept in plain
   text — they are salted and SHA-256 hashed.

   NOTE: client-side auth is for gating a demo / private inventory
   view, not for protecting truly sensitive data. Anyone with the
   file/devtools can read the local store. For real security move
   this to a backend (Firebase Auth, Supabase, a Node API, etc.).

   Accounts + the active session are shared between login.html and
   stock.html ONLY when both pages are served from the same origin
   (e.g. both on localhost:8766, or both on the github.io domain).
   ============================================================ */
(function (global) {
  "use strict";

  var ACCOUNTS_KEY = "pi_accounts";
  var SESSION_KEY = "pi_session";

  /* ---------- storage helpers ---------- */
  function readAccounts() {
    try {
      var raw = localStorage.getItem(ACCOUNTS_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function writeAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  /* ---------- hashing ---------- */
  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  function randomSalt() {
    var arr = new Uint8Array(16);
    (global.crypto || global.msCrypto).getRandomValues(arr);
    return toHex(arr.buffer);
  }

  // Fallback hash for the rare case SubtleCrypto is unavailable
  // (e.g. opened over file://). Not cryptographically strong, but
  // keeps the flow working in dev.
  function weakHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = (h * 33) ^ str.charCodeAt(i);
    }
    return "w" + (h >>> 0).toString(16);
  }

  function hashPassword(salt, password) {
    var subtle = global.crypto && global.crypto.subtle;
    var input = salt + ":" + password;
    if (!subtle) {
      return Promise.resolve(weakHash(input));
    }
    var data = new TextEncoder().encode(input);
    return subtle.digest("SHA-256", data).then(function (buf) {
      return toHex(buf);
    });
  }

  /* ---------- validation ---------- */
  function normUser(username) {
    return String(username || "").trim();
  }
  function userKey(username) {
    return normUser(username).toLowerCase();
  }

  /* ---------- public API ---------- */
  var PIAuth = {
    /**
     * Create a new account. Resolves on success, rejects with an
     * Error whose .message is safe to show the user.
     */
    signup: function (username, password) {
      var name = normUser(username);
      var key = userKey(username);

      if (name.length < 3) {
        return Promise.reject(new Error("Username must be at least 3 characters."));
      }
      if (String(password || "").length < 6) {
        return Promise.reject(new Error("Password must be at least 6 characters."));
      }

      var accounts = readAccounts();
      if (accounts[key]) {
        return Promise.reject(new Error("That username is already taken."));
      }

      var salt = randomSalt();
      return hashPassword(salt, password).then(function (hash) {
        accounts[key] = {
          username: name,
          salt: salt,
          hash: hash,
          createdAt: Date.now()
        };
        writeAccounts(accounts);
        return { username: name };
      });
    },

    /**
     * Verify credentials. On success starts a session and resolves
     * with { username }. On failure rejects with a safe Error.
     */
    login: function (username, password) {
      var key = userKey(username);
      var accounts = readAccounts();
      var acct = accounts[key];

      // Same generic message whether the user or the password is
      // wrong, so we don't leak which usernames exist.
      var bad = new Error("Incorrect username or password.");

      if (!acct) {
        return Promise.reject(bad);
      }
      return hashPassword(acct.salt, password).then(function (hash) {
        if (hash !== acct.hash) {
          throw bad;
        }
        var session = { user: acct.username, ts: Date.now() };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { username: acct.username };
      });
    },

    /** End the current session. */
    logout: function () {
      localStorage.removeItem(SESSION_KEY);
    },

    /** Returns the signed-in username, or null. */
    currentUser: function () {
      try {
        var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        return s && s.user ? s.user : null;
      } catch (e) {
        return null;
      }
    },

    /** True if someone is signed in. */
    isAuthenticated: function () {
      return !!PIAuth.currentUser();
    },

    /**
     * Guard a protected page. If nobody is signed in, redirect to
     * the login page and return false.
     */
    requireAuth: function (redirectTo) {
      if (!PIAuth.isAuthenticated()) {
        location.replace(redirectTo || "login.html");
        return false;
      }
      return true;
    }
  };

  global.PIAuth = PIAuth;
})(window);
