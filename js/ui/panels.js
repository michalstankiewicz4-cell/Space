// Wires up the vertical collapse toggles on the telemetry/players HUD
// panels, the legend popup opened via the "Wiki" button, and the Tech
// modal (the upgrade tree, moved off the always-visible bottom dock and
// into an on-demand centered modal — see #techModal in index.html).
function wireCollapse(panelId, btnId){
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if(!panel || !btn) return;
  btn.addEventListener("click", function(){
    const collapsed = panel.classList.toggle("collapsed");
    btn.textContent = collapsed ? "▸" : "▾";
  });
}

export function isTechModalOpen(){
  return !document.getElementById("techModal").classList.contains("hidden");
}

export function closeTechModal(){
  document.getElementById("techModal").classList.add("hidden");
}

export function initPanels(){
  wireCollapse("telemetry", "telemetryCollapseBtn");
  wireCollapse("playersPanel", "playersCollapseBtn");

  const wikiBtn = document.getElementById("wikiBtn");
  const legend = document.getElementById("legend");
  if(wikiBtn && legend){
    wikiBtn.addEventListener("click", function(){
      legend.classList.toggle("hidden");
    });
  }

  const techBtn = document.getElementById("techBtn");
  const techModal = document.getElementById("techModal");
  const techCloseBtn = document.getElementById("techCloseBtn");
  techBtn.addEventListener("click", function(){
    techModal.classList.remove("hidden");
  });
  techCloseBtn.addEventListener("click", closeTechModal);
  techModal.addEventListener("click", function(e){
    if(e.target === techModal) closeTechModal();
  });
}
