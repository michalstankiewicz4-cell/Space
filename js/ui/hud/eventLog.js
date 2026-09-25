import { svgIcon } from "../icons.js";

// EVENT LOG panel: every in-game message, newest on top. The rest of the
// game only ever calls showToast() below — the one entry point it has
// always used for player-facing notices — so nothing else needs to know
// this panel exists.
const MAX_EVENTS = 60;
const KIND_ICON = { info: "evInfo", arrive: "evArrive", alert: "evAlert" };

function clockText(d){
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// kind: "info" (default), "arrive" (something gained/reached) or "alert".
// The message is set via textContent — some messages embed player data.
export function addEvent(msg, kind){
  const list = document.getElementById("evList");
  if(!list) return;
  const k = KIND_ICON[kind] ? kind : "info";
  const li = document.createElement("li");
  li.className = (k === "alert" ? "alert " : "") + "fresh";
  li.innerHTML = svgIcon(KIND_ICON[k]) + '<span class="t"></span><span class="m"></span>';
  li.querySelector(".t").textContent = clockText(new Date());
  li.querySelector(".m").textContent = msg;
  li.addEventListener("animationend", function(){ li.classList.remove("fresh"); });
  list.prepend(li);
  list.scrollTop = 0;
  while(list.children.length > MAX_EVENTS) list.lastElementChild.remove();
}

// Every player-facing notice in the game goes through here. kind: "info"
// (default), "arrive" or "alert" — only picks the entry's icon/color.
export function showToast(msg, kind){
  addEvent(msg, kind);
}
