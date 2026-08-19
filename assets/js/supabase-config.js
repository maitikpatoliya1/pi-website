/* ============================================================
   Pansuriya Impex — LOCAL / NO-DATABASE build
   ------------------------------------------------------------
   The Supabase backend has been removed "for now". This file no
   longer connects to any database. It exposes a harmless no-op
   `PI_SB` stub with the same shape the rest of the app expects
   (from().select().eq()… , auth.*, storage.*, rpc), so existing
   calls in perms.js / cart.js / orders.js / shell.js keep working
   without a network request. Every query simply resolves empty.
   ============================================================ */
(function (global) {
  "use strict";

  // Chainable query builder: every filter returns itself, and the
  // builder is "thenable" so `.from(...).select(...).eq(...).then(cb)`
  // resolves to an empty result instead of hitting a server.
  function makeBuilder() {
    var result = { data: [], error: null, count: 0 };
    var promise = Promise.resolve(result);
    var builder = {
      select: function () { return builder; },
      insert: function () { return builder; },
      update: function () { return builder; },
      upsert: function () { return builder; },
      delete: function () { return builder; },
      eq: function () { return builder; },
      neq: function () { return builder; },
      in: function () { return builder; },
      is: function () { return builder; },
      order: function () { return builder; },
      limit: function () { return builder; },
      range: function () { return builder; },
      single: function () { return Promise.resolve({ data: null, error: null }); },
      maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
      then: function (onOk, onErr) { return promise.then(onOk, onErr); },
      catch: function (onErr) { return promise.catch(onErr); }
    };
    return builder;
  }

  global.PI_SUPABASE_URL = "";
  global.PI_SUPABASE_ANON_KEY = "";

  global.PI_SB = {
    from: function () { return makeBuilder(); },
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    auth: {
      getUser: function () { return Promise.resolve({ data: { user: null }, error: null }); },
      getSession: function () { return Promise.resolve({ data: { session: null }, error: null }); },
      signInWithPassword: function () { return Promise.resolve({ data: {}, error: null }); },
      signOut: function () { return Promise.resolve({ error: null }); }
    },
    storage: {
      from: function () {
        return { upload: function () { return Promise.resolve({ data: null, error: null }); } };
      }
    }
  };
})(window);
