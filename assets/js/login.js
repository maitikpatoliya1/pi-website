/* Pansuriya Impex — sign-in page (Supabase-backed).
   Sign in with username OR email; only approved accounts reach the app. */

var form = document.getElementById("loginForm");
var username = document.getElementById("username");
var password = document.getElementById("password");
var msg = document.getElementById("formMsg");
var toggle = document.getElementById("togglePassword");
var submitBtn = document.getElementById("submitBtn");

var STOCK_URL = "stock.html?cat=natural";

function flash(text, isError) {
  msg.textContent = text;
  msg.classList.toggle("error", !!isError);
  msg.classList.add("show");
}

/* already signed in + approved -> skip straight to the app */
(function () {
  if (!window.PIAuth) return;
  PIAuth.getSession().then(function (s) {
    if (!s) return;
    return PIAuth.fetchOwnProfile().then(function (p) {
      if (p && p.status === "approved") window.location.replace(STOCK_URL);
    });
  }).catch(function () {});
})();

/* show / hide password */
toggle.addEventListener("click", function () {
  var showing = password.type === "text";
  password.type = showing ? "password" : "text";
  toggle.classList.toggle("is-visible", !showing);
  toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

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
        flash("Welcome back. Loading the inventory…", false);
        setTimeout(function () { window.location.href = STOCK_URL; }, 500);
      } else if (res.status === "rejected") {
        flash("Your application was not approved. Please contact our trading desk.", true);
        PIAuth.logout();
        submitBtn.disabled = false;
      } else {
        flash("Your account is awaiting admin approval. We'll email you once it's active.", true);
        PIAuth.logout();
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
