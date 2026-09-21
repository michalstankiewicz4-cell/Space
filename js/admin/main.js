import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../env.js";

// Not linked from the game (same treatment as editor.html) and safe to
// ship publicly on GitHub Pages despite calling a privileged-looking RPC:
// the anon key here is the same public one already committed in env.js,
// and admin_activity_log() (supabase/schema.sql) refuses to return
// anything without the correct secret, checked server-side against a
// SHA-256 hash — the plaintext secret never exists in this repo. Only the
// secret typed into #secretInput below decides what comes back.
const SECRET_STORAGE_KEY = "roj-admin-secret";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// admin_activity_log() requires auth.uid() to be non-null (same guard
// every other RPC in schema.sql uses) purely so brute-force attempts are
// attributable to *some* actor — this page has no real "identity" of its
// own, it just needs any anonymous session to call the RPC at all.
const ready = client.auth.signInAnonymously();

function readStoredSecret(){
  try{ return localStorage.getItem(SECRET_STORAGE_KEY) || ""; }catch(e){ return ""; }
}
function writeStoredSecret(v){
  try{ localStorage.setItem(SECRET_STORAGE_KEY, v); }catch(e){ /* ignore */ }
}

function setStatus(msg, isError){
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
}

// Convention-based, not an exact-match list, so a new rate-limited RPC
// added later (another "_spam"/"_exceeded" event type) is automatically
// categorized without this file needing to change too — a gap that bit
// set_nick_spam (1.9.2) when this only matched two hardcoded names.
function eventRowClass(eventType){
  if(eventType.indexOf("burst") !== -1) return "eventBurst";
  if(eventType.indexOf("bruteforce") !== -1) return "eventBruteforce";
  if(eventType.indexOf("spam") !== -1 || eventType.indexOf("exceeded") !== -1) return "eventSpam";
  return "";
}

function shortActor(actor){
  return actor.slice(0, 8) + "…";
}

// nick, ip and user_agent all ultimately come from something a client
// controls (nick is self-reported with no format check at the DB level;
// ip/user_agent are HTTP headers, which a script can set to anything) —
// unlike event_type/actor/created_at, which only ever come from this
// schema's own trigger/function code. Every cell below is built with
// textContent, never innerHTML, specifically so a malicious value in any
// of those fields can't run as script in this page — which, since this
// page's own admin secret lives in this same origin's localStorage,
// would otherwise be a way to steal it.
function td(text, className){
  const cell = document.createElement("td");
  if(className) cell.className = className;
  cell.textContent = text === null || text === undefined ? "" : String(text);
  return cell;
}

// Full user-agent strings are long; this is just for a scannable table
// cell, not a real parser — good enough to tell "Chrome" from "curl" from
// "python-requests" at a glance, which is the whole point of showing it.
function shortBrowser(ua){
  if(!ua) return "";
  const m = ua.match(/(Firefox|Edg|OPR|Chrome|Safari|curl|python-requests|node-fetch|PostmanRuntime)\/?([\d.]*)/);
  return m ? (m[1] + (m[2] ? " " + m[2] : "")) : ua.slice(0, 24);
}

function detailWithoutRequestMeta(detail){
  if(!detail) return {};
  const rest = {};
  Object.keys(detail).forEach(function(k){
    if(k !== "ip" && k !== "user_agent" && k !== "country") rest[k] = detail[k];
  });
  return rest;
}

// Semicolon-joined, not tab-joined — pastes straight into a spreadsheet
// with the usual Polish/European CSV delimiter, which is the whole point
// of a "copy row" button here (quick handoff to someone auditing in Excel).
function copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).catch(function(){ legacyCopy(text); });
  }else{
    legacyCopy(text);
  }
}

// Fallback for contexts where the async Clipboard API is unavailable
// (e.g. non-secure context) — same trick used nowhere else in this repo,
// but a plain execCommand("copy") via a throwaway textarea is the only
// other portable option.
function legacyCopy(text){
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand("copy"); }catch(e){ /* ignore */ }
  document.body.removeChild(ta);
}

