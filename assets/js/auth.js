/* ============================================================
   Pansuriya Impex — authentication + accounts (Supabase-backed)
   ------------------------------------------------------------
   Real backend: accounts live in Postgres (profiles), KYC documents
   go to Storage, and an admin approves / assigns roles. Row Level
   Security enforces access.
   Requires window.PI_SB (assets/js/supabase-config.js).
   All methods are async (return Promises).
   ============================================================ */
(function (global) {
  "use strict";
  function sb() { return global.PI_SB; }

  var ROLES = ["admin", "stock_manager", "salesperson", "customer"];
  var ROLE_LABELS = { admin: "Admin", stock_manager: "Stock Manager", salesperson: "Salesperson", customer: "Customer" };

  /* ---------- field mapping (camelCase UI <-> snake_case DB) ---------- */
  function metaFromProfile(p) {
    return {
      username: p.username, company: p.company,
      first_name: p.firstName, middle_name: p.middleName, last_name: p.lastName,
      country_code: p.countryCode, phone: p.phone, address: p.address,
      country: p.country, state: p.state, city: p.city, pincode: p.pincode, fax: p.fax,
      jurisdiction: p.jurisdiction, tax_label1: p.taxLabel1, tax_id1: p.taxId1,
      tax_label2: p.taxLabel2, tax_id2: p.taxId2,
      emergency_name: p.emergencyName, emergency_phone: p.emergencyPhone,
      emergency_address: p.emergencyAddress, location: p.location
    };
  }
  function profileFromRow(r) {
    if (!r) return null;
    return {
      id: r.id, username: r.username, email: r.email, company: r.company,
      firstName: r.first_name, middleName: r.middle_name, lastName: r.last_name,
      countryCode: r.country_code, phone: r.phone, address: r.address,
      country: r.country, state: r.state, city: r.city, pincode: r.pincode, fax: r.fax,
      jurisdiction: r.jurisdiction, taxLabel1: r.tax_label1, taxId1: r.tax_id1,
      taxLabel2: r.tax_label2, taxId2: r.tax_id2,
      emergencyName: r.emergency_name, emergencyPhone: r.emergency_phone,
      emergencyAddress: r.emergency_address, location: r.location,
      role: r.role || "customer", status: r.status || "pending",
      createdAt: r.created_at ? Date.parse(r.created_at) : 0,
      documents: r.documents || []
    };
  }

  function friendly(err) {
    var m = (err && (err.message || err.msg)) || "Something went wrong. Please try again.";
    if (/already registered|already been registered|already exists|duplicate/i.test(m)) return "An account with that email or username already exists.";
    if (/Email not confirmed/i.test(m)) return "This account is not ready yet. Please contact the team.";
    if (/Invalid login credentials/i.test(m)) return "Incorrect username/email or password.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts — please wait a minute and try again.";
    if (/function|network|fetch/i.test(m)) return "Registration service is not reachable. Please try again.";
    return m;
  }

  var cachedProfile = null;

  function emailForIdentifier(identifier) {
    identifier = String(identifier || "").trim();
    if (identifier.indexOf("@") > -1) return Promise.resolve(identifier);
    return sb().rpc("email_for_username", { uname: identifier }).then(function (r) {
      if (r.error || !r.data) throw new Error("Incorrect username/email or password.");
      return r.data;
    });
  }

  function registrationFunctionUrl() {
    var base = (global.PI_SUPABASE_URL || "").replace(/\/$/, "");
    if (!base) throw new Error("Registration service is not configured.");
    return base + "/functions/v1/register-account";
  }

  function callRegistrationFunction(profile) {
    var email = String(profile.email || "").trim().toLowerCase();
    var url;
    try {
      url = registrationFunctionUrl();
    } catch (err) {
      return Promise.reject(err);
    }
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": global.PI_SUPABASE_ANON_KEY || "",
        "Authorization": "Bearer " + (global.PI_SUPABASE_ANON_KEY || "")
      },
      body: JSON.stringify({
        email: email,
        password: profile.password,
        metadata: metaFromProfile(profile)
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(friendly({ message: data.error || data.message || "Could not create the account right now." }));
        return data;
      });
    });
  }

  var PIAuth = {
    ROLES: ROLES,
    ROLE_LABELS: ROLE_LABELS,
    roleLabel: function (r) { return ROLE_LABELS[r] || "Customer"; },

    /* ---------- registration ---------- */
    // Temporarily creates an already-confirmed auth user through an Edge
    // Function; a DB trigger builds the pending profile from the metadata.
    register: function (profile) {
      var email = String(profile.email || "").trim().toLowerCase();
      var created = null;
      return callRegistrationFunction(profile).then(function (data) {
        created = data;
        return sb().auth.signInWithPassword({ email: email, password: profile.password });
      }).then(function (res) {
        if (res.error) throw new Error(friendly(res.error));
        return { email: email, userId: created && created.userId, needsConfirmation: false };
      });
    },

    // Upload KYC files to Storage + record metadata. Best-effort: a
    // storage hiccup should not undo a completed registration.
    // docs: [{ type, file }]
    uploadDocuments: function (docs) {
      if (!docs || !docs.length) return Promise.resolve([]);
      return sb().auth.getUser().then(function (u) {
        var user = u.data.user;
        if (!user) return [];
        var jobs = docs.map(function (d) {
          if (!d.file) return Promise.resolve(null);
          var safe = d.file.name.replace(/[^\w.\-]/g, "_");
          var path = user.id + "/" + Date.now() + "_" + safe;
          return sb().storage.from("kyc-documents").upload(path, d.file).then(function (up) {
            if (up.error) return null;
            return sb().from("documents").insert({
              profile_id: user.id, doc_type: d.type, file_name: d.file.name,
              storage_path: path, size: d.file.size
            });
          }).catch(function () { return null; });
        });
        return Promise.all(jobs);
      }).catch(function () { return []; });
    },

    /* ---------- login ---------- */
    // identifier may be a username OR an email
    login: function (identifier, password) {
      return emailForIdentifier(identifier).then(function (email) {
        return sb().auth.signInWithPassword({ email: email, password: password });
      }).then(function (res) {
        if (res.error) throw new Error(friendly(res.error));
        return PIAuth.fetchOwnProfile();
      }).then(function (p) {
        cachedProfile = p;
        return { username: p ? p.username : null, status: p ? p.status : "pending", role: p ? p.role : "customer" };
      });
    },

    /* ---------- session / profile ---------- */
    getSession: function () { return sb().auth.getSession().then(function (r) { return r.data.session; }); },
    fetchOwnProfile: function () {
      return sb().auth.getUser().then(function (u) {
        var user = u.data.user;
        if (!user) return null;
        return sb().from("profiles").select("*").eq("id", user.id).single()
          .then(function (r) { cachedProfile = profileFromRow(r.data); return cachedProfile; });
      });
    },
    currentProfile: function () { return cachedProfile; },
    logout: function () { cachedProfile = null; return sb().auth.signOut(); },

    /* ---------- admin: accounts ---------- */
    listAccounts: function () {
      return sb().from("profiles").select("*").order("created_at", { ascending: false })
        .then(function (r) { if (r.error) throw new Error(r.error.message); return (r.data || []).map(profileFromRow); });
    },
    listDocuments: function (profileId) {
      return sb().from("documents").select("*").eq("profile_id", profileId)
        .then(function (r) { return (r.data || []); });
    },
    setStatus: function (username, status) {
      return sb().from("profiles").update({ status: status }).eq("username", username)
        .then(function (r) { return !r.error; });
    },
    setRole: function (username, role) {
      return sb().from("profiles").update({ role: role }).eq("username", username)
        .then(function (r) { return !r.error; });
    }
  };

  global.PIAuth = PIAuth;
})(window);
