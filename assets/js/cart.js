/* ============================================================
   Pansuriya Impex — local cart
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "pi-cart-items";
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function svg(id, cls) { return '<svg class="' + (cls || "ic") + '"><use href="#' + id + '"/></svg>'; }
  function fmtCarat(n) { return n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "") || "0"; }
  function fmtUSD(n) {
    if (n == null) return "-";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtUSD0(n) { return n == null ? "-" : "$" + Math.round(n).toLocaleString("en-US"); }
  function flrLabel(v) {
    var map = { NONE: "None", FNT: "Faint", MED: "Medium", STG: "Strong", VST: "Very Strong", NON: "None" };
    return map[v] || (v ? String(v).charAt(0) + String(v).slice(1).toLowerCase() : "-");
  }
  function titleLine(d) {
    return [d.shape, fmtCarat(d.cts) + "ct", d.col, d.cla, d.cut || "-", d.pol, d.sym, flrLabel(d.flr)]
      .filter(Boolean).join(" ");
  }
  function imgURL(d) { return "https://www.mydiamondinfo.com/media/" + d.id + "/" + d.id + ".jpg"; }
  function allStones() {
    var nat = Array.isArray(global.PI_STOCK) ? global.PI_STOCK : [];
    var fancy = Array.isArray(global.PI_FANCY_STOCK) ? global.PI_FANCY_STOCK : [];
    return nat.concat(fancy);
  }
  function findStone(id) {
    id = String(id || "");
    var all = allStones();
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === id) return all[i];
    return null;
  }
  function snapshot(d) {
    return {
      id: d.id, lab: d.lab, rpt: d.rpt, shape: d.shape, cts: d.cts, col: d.col, cla: d.cla,
      cut: d.cut, pol: d.pol, sym: d.sym, flr: d.flr, loc: d.loc, status: d.status,
      ppc: d.ppc, total: d.total, dis: d.dis, media: d.media
    };
  }
  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(function (x) { return x && x.id; }) : [];
    } catch (e) {
      return [];
    }
  }
  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateBadges();
    global.dispatchEvent(new CustomEvent("pi-cart-change", { detail: { count: items.length } }));
  }
  function hydrated() {
    return read().map(function (item) {
      var live = findStone(item.id);
      return live ? Object.assign({}, item, live) : item;
    });
  }
  function count() { return read().length; }
  function has(id) {
    id = String(id || "");
    return read().some(function (item) { return String(item.id) === id; });
  }
  function add(d) {
    if (!d || !d.id) return false;
    var items = read();
    if (items.some(function (item) { return String(item.id) === String(d.id); })) {
      updateBadges();
      return false;
    }
    items.push(snapshot(d));
    write(items);
    return true;
  }
  function remove(id) {
    id = String(id || "");
    write(read().filter(function (item) { return String(item.id) !== id; }));
    render();
  }
  function clear() {
    write([]);
    render();
  }
  function updateBadges() {
    var n = count();
    var badge = $("cartCount");
    if (badge) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
    }
    document.querySelectorAll("[data-cart-nav-count]").forEach(function (el) {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  }
  function stats(items) {
    return items.reduce(function (acc, item) {
      acc.cts += +item.cts || 0;
      acc.total += +item.total || 0;
      return acc;
    }, { cts: 0, total: 0 });
  }
  function actionButton(label) {
    return '<button type="button" class="cart-action-btn" data-cart-action="' + esc(label.toLowerCase()) + '">' + esc(label) + "</button>";
  }
  function itemHTML(item) {
    var disc = item.dis != null ? (item.dis > 0 ? "+" + item.dis : item.dis) + "%" : "-";
    return '<article class="cart-item" data-cart-id="' + esc(item.id) + '">' +
      '<div class="cart-item-media">' +
        '<img src="' + esc(imgURL(item)) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'" />' +
      "</div>" +
      '<div class="cart-item-main">' +
        '<div class="cart-item-top">' +
          '<span class="cart-item-lab">' + esc(item.lab || "-") + "</span>" +
          '<span class="cart-item-status">' + esc(item.status || "-") + "</span>" +
        "</div>" +
        "<h2>" + esc(titleLine(item)) + "</h2>" +
        '<div class="cart-item-meta">' +
          "<span>Stock ID <b>" + esc(item.id || "-") + "</b></span>" +
          "<span>Certificate <b>" + esc(item.rpt || "-") + "</b></span>" +
          "<span>Location <b>" + esc(item.loc || "-") + "</b></span>" +
        "</div>" +
      "</div>" +
      '<div class="cart-item-price">' +
        "<span>Price/Ct <b>" + fmtUSD0(item.ppc) + "/ct</b></span>" +
        "<strong>" + fmtUSD(item.total) + "</strong>" +
        "<em>" + esc(disc) + "</em>" +
      "</div>" +
      '<button type="button" class="cart-remove" data-cart-remove="' + esc(item.id) + '" aria-label="Remove from cart">' + svg("ic-close") + "</button>" +
    "</article>";
  }
  function render() {
    var root = $("cartRoot");
    if (!root) return;
    var items = hydrated();
    var sum = stats(items);
    root.innerHTML =
      '<section class="cart-shell">' +
        '<div class="cart-head">' +
          "<div><h1>Cart</h1><p>" + items.length + " stone" + (items.length === 1 ? "" : "s") + " selected for checkout documents.</p></div>" +
          '<button type="button" class="btn-ghost cart-clear" data-cart-clear' + (items.length ? "" : " disabled") + ">Clear cart</button>" +
        "</div>" +
        '<div class="cart-summary">' +
          "<div><span>Stones</span><strong>" + items.length.toLocaleString("en-US") + "</strong></div>" +
          "<div><span>Total carats</span><strong>" + sum.cts.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ct</strong></div>" +
          "<div><span>Total amount</span><strong>" + fmtUSD(sum.total) + "</strong></div>" +
        "</div>" +
        '<div class="cart-actions" aria-label="Cart document actions">' +
          actionButton("Proforma") + actionButton("Hold") + actionButton("Memo") + actionButton("Invoice") +
        "</div>" +
        '<p class="cart-message" id="cartMessage" role="status" aria-live="polite"></p>' +
        (items.length ? '<div class="cart-list">' + items.map(itemHTML).join("") + "</div>" :
          '<div class="cart-empty">' + svg("ic-cart") + "<h2>Your cart is empty</h2><p>Add stones from the stock page to prepare Proforma, Hold, Memo, or Invoice actions.</p></div>") +
      "</section>";
    root.querySelectorAll("[data-cart-action]").forEach(function (btn) { btn.disabled = items.length === 0; });
  }

  document.addEventListener("click", function (e) {
    var removeBtn = e.target.closest("[data-cart-remove]");
    if (removeBtn) {
      remove(removeBtn.getAttribute("data-cart-remove"));
      return;
    }
    if (e.target.closest("[data-cart-clear]")) {
      clear();
      return;
    }
    var action = e.target.closest("[data-cart-action]");
    if (action) {
      var msg = $("cartMessage");
      if (msg) msg.textContent = action.textContent.trim() + " selected for " + count() + " stone" + (count() === 1 ? "." : "s.");
    }
  });

  global.PICart = { add: add, remove: remove, clear: clear, count: count, has: has, render: render, updateBadges: updateBadges };
  updateBadges();
})(window);