function copyCell(getText){
  const cell = document.createElement("td");
  cell.className = "copyCell";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copyRowBtn";
  btn.textContent = "⧉";
  btn.title = "Copy row";
  btn.addEventListener("click", function(){
    copyToClipboard(getText());
    btn.textContent = "✓";
    btn.classList.add("copied");
    setTimeout(function(){ btn.textContent = "⧉"; btn.classList.remove("copied"); }, 1200);
  });
  cell.appendChild(btn);
  return cell;
}

// Date-range filter shared by both tables — a single control filters the
// same underlying rows that feed the "By actor" aggregation and the
// "Recent entries" list, so they never show inconsistent time windows.
let dateFromMs = null; // inclusive, local start-of-day, or null = no lower bound
let dateToMs = null;   // inclusive, local end-of-day, or null = no upper bound

// Parsed from the plain "YYYY-MM-DD" <input type="date"> value as local
// time (no timezone suffix), not UTC — matches what the "When" column
// itself already shows via toLocaleString(), so picking "today" here
// actually means the admin's own calendar day, not a UTC one that could
// be off by several hours depending on where they are.
function parseDateBoundary(inputId, endOfDay){
  const value = document.getElementById(inputId).value;
  if(!value) return null;
  const d = new Date(value + (endOfDay ? "T23:59:59.999" : "T00:00:00"));
  return isNaN(d.getTime()) ? null : d.getTime();
}

function getFilteredRows(){
  if(dateFromMs === null && dateToMs === null) return lastRows;
  return lastRows.filter(function(r){
    const t = new Date(r.created_at).getTime();
    if(dateFromMs !== null && t < dateFromMs) return false;
    if(dateToMs !== null && t > dateToMs) return false;
    return true;
  });
}

function updateDateFilterCount(filteredCount){
  const el = document.getElementById("dateFilterCount");
  const active = dateFromMs !== null || dateToMs !== null;
  el.textContent = active ? (filteredCount + " of " + lastRows.length + " rows in range") : "";
}

function applyDateFilter(){
  dateFromMs = parseDateBoundary("dateFromInput", false);
  dateToMs = parseDateBoundary("dateToInput", true);
  applyFiltersAndRender();
}

function clearDateFilter(){
  document.getElementById("dateFromInput").value = "";
  document.getElementById("dateToInput").value = "";
  dateFromMs = null;
  dateToMs = null;
  applyFiltersAndRender();
}

// The one place that actually re-renders both tables from lastRows —
// load(), the date filter, and (indirectly, via applySortAndRenderLog())
// the log's own column sort all funnel through here, so the two tables
// can never end up showing different date ranges from each other.
function applyFiltersAndRender(){
  const rows = getFilteredRows();
  renderAnomalyStat(rows);
  renderSummary(rows);
  applySortAndRenderLog(rows);
  updateDateFilterCount(rows.length);
}

function renderAnomalyStat(rows){
  const el = document.getElementById("anomalyStat");
  const actors = new Set(rows.map(function(r){ return r.actor; }));
  el.textContent = rows.length + " anomalies logged, across " + actors.size + " distinct actor" + (actors.size === 1 ? "" : "s") + ".";
  el.classList.remove("hidden");
}

function renderSummary(rows){
  const counts = {}; // key: actor|event_type -> { nick, count, lastSeen }
  rows.forEach(function(r){
    const key = r.actor + "|" + r.event_type;
    if(!counts[key]) counts[key] = { actor: r.actor, nick: r.nick, eventType: r.event_type, count: 0, lastSeen: r.created_at };
    counts[key].count++;
    if(r.created_at > counts[key].lastSeen) counts[key].lastSeen = r.created_at;
  });
  const list = Object.values(counts).sort(function(a, b){ return b.count - a.count; });

  const tbody = document.querySelector("#summaryTable tbody");
  tbody.innerHTML = "";
  list.forEach(function(row){
    const tr = document.createElement("tr");
    tr.className = eventRowClass(row.eventType);
    tr.appendChild(td(row.nick || "—"));
    tr.appendChild(td(shortActor(row.actor), "actor"));
    tr.appendChild(td(row.eventType, "event"));
    tr.appendChild(td(row.count));
    tr.appendChild(td(new Date(row.lastSeen).toLocaleString()));
    tr.appendChild(copyCell(function(){
      return [row.nick || "—", row.actor, row.eventType, row.count, new Date(row.lastSeen).toLocaleString()].join(";");
    }));
    tbody.appendChild(tr);
  });
  document.getElementById("summarySection").classList.toggle("hidden", list.length === 0);
}

