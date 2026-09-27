import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { readStorage, writeStorage } from "../core/utils.js";
import { getLang, t } from "../i18n.js";

// Privacy (docs/security.md, "Privacy"): the one-time notice at the bottom
// of the screen on the first visit, links to privacy.html in the current
// language, and Setup -> Privacy -> "Delete my data".
const NOTICE_KEY = "roj-privacy-ok";

// privacy.html in the player's language (#pl / #en).
export function privacyUrl(){
  return "privacy.html#" + (getLang() === "pl" ? "pl" : "en");
}

// A short, dismissible notice — information, not a consent request: the
// game has no tracking to consent to (localStorage is strictly necessary,
// the security log rests on legitimate interest).
export function initPrivacyNotice(){
  const bar = document.getElementById("privacyNotice");
  document.getElementById("privacyNoticeLink").addEventListener("click", function(e){
    e.currentTarget.href = privacyUrl();
  });
  if(readStorage(NOTICE_KEY) === "1") return;
  bar.classList.remove("hidden");
  document.getElementById("privacyNoticeOk").addEventListener("click", function(){
    writeStorage(NOTICE_KEY, "1");
    bar.classList.add("hidden");
  });
}

// Setup -> Privacy: the policy link and "Delete my data" (with a confirm
// step). Server side it calls delete_my_data() (supabase/schema.sql): the
// player's nick and anonymous account; the security log stays until it
// expires (Art. 17(3) GDPR). Then every "roj-" key in this browser goes and
// the page reloads as a first visit.
export function initPrivacySettings(){
  const link = document.getElementById("privacyPolicyLink");
  link.addEventListener("click", function(){ link.href = privacyUrl(); });
  const btn = document.getElementById("deleteDataBtn");
  const status = document.getElementById("deleteDataStatus");
  let armed = false;
  btn.addEventListener("click", async function(){
    if(!armed){                                  // first click: ask to confirm
      armed = true;
      btn.textContent = t("privacy.confirmDelete");
      btn.classList.add("armed");
      status.textContent = t("privacy.confirmHint");
      return;
    }
    btn.disabled = true;
    status.textContent = t("privacy.deleting");
    let serverOk = true;
    if(NET_ENABLED){
      try {
        const res = await supabase.rpc("delete_my_data");
        if(res.error) throw res.error;
        await supabase.auth.signOut();
      } catch(err){
        serverOk = false;
        console.warn("delete_my_data failed", err);
      }
    }
    clearLocalGameData();
    if(!serverOk){
      // local data is gone; the server part needs a manual request
      btn.disabled = false; armed = false; btn.classList.remove("armed");
      btn.textContent = t("privacy.deleteBtn");
      status.textContent = t("privacy.serverFailed");
      return;
    }
    status.textContent = t("privacy.deleted");
    setTimeout(function(){ location.reload(); }, 1200);
  });
}

// Every key the game (and supabase-js's session) keeps in this browser.
function clearLocalGameData(){
  try {
    const keys = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && (k.indexOf("roj-") === 0 || k.indexOf("sb-") === 0)) keys.push(k);
    }
    keys.forEach(function(k){ localStorage.removeItem(k); });
  } catch(e){ /* storage unavailable — nothing to clear */ }
}
