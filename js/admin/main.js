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

function renderSummary(rows){
  const counts = {}; // key: actor|event_type -> { count, lastSeen }
  rows.forEach(function(r){
    const key = r.actor + "|" + r.event_type;
    if(!counts[key]) counts[key] = { actor: r.actor, eventType: r.event_type, count: 0, lastSeen: r.created_at };
    counts[key].count++;
    if(r.created_at > counts[key].lastSeen) counts[key].lastSeen = r.created_at;
  });
  const list = Object.values(counts).sort(function(a, b){ return b.count - a.count; });

  const tbody = document.querySelector("#summaryTable tbody");
  tbody.innerHTML = "";
  list.forEach(function(row){
    const tr = document.createElement("tr");
    tr.className = eventRowClass(row.eventType);
    tr.innerHTML =
      '<td class="actor">' + shortActor(row.actor) + "</td>" +
      '<td class="event">' + row.eventType + "</td>" +
      "<td>" + row.count + "</td>" +
      "<td>" + new Date(row.lastSeen).toLocaleString() + "</td>";
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
    tr.innerHTML =
      "<td>" + new Date(r.created_at).toLocaleString() + "</td>" +
      '<td class="actor">' + shortActor(r.actor) + "</td>" +
      '<td class="event">' + r.event_type + "</td>" +
      '<td class="detail">' + JSON.stringify(r.detail) + "</td>";
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
