// Wires up the vertical collapse toggles on the telemetry/players HUD
// panels, and the legend popup opened via the "Wiki" button.
function wireCollapse(panelId, btnId){
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if(!panel || !btn) return;
  btn.addEventListener("click", function(){
    const collapsed = panel.classList.toggle("collapsed");
    btn.textContent = collapsed ? "▸" : "▾";
  });
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
}