// Multi-level column sort for #logTable — click a sortable header to add/
// toggle it, without discarding whichever other columns are already
// active. `sortKeys` is ordered by priority (index 0 = primary key,
// index 1 = tiebreaker, ...) so "click When, then click IP" sorts by IP
// only among rows that tie on When, not the other way around.
let sortKeys = []; // { col: "when"|"ip"|"actor", dir: "asc"|"desc" }[]
let lastRows = []; // the last data actually loaded from admin_activity_log, so re-sorting doesn't need a fresh request

// IPv4 dotted-quad -> a single comparable number, so "9.x" sorts before
// "185.x" (numeric column order) instead of the lexicographic string
// order a plain `<` would give ("1" < "8" by character, which happens to
// put "185.x" before "9.x" — wrong for what a human scanning IPs expects).
// Returns null for anything that isn't a clean IPv4 (missing, IPv6, or a
// malformed header value) so it can be sorted to the end explicitly.
function ipToNumber(ip){
  if(!ip) return null;
  const parts = ip.split(".");
  if(parts.length !== 4) return null;
  let n = 0;
  for(let i=0;i<4;i++){
    const part = Number(parts[i]);
    if(!Number.isInteger(part) || part < 0 || part > 255) return null;
    n = n*256 + part;
  }
  return n;
}

const SORT_VALUE_GETTERS = {
  when: function(r){ return new Date(r.created_at).getTime(); },
  ip: function(r){ return ipToNumber(r.detail ? r.detail.ip : null); },
  actor: function(r){ return r.actor || null; }
};
const SORT_LABELS = { when: "When", ip: "IP", actor: "Actor" };

// null/undefined (missing IP, etc.) always sorts to the end, regardless
// of ascending/descending — flipping "unknown" to the top on a descending
// sort would be more confusing than useful for an admin scanning the list.
function compareValues(va, vb, dir){
  if(va === null && vb === null) return 0;
  if(va === null) return 1;
  if(vb === null) return -1;
  const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : (va < vb ? -1 : (va > vb ? 1 : 0));
  return dir === "desc" ? -cmp : cmp;
}

function compareRows(a, b){
  for(let i=0; i<sortKeys.length; i++){
    const key = sortKeys[i];
    const cmp = compareValues(SORT_VALUE_GETTERS[key.col](a), SORT_VALUE_GETTERS[key.col](b), key.dir);
    if(cmp !== 0) return cmp;
  }
  return 0;
}

// Cycle: not sorted -> ascending -> descending -> not sorted (removed from
// sortKeys). A column already active keeps its priority position when
// toggling asc<->desc; only a genuinely new column gets appended as the
// new lowest-priority tiebreaker — existing keys are never reordered or
// discarded by clicking a different header.
function toggleSort(col){
  const idx = sortKeys.findIndex(function(k){ return k.col === col; });
  if(idx === -1){
    sortKeys.push({ col: col, dir: "asc" });
  } else if(sortKeys[idx].dir === "asc"){
    sortKeys[idx].dir = "desc";
  } else {
    sortKeys.splice(idx, 1);
  }
  applyFiltersAndRender();
}

