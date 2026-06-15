/* Pansuriya Impex — sign-in page (Supabase-backed).
   Sign in with username OR email; only approved accounts reach the app. */

var form = document.getElementById("loginForm");
var username = document.getElementById("username");
var password = document.getElementById("password");
var msg = document.getElementById("formMsg");
var toggle = document.getElementById("togglePassword");
var submitBtn = document.getElementById("submitBtn");
var resetBtn = form ? form.querySelector(".btn-reset") : null;

var otpModal = document.getElementById("loginOtpModal");
var otpEmail = document.getElementById("loginOtpEmail");
var otpInputs = otpModal ? Array.prototype.slice.call(document.querySelectorAll("#loginOtpInputs input")) : [];
var otpMsg = document.getElementById("loginOtpMsg");
var otpResend = document.getElementById("loginOtpResend");
var otpCancel = document.getElementById("loginOtpCancel");
var otpVerify = document.getElementById("loginOtpVerify");
var pendingLoginEmail = "";
var resendTimer = null;

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

function clearResendTimer() {
  if (resendTimer) window.clearInterval(resendTimer);
  resendTimer = null;
}

function unlockResend() {
  clearResendTimer();
  if (otpResend) {
    otpResend.disabled = false;
    otpResend.textContent = "Resend code";
  }
}

function lockResend(seconds) {
  var remaining = seconds || 30;
  if (!otpResend) return;
  clearResendTimer();
  otpResend.disabled = true;
  otpResend.textContent = "Resend in " + remaining + "s";
  resendTimer = window.setInterval(function () {
    remaining -= 1;
    if (remaining <= 0) {
      unlockResend();
      return;
    }
    otpResend.textContent = "Resend in " + remaining + "s";
  }, 1000);
}

function clearOtpInputs() {
  otpInputs.forEach(function (input) { input.value = ""; });
}

function openOtp(email) {
  pendingLoginEmail = email;
  otpEmail.textContent = email;
  clearOtpInputs();
  otpMsg.classList.remove("show", "error");
  otpMsg.textContent = "";
  otpModal.hidden = false;
  document.body.style.overflow = "hidden";
  lockResend(30);
  window.setTimeout(function () { if (otpInputs[0]) otpInputs[0].focus(); }, 30);
}

function closeOtp() {
  otpModal.hidden = true;
  pendingLoginEmail = "";
  document.body.style.overflow = "";
  clearOtpInputs();
  unlockResend();
  if (otpVerify) otpVerify.disabled = false;
  if (otpCancel) otpCancel.disabled = false;
}

function enteredOtp() {
  return otpInputs.map(function (input) { return input.value; }).join("");
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

  PIAuth.requestLoginOtp(u, p)
    .then(function (res) {
      if (res.status === "approved" && res.otpRequired) {
        flash("OTP sent. Please check your email.", false);
        openOtp(res.email);
      } else if (res.status === "rejected") {
        flash("Your application was not approved. Please contact our trading desk.", true);
        setLoginBusy(false);
      } else {
        flash("Your account is awaiting admin approval. We'll email you once it's active.", true);
        setLoginBusy(false);
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
  closeOtp();
  setLoginBusy(false);
});

otpInputs.forEach(function (input, index) {
  input.addEventListener("input", function () {
    input.value = input.value.replace(/\D/g, "").slice(0, 1);
    if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && !input.value && index > 0) otpInputs[index - 1].focus();
    if (e.key === "Enter") verifyOtp();
  });

  input.addEventListener("paste", function (e) {
    e.preventDefault();
    var digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6).split("");
    digits.forEach(function (digit, digitIndex) {
      if (otpInputs[digitIndex]) otpInputs[digitIndex].value = digit;
    });
    if (digits.length) otpInputs[Math.min(digits.length, otpInputs.length) - 1].focus();
  });
});

function verifyOtp() {
  var code = enteredOtp();
  if (!pendingLoginEmail) { flashTo(otpMsg, "Please sign in again to request a new code.", true); return; }
  if (code.length < 6) { flashTo(otpMsg, "Enter all 6 digits.", true); return; }

  otpVerify.disabled = true;
  otpCancel.disabled = true;
  flashTo(otpMsg, "Verifying…", false);

  PIAuth.verifyLoginOtp(pendingLoginEmail, code)
    .then(function (res) {
      if (res.status === "approved") {
        flashTo(otpMsg, "Verified. Loading the inventory…", false);
        window.setTimeout(function () { window.location.href = STOCK_URL; }, 450);
      } else if (res.status === "rejected") {
        flashTo(otpMsg, "Your application was not approved. Please contact our trading desk.", true);
        otpVerify.disabled = false;
        otpCancel.disabled = false;
        setLoginBusy(false);
      } else {
        flashTo(otpMsg, "Your account is awaiting admin approval.", true);
        otpVerify.disabled = false;
        otpCancel.disabled = false;
        setLoginBusy(false);
      }
    })
    .catch(function (err) {
      flashTo(otpMsg, err.message || "That code is incorrect or has expired.", true);
      otpVerify.disabled = false;
      otpCancel.disabled = false;
    });
}

otpVerify.addEventListener("click", verifyOtp);

otpCancel.addEventListener("click", function () {
  closeOtp();
  setLoginBusy(false);
  flash("Login cancelled. Enter your password to request a fresh code.", true);
});

otpResend.addEventListener("click", function () {
  if (!pendingLoginEmail) { flashTo(otpMsg, "Please sign in again to request a new code.", true); return; }
  otpResend.disabled = true;
  flashTo(otpMsg, "Sending a new code…", false);
  PIAuth.resendLoginOtp(pendingLoginEmail)
    .then(function () {
      clearOtpInputs();
      flashTo(otpMsg, "A new code has been sent.", false);
      lockResend(30);
      if (otpInputs[0]) otpInputs[0].focus();
    })
    .catch(function (err) {
      flashTo(otpMsg, err.message || "Could not resend the code. Please try again.", true);
      unlockResend();
    });
});
