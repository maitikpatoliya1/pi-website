/* Pansuriya Impex — login page interactions (client-side demo, no backend) */

const form = document.getElementById("loginForm");
const username = document.getElementById("username");
const password = document.getElementById("password");
const msg = document.getElementById("formMsg");
const toggle = document.getElementById("togglePassword");

// Show / hide password
toggle.addEventListener("click", () => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  toggle.classList.toggle("is-visible", !showing);
  toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

function flash(text, isError) {
  msg.textContent = text;
  msg.classList.toggle("error", !!isError);
  msg.classList.add("show");
}

// Submit
form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!username.value.trim() || !password.value.trim()) {
    flash("Please enter both your username and password.", true);
    return;
  }

  flash("Signing you in…", false);

  // Demo only: there is no auth backend, so we simply acknowledge and
  // return the visitor to the home page.
  setTimeout(() => {
    window.location.href = "index.html";
  }, 900);
});

// Reset clears the inline message too
form.addEventListener("reset", () => {
  msg.classList.remove("show", "error");
  msg.textContent = "";
  toggle.classList.remove("is-visible");
  password.type = "password";
});
