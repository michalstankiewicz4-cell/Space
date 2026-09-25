import { fillIcons } from "../icons.js";

// The HUD's bottom command bar. Not wired to any orders yet — the tabs
// only switch which one is highlighted, and every action button is marked
// "Coming soon" (its tooltip is set by ui/i18nApply.js). Ships are still
// commanded the usual way: select them, then click a target.
export function initCommandBar(){
  fillIcons(document.getElementById("cmdBtns"), {
    target: "url(#gRedIcon)", formup: "url(#gGoldIcon)",
    shield: "url(#gBlueIcon)", scan: "url(#gBlueIcon)", cloak: "url(#gBlueIcon)"
  });
  const tabs = document.querySelectorAll("#cmdTabs .cTab");
  tabs.forEach(function(tab){
    tab.addEventListener("click", function(){
      tabs.forEach(function(x){
        const on = x === tab;
        x.classList.toggle("on", on);
        x.classList.toggle("gold", on);
        x.classList.toggle(x.dataset.color, !on);
      });
    });
  });
}
