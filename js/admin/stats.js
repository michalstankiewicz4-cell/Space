// Statistics for admin.html (supabase/schema.sql#admin_stats): stat tiles
// and three single-series bar charts — players online (peak per hour, as
// the steward reports it), connections per hour, new accounts per day.
// Plain SVG, no library; one hue (the theme's teal), thin bars with a 2 px
// gap, a recessive axis, a hover tooltip per bar. Every text is set with
// textContent.
const SVG = "http://www.w3.org/2000/svg";
const W = 900, H = 170, PAD_L = 34, PAD_B = 22, PAD_T = 8;

function el(tag, attrs, parent){
  const e = document.createElementNS(SVG, tag);
  Object.keys(attrs || {}).forEach(function(k){ e.setAttribute(k, attrs[k]); });
  if(parent) parent.appendChild(e);
  return e;
}

let tip = null;
function showTip(e, text){
  if(!tip){ tip = document.createElement("div"); tip.id = "statsTip"; document.body.appendChild(tip); }
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = (e.pageX + 12) + "px";
  tip.style.top = (e.pageY - 28) + "px";
}
function hideTip(){ if(tip) tip.style.display = "none"; }

// points: [{ label, value, tip, tick }], evenly spaced; a label under the
// points with tick: true, or every tickEvery-th one
function barChart(box, title, points, tickEvery, emptyText){
  box.textContent = "";
  const h = document.createElement("h3");
  h.textContent = title;
  box.appendChild(h);
  if(!points.length){
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = emptyText;
    box.appendChild(p);
    return;
  }
  const max = Math.max(1, Math.max.apply(null, points.map(function(p){ return p.value; })));
  // an even top, so the half-way gridline is a whole number too
  const nice = max <= 4 ? 4 : max <= 10 ? Math.ceil(max / 2) * 2 : Math.ceil(max / 10) * 10;
  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "statsChart", role: "img", "aria-label": title }, box);
  const plotW = W - PAD_L - 22, plotH = H - PAD_B - PAD_T, base = PAD_T + plotH;
  [0, 0.5, 1].forEach(function(f){
    const y = PAD_T + plotH * (1 - f);
    el("line", { x1: PAD_L, x2: W - 22, y1: y, y2: y, class: f === 0 ? "axis" : "grid" }, svg);
    const t = el("text", { x: PAD_L - 6, y: y + 4, class: "tick", "text-anchor": "end" }, svg);
    t.textContent = String(Math.round(nice * f));
  });
  const slot = plotW / points.length, bw = Math.max(1, slot - 2);
  points.forEach(function(p, i){
    const x = PAD_L + i * slot + 1;
    const bh = p.value > 0 ? Math.max(2, plotH * p.value / nice) : 0;
    // the hit target is the whole column, so thin bars are easy to hover
    const hit = el("rect", { x: x - 1, y: PAD_T, width: slot, height: plotH, class: "hit" }, svg);
    if(bh > 0){
      const r = Math.min(4, bw / 2, bh), y = base - bh;
      el("path", { class: "bar", d: "M" + x + "," + base + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
        "H" + (x + bw - r) + "Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + "V" + base + "Z" }, svg);
    }
    hit.addEventListener("mousemove", function(e){ showTip(e, p.tip); });
    hit.addEventListener("mouseleave", hideTip);
    if(p.tick != null ? p.tick : i % tickEvery === 0){
      const t = el("text", { x: x + bw / 2, y: H - 6, class: "tick", "text-anchor": "middle" }, svg);
      t.textContent = p.label;
    }
  });
}

// The Supabase Free plan's limits the usage tiles measure against (check
// them in the project's settings if the plan changes).
const LIMITS = { dbBytes: 500 * 1048576, mau: 50000 };

// share (0..1, optional): a usage bar under the label, green → amber → red
function tile(parent, value, label, share){
  const d = document.createElement("div");
  d.className = "statTile";
  const v = document.createElement("b");
  v.textContent = value;
  const l = document.createElement("span");
  l.textContent = label;
  d.append(v, l);
  if(share != null){
    const bar = document.createElement("div");
    bar.className = "statBar " + (share >= 0.85 ? "high" : share >= 0.6 ? "mid" : "low");
    const fill = document.createElement("i");
    fill.style.width = Math.min(100, Math.max(0.5, share * 100)).toFixed(1) + "%";
    bar.appendChild(fill);
    d.appendChild(bar);
  }
  parent.appendChild(d);
}

const pad = function(n){ return (n < 10 ? "0" : "") + n; };

export function renderStats(data){
  const sec = document.getElementById("statsSection");
  if(!data){ sec.classList.add("hidden"); return; }
  sec.classList.remove("hidden");
  const T = data.totals || {};
  const tiles = document.getElementById("statTiles");
  tiles.textContent = "";
  tile(tiles, T.seen_24h, "players seen, 24 h");
  tile(tiles, T.seen_7d, "players seen, 7 days");
  tile(tiles, T.players, "players with a nick");
  tile(tiles, T.accounts, "anonymous accounts");
  // the plan's usage, on a row of its own
  const usage = document.createElement("div");
  usage.className = "statUsage";
  tiles.appendChild(usage);
  const pct = function(x){ return x < 0.1 ? (x * 100).toFixed(2) : (x * 100).toFixed(1); };
  const db = T.db_bytes / LIMITS.dbBytes;
  tile(usage, pct(db) + " %", "database: " + (T.db_bytes / 1048576).toFixed(1) + " of 500 MB", db);
  if(T.mau != null){
    const mau = T.mau / LIMITS.mau;
    tile(usage, pct(mau) + " %", "monthly active accounts: " + T.mau.toLocaleString("en-US") + " of 50,000", mau);
  }

  // hourly, the last 72 h, gaps filled with zeros
  const byHour = {};
  (data.hourly || []).forEach(function(r){ byHour[new Date(r.h).getTime()] = r; });
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const hours = [];
  for(let i = 71; i >= 0; i--){
    const t = now.getTime() - i * 3600000, d = new Date(t);
    hours.push({ d: d, r: byHour[t] || { c: 0, k: 0, o: 0 }, tick: d.getHours() % 6 === 0,
      label: d.getHours() === 0 ? pad(d.getDate()) + "." + pad(d.getMonth() + 1) : pad(d.getHours()) + ":00" });
  }
  const when = function(d){ return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":00"; };
  barChart(document.getElementById("chartOnline"), "Players online — peak per hour, last 72 h",
    hours.map(function(h){ return { label: h.label, tick: h.tick, value: h.r.o, tip: when(h.d) + " — " + h.r.o + " online" }; }), 6, "No data yet.");
  barChart(document.getElementById("chartConnects"), "Connections per hour, last 72 h",
    hours.map(function(h){ return { label: h.label, tick: h.tick, value: h.r.c, tip: when(h.d) + " — " + h.r.c + " connections, " + h.r.k + " bodies eaten" }; }), 6, "No data yet.");
  const days = (data.accounts_per_day || []).map(function(r){
    const d = new Date(r.d);
    return { label: pad(d.getDate()) + "." + pad(d.getMonth() + 1), value: r.n, tip: r.d + " — " + r.n + " new accounts" };
  });
  barChart(document.getElementById("chartAccounts"), "New anonymous accounts per day, last 30 days", days,
    Math.max(1, Math.ceil(days.length / 10)), "No accounts in the last 30 days.");
}
