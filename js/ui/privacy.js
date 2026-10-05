import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { leaveForGood } from "../net/connect.js";
import { readStorage, writeStorage } from "../core/utils.js";
import { getLang, t } from "../i18n.js";

// Privacy (docs/security.md, "Privacy"): accepting the policy on the first
// visit (nothing connects to the server before that — main.js waits for
// whenPrivacyAccepted()), links to privacy.html in the current language,
// and Setup -> Privacy -> "Delete my data" (which also resets acceptance).
const NOTICE_KEY = "roj-privacy-ok";
const acceptedListeners = [];

export function hasAcceptedPrivacy(){
  return readStorage(NOTICE_KEY) === "1";
}

// Runs fn now if the policy is already accepted, else once it is.
export function whenPrivacyAccepted(fn){
  if(hasAcceptedPrivacy()) fn();
  else acceptedListeners.push(fn);
}

// privacy.html in the player's language (#pl / #en).
export function privacyUrl(){
  return "privacy.html#" + (getLang() === "pl" ? "pl" : "en");
}

// The first-visit bar: the policy must be accepted before playing (the
// user's call) — until then "ENTER ORBIT" stays locked (ui/banner.js) and
// the game doesn't connect to the server at all (main.js). Legally the game
// needs no consent (no tracking; localStorage is strictly necessary; the
// security log rests on legitimate interest) — this is acknowledgement of
// the policy, which also keeps any data off the server until then.
export function initPrivacyNotice(){
  const bar = document.getElementById("privacyNotice");
  document.getElementById("privacyNoticeLink").addEventListener("click", function(e){
    e.currentTarget.href = privacyUrl();
  });
  if(hasAcceptedPrivacy()) return;
  bar.classList.remove("hidden");
  document.getElementById("privacyNoticeOk").addEventListener("click", function(){
    writeStorage(NOTICE_KEY, "1");
    bar.classList.add("hidden");
    acceptedListeners.splice(0).forEach(function(fn){ fn(); });
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
        leaveForGood();                          // no new account after this sign-out (net/connect.js)
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
