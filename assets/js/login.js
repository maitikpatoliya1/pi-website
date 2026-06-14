/* Pansuriya Impex — sign-in page.
   Account creation now lives on register.html. This page only signs
   people in and routes by approval status. Backed by PIAuth. */

var form = document.getElementById("loginForm");
var username = document.getElementById("username");
var password = document.getElementById("password");
var msg = document.getElementById("formMsg");
var toggle = document.getElementById("togglePassword");
var submitBtn = document.getElementById("submitBtn");

var STOCK_URL = "stock.html?cat=natural";

/* where each role lands after signing in */
function homeForRole(role) {
  return role === "admin" ? "admin.html" : STOCK_URL;
}

/* already signed in (approved) -> go straight to your home */
if (window.PIAuth && PIAuth.isAuthenticated() && PIAuth.accountStatus(PIAuth.currentUser()) === "approved") {
  window.location.replace(homeForRole(PIAuth.currentRole()));
}

/* show / hide password */
toggle.addEventListener("click", function () {
  var showing = password.type === "text";
  password.type = showing ? "password" : "text";
  toggle.classList.toggle("is-visible", !showing);
  toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

function flash(text, isError) {
  msg.textContent = text;
  msg.classList.toggle("error", !!isError);
  msg.classList.add("show");
}

form.addEventListener("submit", function (e) {
  e.preventDefault();

  var u = username.value.trim();
  var p = password.value;

  if (!u || !p) { flash("Please enter both your username and password.", true); return; }
  if (!window.PIAuth) { flash("Auth module failed to load. Please refresh.", true); return; }

  submitBtn.disabled = true;
  flash("Signing you in…", false);

  PIAuth.login(u, p)
    .then(function (res) {
      if (res.status === "approved") {
        flash("Welcome back, " + PIAuth.roleLabel(res.role) + ". Signing you in…", false);
        setTimeout(function () { window.location.href = homeForRole(res.role); }, 600);
      } else if (res.status === "rejected") {
        flash("Your application was not approved. Please contact our trading desk.", true);
        submitBtn.disabled = false;
      } else {
        // pending (or awaiting review)
        flash("Your account is awaiting admin approval. We'll email you once it's active.", true);
        submitBtn.disabled = false;
      }
    })
    .catch(function (err) {
      flash(err.message || "Incorrect username or password.", true);
      submitBtn.disabled = false;
    });
});

form.addEventListener("reset", function () {
  msg.classList.remove("show", "error");
  msg.textContent = "";
  toggle.classList.remove("is-visible");
  password.type = "password";
  submitBtn.disabled = false;
});
