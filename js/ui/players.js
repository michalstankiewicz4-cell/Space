import { ctx } from "../core/context.js";
import { state } from "../core/gameState.js";
import { myIdentity } from "../net/identity.js";

// Buduje listę wyłącznie przez DOM API (textContent/style.background), nigdy
// przez innerHTML — nick i kolor innego gracza to dane od niezaufanego
// klienta (przychodzą przez broadcast), więc nie mogą trafiać do HTML jako
// surowy tekst.
export function renderPlayersList(){
  const el = document.getElementById("playersListEl");
  if(!el) return;

  const rows = [{ nick: myIdentity.nick, color: myIdentity.color, points: state.points, isMe: true }];
  Object.keys(ctx.remotePlayers).forEach(function(id){
    const rp = ctx.remotePlayers[id];
    rows.push({ nick: rp.nick, color: rp.color, points: rp.points||0, isMe: false });
  });
  rows.sort(function(a,b){ return (b.points||0)-(a.points||0); });

  el.innerHTML = "";
  rows.forEach(function(r){
    const li = document.createElement("li");
    if(r.isMe) li.className = "me";

    const dot = document.createElement("span");
    dot.className = "dot";
    if(/^#[0-9a-fA-F]{6}$/.test(r.color)) dot.style.background = r.color;
    li.appendChild(dot);

    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = r.nick + (r.isMe ? " (Ty)" : "");
    li.appendChild(nameEl);

    const ptsEl = document.createElement("b");
    ptsEl.textContent = String(Math.round(r.points||0));
    li.appendChild(ptsEl);

    el.appendChild(li);
  });
}
