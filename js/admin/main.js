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

function eventRowClass(eventType){
  if(eventType === "bite_rate_exceeded") return "eventBiteRateExceeded";
  if(eventType === "admin_secret_bruteforce") return "eventBruteforce";
  if(eventType.indexOf("burst") !== -1) return "eventBurst";
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
    tbody.appendChild(tr);
  });
  document.getElementById("summarySection").classList.toggle("hidden", list.length === 0);
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
    document.getElementById("summarySection").classList.add("hidden");
    document.getElementById("logSection").classList.add("hidden");
    return;
  }
  setStatus(data.length + " rows loaded.");
  renderSummary(data);
  renderLog(data);
  document.getElementById("refreshBtn").classList.remove("hidden");
}

document.getElementById("secretInput").value = readStoredSecret();
document.getElementById("loadBtn").addEventListener("click", load);
document.getElementById("refreshBtn").addEventListener("click", load);
document.getElementById("secretInput").addEventListener("keydown", function(e){
  if(e.key === "Enter") load();
});
