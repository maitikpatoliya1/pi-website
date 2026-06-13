/* Pansuriya Impex — interactions */

// Header: solid background after scrolling
const header = document.querySelector(".site-header");
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 40);
}, { passive: true });

// Mobile nav toggle
const navToggle = document.querySelector(".nav-toggle");
navToggle.addEventListener("click", () => {
  document.body.classList.toggle("nav-open");
});
document.querySelectorAll(".main-nav a").forEach((link) => {
  link.addEventListener("click", () => document.body.classList.remove("nav-open"));
});

// Reveal-on-scroll
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// Animated stat counters
function animateCount(el) {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || "";
  const duration = 1600;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const statObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll(".stat-number").forEach(animateCount);
        statObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.4 }
);
const statsBar = document.querySelector(".stats-bar");
if (statsBar) statObserver.observe(statsBar);

// Active nav link based on scroll position
const sections = ["about", "collection", "education", "faqs"];
window.addEventListener("scroll", () => {
  let current = "top";
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top < 140) current = id;
  });
  document.querySelectorAll(".main-nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + current);
  });
}, { passive: true });
