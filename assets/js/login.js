/* Pansuriya Impex — sign-in page (Supabase-backed).
   Sign in with username OR email; only approved accounts reach the app. */

var form = document.getElementById("loginForm");
var username = document.getElementById("username");
var password = document.getElementById("password");
var msg = document.getElementById("formMsg");
var toggle = document.getElementById("togglePassword");
var submitBtn = document.getElementById("submitBtn");
var resetBtn = form ? form.querySelector(".btn-reset") : null;

var STOCK_URL = "stock.html?cat=natural";

function flashTo(target, text, isError) {
  target.textContent = text;
  target.classList.toggle("error", !!isError);
  target.classList.add("show");
}

function flash(text, isError) {
  flashTo(msg, text, isError);
}

function setLoginBusy(isBusy) {
  submitBtn.disabled = !!isBusy;
  if (resetBtn) resetBtn.disabled = !!isBusy;
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

  setLoginBusy(true);
  flash("Checking your sign-in details…", false);

  PIAuth.login(u, p)
    .then(function (res) {
      if (res.status === "approved") {
        flash("Welcome back. Loading the inventory…", false);
        window.setTimeout(function () { window.location.href = STOCK_URL; }, 350);
      } else if (res.status === "rejected") {
        return PIAuth.logout().then(function () {
          flash("Your application was not approved. Please contact our trading desk.", true);
          setLoginBusy(false);
        });
      } else {
        return PIAuth.logout().then(function () {
          flash("Your account is awaiting admin approval. We'll email you once it's active.", true);
          setLoginBusy(false);
        });
      }
    })
    .catch(function (err) {
      flash(err.message || "Incorrect username or password.", true);
      setLoginBusy(false);
    });
});

form.addEventListener("reset", function () {
  msg.classList.remove("show", "error");
  msg.textContent = "";
  toggle.classList.remove("is-visible");
  password.type = "password";
  setLoginBusy(false);
});
