/* ============================================================
   Pansuriya Impex — Orders / Pending confirmation (staff)
   ------------------------------------------------------------
   Salespeople (and stock managers / admins) review proformas that
   customers issued from their cart, then Accept or Raise issue.
   Backed by the Supabase `orders` table (RLS: staff see all).
   Exposes window.PIOrders.render() into #ordersRoot.
   ============================================================ */
(function (global) {
  "use strict";
  function sb() { return global.PI_SB; }
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(n) {
    if (n == null || n === "") return "-";
    return "$" + (+n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function when(ts) {
    if (!ts) return "-";
    try { return new Date(ts).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return "-"; }
  }
  var STATUS_LABEL = {
    pending_confirmation: "Pending confirmation", confirmed: "Confirmed",
    issue_raised: "Issue raised", cancelled: "Cancelled"
  };
  function statusLabel(s) { return STATUS_LABEL[s] || s; }

  var activeStatus = "pending_confirmation";
  var query = "";
  var rows = [];
  var selected = {};

  function pillsHTML(counts) {
    return [["pending_confirmation", "Pending"], ["confirmed", "Confirmed"], ["issue_raised", "Issues"], ["all", "All"]]
      .map(function (p) {
        return '<button class="ord-pill' + (activeStatus === p[0] ? " active" : "") + '" data-ostatus="' + p[0] + '">' +
          p[1] + ' <span class="ord-cnt">' + (counts[p[0]] || 0) + "</span></button>";
      }).join("");
  }

  function rowHTML(o) {
    var disc = o.discount != null ? ((+o.discount > 0 ? "+" : "") + o.discount + "%") : "-";
    var who = [o.customer_company, o.customer_name].filter(Boolean).join(" · ");
    var actions = o.status === "pending_confirmation"
      ? '<button type="button" class="ord-issue" data-issue="' + esc(o.id) + '">Raise issue</button>' +
        '<button type="button" class="ord-accept" data-accept="' + esc(o.id) + '">Accept</button>'
      : '<span class="ord-handled">' + esc(statusLabel(o.status)) + "</span>";
    return '<tr>' +
      '<td class="ord-check">' + (o.status === "pending_confirmation"
        ? '<input type="checkbox" data-sel="' + esc(o.id) + '"' + (selected[o.id] ? " checked" : "") + ">" : "") + "</td>" +
      "<td><b>" + esc(o.stock_id || "-") + "</b></td>" +
      '<td class="ord-product"><div>' + esc(o.description || "-") + "</div>" +
        '<span>' + esc([o.lab, o.certificate].filter(Boolean).join(" ")) + "</span>" +
        (who ? '<span class="ord-cust">' + esc(who) + "</span>" : "") + "</td>" +
      "<td>" + when(o.created_at) + "</td>" +
      "<td>" + esc(o.order_ref || "-") + "</td>" +
      "<td>" + money(o.amount) + "</td>" +
      "<td>" + esc(o.bank_rate || "N/A") + "</td>" +
      '<td class="ord-disc">' + esc(disc) + "</td>" +
      '<td><span class="ord-status ' + esc(o.status) + '">' + esc(statusLabel(o.status)) + "</span></td>" +
      '<td class="ord-actions">' + actions + "</td>" +
    "</tr>";
  }

  function paint() {
    var counts = { pending_confirmation: 0, confirmed: 0, issue_raised: 0, cancelled: 0, all: rows.length };
    rows.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });

    var pe = $("ordersPills");
    if (pe) {
      pe.innerHTML = pillsHTML(counts);
      Array.prototype.forEach.call(pe.querySelectorAll(".ord-pill"), function (b) {
        b.addEventListener("click", function () { activeStatus = b.getAttribute("data-ostatus"); selected = {}; paint(); });
      });
    }

    var q = query.trim().toLowerCase();
    var list = rows.filter(function (o) {
      if (activeStatus !== "all" && o.status !== activeStatus) return false;
      if (!q) return true;
      return [o.stock_id, o.description, o.certificate, o.order_ref, o.customer_name, o.customer_company]
        .filter(Boolean).join(" ").toLowerCase().indexOf(q) > -1;
    });

    var body = $("ordersTbody");
    if (!body) return;
    body.innerHTML = list.length
      ? list.map(rowHTML).join("")
      : '<tr><td colspan="10" class="ord-empty"><svg class="ic"><use href="#ic-inbox"/></svg>No ' +
        (activeStatus === "all" ? "" : statusLabel(activeStatus).toLowerCase() + " ") + "orders.</td></tr>";

    wireRows(body);
    var cnt = $("ordersCount");
    if (cnt) cnt.textContent = list.length + (list.length === 1 ? " order" : " orders");
    updateConfirmBtn();
  }

  function wireRows(body) {
    Array.prototype.forEach.call(body.querySelectorAll("[data-accept]"), function (b) {
      b.addEventListener("click", function () { b.disabled = true; accept([b.getAttribute("data-accept")]); });
    });
    Array.prototype.forEach.call(body.querySelectorAll("[data-issue]"), function (b) {
      b.addEventListener("click", function () { raiseIssue(b.getAttribute("data-issue")); });
    });
    Array.prototype.forEach.call(body.querySelectorAll("[data-sel]"), function (cb) {
      cb.addEventListener("change", function () {
        selected[cb.getAttribute("data-sel")] = cb.checked;
        updateConfirmBtn();
      });
    });
  }

  function selectedIds() { return Object.keys(selected).filter(function (k) { return selected[k]; }); }
  function updateConfirmBtn() {
    var btn = $("ordersConfirmBtn");
    if (!btn) return;
    var n = selectedIds().length;
    btn.disabled = n === 0;
    btn.textContent = n ? "Confirm " + n + " selected" : "Confirm selected orders";
  }

  function accept(ids) {
    if (!ids.length) return Promise.resolve();
    return sb().auth.getUser().then(function (u) {
      var uid = u.data.user && u.data.user.id;
      return sb().from("orders").update({ status: "confirmed", handled_by: uid, handled_at: new Date().toISOString() }).in("id", ids);
    }).then(function (r) {
      if (r && r.error) { alert("Could not accept: " + r.error.message); return; }
      ids.forEach(function (id) { delete selected[id]; });
      load();
    });
  }
  function raiseIssue(id) {
    var note = global.prompt("Describe the issue with this order (the customer will be notified):", "");
    if (note === null) return;
    sb().auth.getUser().then(function (u) {
      var uid = u.data.user && u.data.user.id;
      return sb().from("orders").update({ status: "issue_raised", issue_note: note, handled_by: uid, handled_at: new Date().toISOString() }).eq("id", id);
    }).then(function (r) {
      if (r && r.error) { alert("Could not raise issue: " + r.error.message); return; }
      load();
    });
  }

  function load() {
    var body = $("ordersTbody");
    if (body) body.innerHTML = '<tr><td colspan="10" class="ord-loading">Loading…</td></tr>';
    return sb().from("orders").select("*").order("created_at", { ascending: false }).then(function (r) {
      if (r.error) {
        if (body) body.innerHTML = '<tr><td colspan="10" class="ord-empty">Could not load orders: ' + esc(r.error.message) + "</td></tr>";
        return;
      }
      rows = r.data || [];
      paint();
    });
  }

  function render() {
    var root = $("ordersRoot");
    if (!root) return;
    root.innerHTML =
      '<div class="orders-page">' +
        '<div class="orders-head">' +
          '<div><h1 class="orders-title">Pending confirmation</h1>' +
            '<p class="orders-sub">Proformas your customers issued from the cart — accept to confirm, or raise an issue. <span id="ordersCount"></span></p></div>' +
          '<button type="button" class="orders-confirm-btn" id="ordersConfirmBtn" disabled>Confirm selected orders</button>' +
        "</div>" +
        '<div class="orders-search"><svg class="ic"><use href="#ic-search"/></svg>' +
          '<input id="ordersSearch" type="search" autocomplete="off" placeholder="Search stock ID, certificate, order ref, customer…"></div>' +
        '<div class="orders-pills" id="ordersPills"></div>' +
        '<div class="orders-table-wrap"><table class="orders-table"><thead><tr>' +
          "<th></th><th>Stock ID</th><th>Product information</th><th>Order date</th><th>Order Ref</th>" +
          "<th>Amount</th><th>Bank rate</th><th>Discount</th><th>Status</th><th>Actions</th>" +
        '</tr></thead><tbody id="ordersTbody"></tbody></table></div>' +
      "</div>";

    $("ordersSearch").addEventListener("input", function () { query = this.value; paint(); });
    $("ordersConfirmBtn").addEventListener("click", function () { accept(selectedIds()); });
    load();
  }

  global.PIOrders = { render: render };
})(window);
