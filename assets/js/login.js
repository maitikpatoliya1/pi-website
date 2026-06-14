/* Pansuriya Impex — login / sign-up page interactions
   Backed by the client-side PIAuth store (assets/js/auth.js). */

var form = document.getElementById("loginForm");
var username = document.getElementById("username");
var password = document.getElementById("password");
var confirm = document.getElementById("confirm");
var confirmField = document.getElementById("confirmField");
var msg = document.getElementById("formMsg");
var toggle = document.getElementById("togglePassword");

var welcomeTitle = document.getElementById("welcomeTitle");
var welcomeSub = document.getElementById("welcomeSub");
var submitLabel = document.getElementById("submitLabel");
var signupNote = document.getElementById("signupNote");
var modeToggle = document.getElementById("modeToggle");
var forgotLink = document.getElementById("forgotLink");

// Where to send people once they are authenticated.
var STOCK_URL = "stock.html?cat=natural";

var mode = "signin"; // "signin" | "signup"

/* ---------- already signed in? skip straight through ---------- */
if (window.PIAuth && PIAuth.isAuthenticated()) {
  window.location.replace(STOCK_URL);
}

/* ---------- show / hide password ---------- */
toggle.addEventListener("click", function () {
  var showing = password.type === "text";
  password.type = showing ? "password" : "text";
  if (confirm) confirm.type = password.type;
  toggle.classList.toggle("is-visible", !showing);
  toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

/* ---------- inline message helper ---------- */
function flash(text, isError) {
  msg.textContent = text;
  msg.classList.toggle("error", !!isError);
  msg.classList.add("show");
}
function clearMsg() {
  msg.classList.remove("show", "error");
  msg.textContent = "";
}

/* ---------- switch between sign-in and sign-up ---------- */
function setMode(next) {
  mode = next;
  clearMsg();

  if (mode === "signup") {
    welcomeTitle.textContent = "Create account";
    welcomeSub.textContent = "Set up your access to Pansuriya Impex.";
    submitLabel.textContent = "Create Account";
    confirmField.hidden = false;
    forgotLink.hidden = true;
    password.setAttribute("autocomplete", "new-password");
    signupNote.innerHTML = 'Already have an account? <a href="#" id="modeToggle">Sign in</a>';
  } else {
    welcomeTitle.textContent = "Welcome";
    welcomeSub.textContent = "Sign in to continue to Pansuriya Impex.";
    submitLabel.textContent = "Sign In";
    confirmField.hidden = true;
    forgotLink.hidden = false;
    password.setAttribute("autocomplete", "current-password");
    signupNote.innerHTML = "Don't have an account? <a href=\"#\" id=\"modeToggle\">Create account</a>";
  }
  // re-bind the toggle link (innerHTML replaced the node)
  document.getElementById("modeToggle").addEventListener("click", onToggleMode);
}

function onToggleMode(e) {
  e.preventDefault();
  setMode(mode === "signin" ? "signup" : "signin");
}
modeToggle.addEventListener("click", onToggleMode);

/* ---------- submit ---------- */
form.addEventListener("submit", function (e) {
  e.preventDefault();

  var u = username.value.trim();
  var p = password.value;

  if (!u || !p) {
    flash("Please enter both your username and password.", true);
    return;
  }

  if (!window.PIAuth) {
    flash("Auth module failed to load. Please refresh.", true);
    return;
  }

  // disable the button while we work
  var btn = document.getElementById("submitBtn");
  btn.disabled = true;

  if (mode === "signup") {
    if (p !== confirm.value) {
      flash("Passwords do not match.", true);
      btn.disabled = false;
      return;
    }
    flash("Creating your account…", false);
    PIAuth.signup(u, p)
      .then(function () {
        // auto sign-in right after creating the account
        return PIAuth.login(u, p);
      })
      .then(function () {
        flash("Account created. Taking you to the inventory…", false);
        setTimeout(function () { window.location.href = STOCK_URL; }, 700);
      })
      .catch(function (err) {
        flash(err.message || "Could not create the account.", true);
        btn.disabled = false;
      });
  } else {
    flash("Signing you in…", false);
    PIAuth.login(u, p)
      .then(function () {
        flash("Welcome back. Loading the inventory…", false);
        setTimeout(function () { window.location.href = STOCK_URL; }, 600);
      })
      .catch(function (err) {
        flash(err.message || "Incorrect username or password.", true);
        btn.disabled = false;
      });
  }
});

/* ---------- reset clears the inline message too ---------- */
form.addEventListener("reset", function () {
  clearMsg();
  toggle.classList.remove("is-visible");
  password.type = "password";
  if (confirm) confirm.type = "password";
  document.getElementById("submitBtn").disabled = false;
});
