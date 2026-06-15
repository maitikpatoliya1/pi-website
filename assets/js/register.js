/* ============================================================
   Pansuriya Impex — registration page (DEMO)
   Full profile form -> create account as "pending" (awaiting
   admin approval). Backed by PIAuth.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- country / state data ---------- */
  var COUNTRIES = [
    "India", "United States", "United Kingdom", "Hong Kong", "United Arab Emirates",
    "Belgium", "Israel", "China", "Singapore", "Thailand", "Australia", "Canada",
    "Germany", "France", "Japan", "Italy", "Netherlands", "Switzerland", "Spain",
    "South Africa", "Russia", "Brazil", "Turkey", "Saudi Arabia", "Qatar", "Bahrain",
    "Kuwait", "Oman", "Sri Lanka", "Bangladesh", "Nepal", "Malaysia", "Indonesia",
    "Vietnam", "South Korea", "Taiwan", "New Zealand", "Mexico", "Egypt", "Kenya",
    "Nigeria", "Sweden", "Norway", "Denmark", "Poland", "Portugal", "Greece", "Ireland"
  ];
  // Per-jurisdiction tax fields + document checklist.
  var JURISDICTIONS = {
    "India": {
      code: "+91", country: "India",
      tax1: { label: "GST No", ph: "Enter GST No" },
      tax2: { label: "PAN No", ph: "Enter PAN No" },
      docs: ["GST Certificate", "PAN Card", "Business Registration / Incorporation",
             "Import-Export Code (IEC)", "Cancelled Cheque / Bank Proof", "Address Proof", "Other"],
      hint: "Submit your India business documents (GST, PAN, etc.)."
    },
    "Hong Kong": {
      code: "+852", country: "Hong Kong",
      tax1: { label: "BR Number", ph: "Business Registration No" },
      tax2: { label: "CR Number", ph: "Company Registration No" },
      docs: ["Business Registration Certificate (BR)", "Certificate of Incorporation (CI)",
             "Annual Return (NAR1)", "HKID of Director", "Bank Statement / Proof", "Proof of Address", "Other"],
      hint: "Submit your Hong Kong business documents (BR, CI, etc.)."
    },
    "USA": {
      code: "+1", country: "United States",
      tax1: { label: "EIN", ph: "Employer Identification No" },
      tax2: { label: "State Tax ID", ph: "Enter State Tax ID" },
      docs: ["EIN Confirmation (IRS)", "Articles of Incorporation", "W-9 Form",
             "Resale / Seller's Permit", "Driver's License / ID", "Proof of Address", "Other"],
      hint: "Submit your USA business documents (EIN, W-9, etc.)."
    }
  };
  var currentJur = "India";

  var STATES = {
    "India": [
      "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
      "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
      "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
      "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
      "Uttar Pradesh", "Uttarakhand", "West Bengal",
      "Andaman & Nicobar", "Chandigarh", "Dadra & Nagar Haveli and Daman & Diu",
      "Delhi", "Jammu & Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
    ],
    "United States": [
      "California", "New York", "Texas", "Florida", "Illinois", "New Jersey",
      "Massachusetts", "Pennsylvania", "Georgia", "Washington", "Other"
    ]
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- populate country ---------- */
  var countrySel = $("country");
  var countryCode = $("countryCode");
  COUNTRIES.forEach(function (c) {
    var o = document.createElement("option");
    o.value = c; o.textContent = c;
    countrySel.appendChild(o);
  });

  var stateSel = $("state"), stateText = $("stateText");
  function updateStateControl() {
    var list = STATES[countrySel.value];
    if (list && list.length) {
      stateSel.innerHTML = '<option value="" selected disabled>Select a state…</option>';
      list.forEach(function (s) {
        var o = document.createElement("option");
        o.value = s; o.textContent = s;
        stateSel.appendChild(o);
      });
      stateSel.hidden = false; stateText.hidden = true; stateText.value = "";
    } else {
      stateSel.hidden = true; stateSel.value = "";
      stateText.hidden = false;
    }
  }
  countrySel.addEventListener("change", updateStateControl);
  updateStateControl();

  /* ---------- password eye toggles ---------- */
  document.querySelectorAll(".pw-eye").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var inp = $(btn.getAttribute("data-eye"));
      var show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.querySelector(".on").style.display = show ? "none" : "block";
      btn.querySelector(".off").style.display = show ? "block" : "none";
    });
  });

  /* ---------- documents ---------- */
  var docs = [];
  var docType = $("docType"), docFile = $("docFile"), docList = $("docList");

  function fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  function renderDocs() {
    if (!docs.length) { docList.innerHTML = '<span class="doc-empty">No documents added yet.</span>'; return; }
    docList.innerHTML = "";
    docs.forEach(function (d, i) {
      var row = document.createElement("div");
      row.className = "doc-chip";
      row.innerHTML =
        '<svg style="width:16px;height:16px;color:#b9ad8d"><use href="#i-doc"/></svg>' +
        '<span class="doc-type">' + d.type + "</span>" +
        '<span class="doc-name">' + d.name + "</span>" +
        '<span class="doc-size">' + fmtSize(d.size) + "</span>" +
        '<button type="button" class="doc-remove" aria-label="Remove"><svg><use href="#i-x"/></svg></button>';
      row.querySelector(".doc-remove").addEventListener("click", function () {
        docs.splice(i, 1); renderDocs();
      });
      docList.appendChild(row);
    });
  }
  $("addDocBtn").addEventListener("click", function () {
    if (!docType.value) {
      docType.classList.add("invalid");
      docType.focus();
      return;
    }
    docFile.click();
  });
  docType.addEventListener("change", function () { docType.classList.remove("invalid"); });
  docFile.addEventListener("change", function () {
    Array.prototype.forEach.call(docFile.files, function (f) {
      docs.push({ type: docType.value, name: f.name, size: f.size, file: f });
    });
    docFile.value = "";
    renderDocs();
  });

  /* ---------- jurisdiction toggle (India / Hong Kong / USA) ---------- */
  var taxId1 = $("taxId1"), taxId2 = $("taxId2");
  function fillDocTypes(list) {
    docType.innerHTML = '<option value="" selected disabled>Select…</option>';
    list.forEach(function (d) {
      var o = document.createElement("option");
      o.value = d; o.textContent = d;
      docType.appendChild(o);
    });
  }
  function applyJurisdiction(jur) {
    var cfg = JURISDICTIONS[jur];
    if (!cfg) return;
    currentJur = jur;

    document.querySelectorAll("#jurToggle .jur-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-jur") === jur);
    });
    $("jurHint").textContent = cfg.hint;

    // tax fields
    $("taxLabel1").textContent = cfg.tax1.label;
    taxId1.placeholder = cfg.tax1.ph; taxId1.value = "";
    $("taxLabel2").textContent = cfg.tax2.label;
    taxId2.placeholder = cfg.tax2.ph; taxId2.value = "";

    // documents reset to this country's checklist
    fillDocTypes(cfg.docs);
    docs.length = 0; renderDocs();

    // convenience defaults (user can still change)
    if (countryCode) countryCode.value = cfg.code;
    if (countrySel) { countrySel.value = cfg.country; updateStateControl(); }
  }
  document.getElementById("jurToggle").addEventListener("click", function (e) {
    var btn = e.target.closest(".jur-btn");
    if (btn) applyJurisdiction(btn.getAttribute("data-jur"));
  });
  applyJurisdiction("India");

  /* ---------- validation helpers ---------- */
  function val(id) { return ($(id).value || "").trim(); }
  function mark(id) { $(id).classList.add("invalid"); }
  ["company", "username", "email", "password", "confirm", "firstName", "lastName", "phone", "country"]
    .forEach(function (id) {
      $(id).addEventListener("input", function () { $(id).classList.remove("invalid"); });
      $(id).addEventListener("change", function () { $(id).classList.remove("invalid"); });
    });

  var msg = $("formMsg");
  function flash(el, text, isErr) {
    el.textContent = text;
    el.classList.toggle("error", !!isErr);
    el.classList.add("show");
  }

  /* ---------- collect profile from the form ---------- */
  function collectProfile() {
    return {
      company: val("company"),
      username: val("username"),
      email: val("email"),
      password: $("password").value,
      firstName: val("firstName"),
      middleName: val("middleName"),
      lastName: val("lastName"),
      countryCode: $("countryCode").value,
      phone: val("phone"),
      address: val("address"),
      country: countrySel.value,
      state: stateSel.hidden ? val("stateText") : stateSel.value,
      city: val("city"),
      pincode: val("pincode"),
      fax: val("fax"),
      jurisdiction: currentJur,
      taxLabel1: JURISDICTIONS[currentJur].tax1.label,
      taxId1: val("taxId1"),
      taxLabel2: JURISDICTIONS[currentJur].tax2.label,
      taxId2: val("taxId2"),
      emergencyName: val("emergencyName"),
      emergencyPhone: val("emergencyPhone"),
      emergencyAddress: val("emergencyAddress"),
      location: $("location").value,
      documents: docs.slice()
    };
  }

  /* ---------- submit -> validate -> create account ---------- */
  var pendingProfile = null;
  var form = $("regForm");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.classList.remove("show");

    var required = [
      ["company", "Company name"], ["username", "Username"], ["email", "Email"],
      ["password", "Password"], ["confirm", "Confirm password"],
      ["firstName", "First name"], ["lastName", "Last name"], ["phone", "Phone number"]
    ];
    var missing = null;
    required.forEach(function (r) { if (!val(r[0])) { mark(r[0]); if (!missing) missing = r[1]; } });
    if (!countrySel.value) { mark("country"); if (!missing) missing = "Country"; }

    if (missing) { flash(msg, "Please fill in: " + missing + ".", true); return; }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("email"))) { mark("email"); flash(msg, "Please enter a valid email address.", true); return; }
    if ($("password").value.length < 6) { mark("password"); flash(msg, "Password must be at least 6 characters.", true); return; }
    if ($("password").value !== $("confirm").value) { mark("confirm"); flash(msg, "Passwords do not match.", true); return; }

    if (!window.PIAuth) { flash(msg, "Auth module failed to load. Please refresh.", true); return; }

    pendingProfile = collectProfile();
    var sbtn = $("submitBtn"); sbtn.disabled = true;
    flash(msg, "Creating your account…", false);
    PIAuth.register(pendingProfile)
      .then(function () {
        flash(msg, "Saving your documents…", false);
        return PIAuth.uploadDocuments(pendingProfile.documents);
      })
      .then(function () { return PIAuth.logout(); })
      .then(function () {
        sbtn.disabled = false;
        $("doneName").textContent = pendingProfile.firstName || pendingProfile.username;
        $("formView").hidden = true;
        $("doneView").hidden = false;
        window.scrollTo(0, 0);
      })
      .catch(function (err) {
        sbtn.disabled = false;
        if (/username/i.test(err.message)) mark("username");
        if (/email/i.test(err.message)) mark("email");
        flash(msg, err.message || "Could not create the account right now.", true);
      });
  });
})();
