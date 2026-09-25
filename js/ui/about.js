// The About window (#aboutModal): who made the game and how to reach them,
// opened from the start screen's [?] button. Its texts are set by
// ui/i18nApply.js; it closes via its ✕, a click on the backdrop, or Escape
// (ui/escapeKey.js).
export function isAboutOpen(){
  return !document.getElementById("aboutModal").classList.contains("hidden");
}

export function openAbout(){
  document.getElementById("aboutModal").classList.remove("hidden");
}

export function closeAbout(){
  document.getElementById("aboutModal").classList.add("hidden");
}

export function initAbout(){
  const win = document.getElementById("aboutModal");
  document.getElementById("aboutBtn").addEventListener("click", openAbout);
  document.getElementById("aboutCloseBtn").addEventListener("click", closeAbout);
  win.addEventListener("click", function(e){ if(e.target === win) closeAbout(); });
}