function updateSortIndicators(){
  Object.keys(SORT_LABELS).forEach(function(col){
    const th = document.getElementById("logSort" + col.charAt(0).toUpperCase() + col.slice(1));
    if(!th) return;
    const idx = sortKeys.findIndex(function(k){ return k.col === col; });
    if(idx === -1){
      th.textContent = SORT_LABELS[col];
      return;
    }
    const arrow = sortKeys[idx].dir === "asc" ? "▲" : "▼";
    // Only show a priority number once more than one key is active — with
    // just one, "which is primary" isn't an interesting question yet.
    const priority = sortKeys.length > 1 ? String(idx + 1) : "";
    th.textContent = SORT_LABELS[col] + " " + arrow + priority;
  });
}

function applySortAndRenderLog(rows){
  const sorted = sortKeys.length > 0 ? rows.slice().sort(compareRows) : rows;
  renderLog(sorted);
  updateSortIndicators();
}

function renderLog(rows){
  const tbody = document.querySelector("#logTable tbody");
  tbody.innerHTML = "";
  rows.forEach(function(r){
    const tr = document.createElement("tr");
    tr.className = eventRowClass(r.event_type);
    tr.appendChild(td(new Date(r.created_at).toLocaleString()));
    tr.appendChild(td(r.nick || "—"));
    tr.appendChild(td(shortActor(r.actor), "actor"));
    tr.appendChild(td(r.event_type, "event"));
    tr.appendChild(td(r.detail ? r.detail.ip : "", "actor"));
    tr.appendChild(td(shortBrowser(r.detail ? r.detail.user_agent : ""), "actor"));
    tr.appendChild(td(JSON.stringify(detailWithoutRequestMeta(r.detail)), "detail"));
    tr.appendChild(copyCell(function(){
      return [
        new Date(r.created_at).toLocaleString(),
        r.nick || "—",
        r.actor,
        r.event_type,
        r.detail ? r.detail.ip : "",
        r.detail ? r.detail.user_agent : "",
        JSON.stringify(detailWithoutRequestMeta(r.detail)),
      ].join(";");
    }));
    tbody.appendChild(tr);
  });
  document.getElementById("logSection").classList.toggle("hidden", rows.length === 0);
}

async function load(){
  const secret = document.getElementById("secretInput").value.trim();
  if(!secret){ setStatus("Enter the secret first.", true); return; }
  writeStoredSecret(secret);

  setStatus("Loading…");
  await ready;
  const { data, error } = await client.rpc("admin_activity_log", { p_secret: secret, p_limit: 300 });
  if(error){
    setStatus("Request failed: " + error.message, true);
    return;
  }
  if(!data || data.length === 0){
    setStatus("No rows — either the secret is wrong, or there's genuinely nothing logged yet.");
    document.getElementById("anomalyStat").classList.add("hidden");
    document.getElementById("dateFilterRow").classList.add("hidden");
    document.getElementById("summarySection").classList.add("hidden");
    document.getElementById("logSection").classList.add("hidden");
    return;
  }
  setStatus(data.length + " rows loaded.");
  lastRows = data;
  // Re-applies whatever date filter + multi-level sort were already
  // active (see applyDateFilter()/toggleSort()), so a Refresh doesn't
  // silently reset either one back to "show everything, insertion order".
  applyFiltersAndRender();
  document.getElementById("dateFilterRow").classList.remove("hidden");
  document.getElementById("refreshBtn").classList.remove("hidden");
}

document.getElementById("secretInput").value = readStoredSecret();
document.getElementById("loadBtn").addEventListener("click", load);
document.getElementById("refreshBtn").addEventListener("click", load);
document.getElementById("secretInput").addEventListener("keydown", function(e){
  if(e.key === "Enter") load();
});
document.getElementById("logSortWhen").addEventListener("click", function(){ toggleSort("when"); });
document.getElementById("logSortIp").addEventListener("click", function(){ toggleSort("ip"); });
document.getElementById("logSortActor").addEventListener("click", function(){ toggleSort("actor"); });
document.getElementById("dateFromInput").addEventListener("change", applyDateFilter);
document.getElementById("dateToInput").addEventListener("change", applyDateFilter);
document.getElementById("dateFilterClearBtn").addEventListener("click", clearDateFilter);
