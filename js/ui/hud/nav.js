import { openFleetModal, isFleetModalOpen } from "../windows/fleet.js";
import { openTechModal, isTechModalOpen, openLegend, isLegendOpen, openPlayersModal, isPlayersModalOpen } from "../windows/windows.js";
import { openSetupModal, isSetupModalOpen } from "../setupModal.js";

// The HUD's left navigation. Five entries open a window; BUILD and
// DIPLOMACY are placeholders (.navRow.soon, "Coming soon" tooltip). The
// gold "active" row follows whichever window is open, falling back to
// FLEET (the always-visible fleet list) when none is — refreshed from
// main.js's ~0.4s tick, so closing a window any way at all (✕, backdrop,
// Escape) is picked up without every close path having to report back.
const ENTRIES = {
  fleet:    { open: openFleetModal,   isOpen: isFleetModalOpen },
  planets:  { open: openLegend,       isOpen: isLegendOpen },
  research: { open: openTechModal,    isOpen: isTechModalOpen },
  intel:    { open: openPlayersModal, isOpen: isPlayersModalOpen },
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
