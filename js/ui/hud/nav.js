import { openFleetModal, isFleetModalOpen } from "../windows/fleet.js";
import { openTechModal, isTechModalOpen, openPlayersModal, isPlayersModalOpen } from "../windows/windows.js";
import { openWiki, isWikiOpen, getWikiTab } from "../windows/wiki.js";
import { openSetupModal, isSetupModalOpen } from "../setupModal.js";

// The HUD's left navigation. Six entries open a window (PLANETS is the
// Wiki opened on its planets tab, DIPLOMACY the players online); BUILD is
// a placeholder (.navRow.soon, "Coming soon" tooltip). The
// gold "active" row follows whichever window is open, falling back to
// FLEET (the always-visible fleet list) when none is — refreshed from
// main.js's ~0.4s tick, so closing a window any way at all (✕, backdrop,
// Escape) is picked up without every close path having to report back.
const ENTRIES = {
  fleet:    { open: openFleetModal,   isOpen: isFleetModalOpen },
  planets:  { open: function(){ openWiki("bodies"); }, isOpen: function(){ return isWikiOpen() && getWikiTab() === "bodies"; } },
  research: { open: openTechModal,    isOpen: isTechModalOpen },
  diplomacy: { open: openPlayersModal, isOpen: isPlayersModalOpen },
  wiki:     { open: function(){ openWiki(); }, isOpen: function(){ return isWikiOpen() && getWikiTab() !== "bodies"; } },
  settings: { open: openSetupModal,   isOpen: isSetupModalOpen }
};

export function refreshNav(){
  let active = "fleet";
  Object.keys(ENTRIES).forEach(function(k){ if(ENTRIES[k].isOpen()) active = k; });
  document.querySelectorAll("#nav .navRow").forEach(function(row){
    row.classList.toggle("active", row.dataset.nav === active);
  });
}

export function initNav(){
  document.querySelectorAll("#nav .navRow").forEach(function(row){
    const entry = ENTRIES[row.dataset.nav];
    row.querySelector(".navBtn").addEventListener("click", function(){
      if(!entry) return; // .soon placeholder
      entry.open();
      refreshNav();
    });
  });
  refreshNav();
}
