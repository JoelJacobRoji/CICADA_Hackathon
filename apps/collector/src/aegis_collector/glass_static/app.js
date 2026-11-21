"use strict";
// AEGIS Privacy Glass. All data is rendered with textContent only (no HTML parsing of data).
(function () {
  let token = null; // memory only

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function show(node, on) { node.hidden = !on; }

  async function api(path) {
    const r = await fetch(path, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    if (r.status === 401) throw new Error("Token rejected (401).");
    if (r.status === 404) throw new Error("Nothing to show yet: no payload of that kind has been ledgered.");
    if (!r.ok) throw new Error("Request failed: HTTP " + r.status);
    return r.json();
  }

  // Pretty JSON with sensitive lines highlighted (source_id, tenant_id, message, attributes, event_id).
  const SENSITIVE = /^\s*"(source_id|tenant_id|message|event_id|user|src_ip|password|attributes)"/;
  function jsonBlock(obj, highlight) {
    const pre = el("pre", "json");
    const lines = JSON.stringify(obj, null, 2).split("\n");
    let inAttrs = false;
    for (const line of lines) {
      const span = el("span", null, line + "\n");
      if (highlight) {
        if (/^\s*"attributes": \{/.test(line)) inAttrs = true;
        if (SENSITIVE.test(line) || inAttrs) span.className = "sens";
        if (inAttrs && /^\s*\}/.test(line)) inAttrs = false;
      }
      pre.appendChild(span);
    }
    return pre;
  }

  function kv(parent, k, v, cls) {
    const row = el("div", "kv");
    row.appendChild(el("span", "k", k));
    row.appendChild(el("span", "v " + (cls || ""), v));
    parent.appendChild(row);
  }

  function verdict(parent, ok, title, detail) {
    const box = el("div", "verdict " + (ok === true ? "ok" : ok === false ? "bad" : "warn"));
    box.appendChild(el("div", "mark", ok === true ? "✓" : ok === false ? "✗" : "…"));
    const t = el("div");
    t.appendChild(el("strong", null, title));
    t.appendChild(el("p", null, detail));
    box.appendChild(t);
    parent.appendChild(box);
  }

  const SHOWN = 3;
  function renderRecords(c1, c2, view) {
    clear(c1); clear(c2);
    if (view.note) {
      c1.appendChild(el("p", "muted", view.note));
      c2.appendChild(el("p", "muted", view.note));
      return;
    }
    const recs = view.raw_records;
    if (!recs.length) {
      const msg = "No raw records for this source and window are still stored locally (retention purge), or none matched.";
      c1.appendChild(el("p", "muted", msg));
      c2.appendChild(el("p", "muted", msg));
      return;
    }
    const contributed = recs.filter((r) => r.contributed).length;
    c1.appendChild(el("p", "muted",
      recs.length + " local record(s) from " + (view.local_source_name || "?") + " in this window; " +
      contributed + " went into this payload (the rest belong to other summaries or never leave)."));
    c2.appendChild(el("p", "muted", "Same records as the console shows them."));
    recs.slice(0, SHOWN).forEach((r) => {
      const tag = r.contributed ? "in this payload" : "not in this payload";
      const h1 = el("div", "rechead");
      h1.appendChild(el("span", "chip " + (r.contributed ? "in" : "stay"), tag));
      h1.appendChild(el("span", "muted", r.record_type + " · " + r.event_ts_utc));
      c1.appendChild(h1);
      c1.appendChild(jsonBlock(r.raw, true));

      const h2 = el("div", "rechead");
      h2.appendChild(el("span", "chip " + (r.contributed ? "in" : "stay"), tag));
      if (r.findings.length) r.findings.forEach((f) => h2.appendChild(el("span", "chip find", f)));
      c2.appendChild(h2);
      c2.appendChild(jsonBlock(r.masked, false));
    });
    if (recs.length > SHOWN) {
      const more = "+ " + (recs.length - SHOWN) + " more record(s) of the same shape";
      c1.appendChild(el("p", "muted", more));
      c2.appendChild(el("p", "muted", more));
    }
  }

  function renderOutbound(c3, view) {
    clear(c3);
    const o = view.outbound;
    c3.appendChild(jsonBlock(o.payload, false));
    kv(c3, "Kind", view.kind);
    kv(c3, "Payload ID", view.payload_id, "mono");
    kv(c3, "Size", o.bytes + " bytes");
    kv(c3, "Ledger SHA-256", o.ledger_sha256, "mono");
    kv(c3, "Recomputed now", o.recomputed_sha256, "mono " + (o.ledger_hash_ok ? "good" : "badtxt"));
    kv(c3, "Ledger seq", String(view.ledger_seq));
    kv(c3, "Outbox", view.outbox.status + (view.outbox.ack_kind ? " (" + view.outbox.ack_kind + ")" : ""));
  }

  function renderReceipt(c4, view) {
    clear(c4);
    const r = view.receipt;
    if (r.status === "ok") {
      const badge = el("div", "big " + (view.hash_match ? "good" : "badtxt"),
        view.hash_match ? "✓ Hashes match" : "✗ Hash mismatch");
      c4.appendChild(badge);
      kv(c4, "SaaS SHA-256", r.payload_sha256, "mono " + (view.hash_match ? "good" : "badtxt"));
      kv(c4, "Collector SHA-256", view.outbound.ledger_sha256, "mono");
      kv(c4, "Received at (UTC)", r.received_at);
      kv(c4, "Region", r.region);
      kv(c4, "Stored as", r.kind);
      c4.appendChild(el("p", "muted",
        "Fetched just now over the collector's outbound connection with its own token. The SaaS returns only the hash, and only for this collector's payloads."));
    } else {
      const words = {
        not_received: view.outbox.status === "delivered"
          ? "The SaaS acknowledged this payload but returned no receipt for it (HTTP 404)."
          : "Not received yet: the payload is still queued (outbox: " + view.outbox.status + ").",
        unreachable: "SaaS unreachable right now (" + r.detail + "). The payload stays in the outbox until it is acknowledged.",
        disabled: "Sender disabled on this collector (no collector token).",
        error: "Receipt lookup failed (" + r.detail + ").",
      };
      c4.appendChild(el("div", "big warntxt", "… No receipt"));
      c4.appendChild(el("p", null, words[r.status] || r.status));
    }
  }

  function renderVerdicts(view) {
    const v = $("verdicts");
    clear(v);
    const lc = view.leak_check;
    verdict(v, lc.found_in_outbound === 0,
      lc.found_in_outbound === 0 ? "No sensitive value left" : lc.found_in_outbound + " sensitive value(s) found in outbound",
      lc.sensitive_values_checked + " sensitive values from column 1 searched in column 3." +
        (lc.hits.length ? " Hits: " + lc.hits.join(", ") : ""));
    verdict(v, view.outbound.ledger_hash_ok, "Ledger intact",
      "SHA-256 recomputed from the stored bytes equals the ledger entry.");
    const rs = view.receipt.status;
    verdict(v, rs === "ok" ? view.hash_match : null,
      rs === "ok" ? (view.hash_match ? "SaaS received exactly these bytes" : "SaaS hash differs") : "Awaiting SaaS receipt",
      rs === "ok" ? "Collector and SaaS SHA-256 are identical." : "See column 4.");
    show(v, true);
  }

  async function load(query) {
    const err = $("loadErr");
    show(err, false);
    try {
      const view = await api("/local/glass" + query);
      renderVerdicts(view);
      renderRecords($("c1"), $("c2"), view);
      renderOutbound($("c3"), view);
      renderReceipt($("c4"), view);
      show($("columns"), true);
    } catch (e) {
      err.textContent = e.message;
      show(err, true);
    }
  }

  async function scan() {
    const out = $("scan");
    clear(out);
    out.appendChild(el("p", "muted", "Scanning…"));
    try {
      const s = await api("/local/glass/leakscan");
      clear(out);
      const v = el("div", "verdicts");
      verdict(v, s.found === 0,
        s.found === 0 ? "0 leaks" : s.found + " sensitive value(s) found in egress",
        "Searched " + s.payloads_scanned + " ledgered payload(s)" +
          (s.payloads_total > s.payloads_scanned ? " (latest of " + s.payloads_total + ")" : "") +
          " for " + s.sensitive_values_checked + " sensitive value(s) from " +
          s.records_with_findings + " local record(s) with secret findings." +
          (s.hits.length ? " Hits: " + s.hits.join(", ") : ""));
      out.appendChild(v);
      if (!s.examples.length) {
        out.appendChild(el("p", "muted", "No local records with secret findings yet. Run scenario S1 (the demo timeline includes it at +30 s)."));
        return;
      }
      const ex = s.examples[0];
      const pair = el("div", "pair");
      const a = el("div", "col");
      a.appendChild(el("h3", null, "Raw (local only) · " + ex.source_id));
      a.appendChild(jsonBlock(ex.raw, true));
      const b = el("div", "col");
      const hb = el("h3", null, "Masked · findings: ");
      b.appendChild(hb);
      const chips = el("div", "rechead");
      ex.findings.forEach((f) => chips.appendChild(el("span", "chip find", f)));
      b.appendChild(chips);
      b.appendChild(jsonBlock(ex.masked, false));
      pair.appendChild(a); pair.appendChild(b);
      out.appendChild(pair);
    } catch (e) {
      clear(out);
      out.appendChild(el("p", "err", e.message));
    }
  }

  async function unlock() {
    const t = $("token").value.trim();
    const err = $("unlockErr");
    show(err, false);
    if (!t) return;
    token = t;
    try {
      const r = await fetch("/local/egress/verify", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error(r.status === 401 ? "Token rejected." : "HTTP " + r.status);
      $("token").value = "";
      show($("unlock"), false);
      show($("app"), true);
      load(""); // latest security summary, else latest metric summary
    } catch (e) {
      token = null;
      err.textContent = e.message;
      show(err, true);
    }
  }

  $("unlockBtn").addEventListener("click", unlock);
  $("token").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
  document.querySelectorAll("button[data-kind]").forEach((b) =>
    b.addEventListener("click", () => load("?kind=" + encodeURIComponent(b.dataset.kind))));
  $("openBtn").addEventListener("click", () => {
    const v = $("pid").value.trim();
    if (v) load("?payload_id=" + encodeURIComponent(v));
  });
  $("scanBtn").addEventListener("click", scan);
})();
