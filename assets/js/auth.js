/* ============================================================
   Pansuriya Impex — authentication + accounts (Supabase-backed)
   ------------------------------------------------------------
   Real backend: accounts live in Postgres (profiles), email is
   verified by a 6-digit OTP, KYC documents go to Storage, and an
   admin approves / assigns roles. Row Level Security enforces access.
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
    if (/Email not confirmed/i.test(m)) return "Please verify your email first — check your inbox for the 6-digit code.";
    if (/Invalid login credentials/i.test(m)) return "Incorrect username/email or password.";
    if (/Token has expired|invalid|otp/i.test(m)) return "That code is incorrect or has expired. Request a new one.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts — please wait a minute and try again.";
    return m;
  }

  var cachedProfile = null;

  var PIAuth = {
    ROLES: ROLES,
    ROLE_LABELS: ROLE_LABELS,
    roleLabel: function (r) { return ROLE_LABELS[r] || "Customer"; },

    /* ---------- registration ---------- */
    // Creates the auth user; a DB trigger builds the pending profile from
    // the metadata. Email is unconfirmed until the OTP is verified.
    register: function (profile) {
      return sb().auth.signUp({
        email: String(profile.email || "").trim(),
        password: profile.password,
        options: { data: metaFromProfile(profile), emailRedirectTo: location.origin + "/login.html" }
      }).then(function (res) {
        if (res.error) throw new Error(friendly(res.error));
        return { email: String(profile.email || "").trim(), needsConfirmation: !res.data.session };
      });
    },
    // Verify the 6-digit signup OTP -> confirms email + starts a session.
    verifyEmailOtp: function (email, token) {
      return sb().auth.verifyOtp({ email: email, token: String(token).trim(), type: "signup" })
        .then(function (res) { if (res.error) throw new Error(friendly(res.error)); return res.data; });
    },
    resendSignupOtp: function (email) {
      return sb().auth.resend({ type: "signup", email: email })
        .then(function (res) { if (res.error) throw new Error(friendly(res.error)); return true; });
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
      identifier = String(identifier || "").trim();
      var emailP = identifier.indexOf("@") > -1
        ? Promise.resolve(identifier)
        : sb().rpc("email_for_username", { uname: identifier }).then(function (r) {
            if (r.error || !r.data) throw new Error("Incorrect username/email or password.");
            return r.data;
          });
      return emailP.then(function (email) {
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
