import { ctx } from "../core/context.js";
import { state } from "../core/gameState.js";
import { myIdentity } from "../net/identity.js";
import { t } from "../i18n.js";

// Builds the list purely through the DOM API (textContent/style.background),
// never through innerHTML — another player's nick and color are data from an
// untrusted client (they arrive via broadcast), so they must never end up in
// the HTML as raw text.
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
    const fullName = r.nick + (r.isMe ? t("players.you") : "");
    nameEl.textContent = fullName;
    nameEl.title = fullName; // shows the full nick on hover if it's truncated with "…"
    li.appendChild(nameEl);

    const ptsEl = document.createElement("b");
    ptsEl.textContent = String(Math.round(r.points||0));
    li.appendChild(ptsEl);

    el.appendChild(li);
  });
}
