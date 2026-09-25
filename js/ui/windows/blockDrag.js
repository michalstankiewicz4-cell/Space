import { shapeOf, makeBlock, cloneBlock } from "../../blocks/blockProject.js";
import { isValueShape } from "../../blocks/blockSpecs.js";
import { renderBlock, renderList } from "./blockRender.js";
import { templates } from "./blockPalette.js";

// Drag & drop for the block editor. A drag takes blocks out of the
// project the moment it starts (a command takes every block below it
// along, like pulling a card out of a deck; a value block leaves its slot
// empty), shows them in a ghost that follows the pointer, and on release
// puts them where the ghost snapped: after a command, into a C block's
// mouth, on top of a stack, into a matching empty slot — or loose on the
// workspace. Dropped on the palette, they're deleted.
//
// Everything is measured with getBoundingClientRect (screen pixels) and
// converted to the window's own design pixels with ratio(), since the
// whole window is scaled by --uiScale.
const SNAP = 34;      // design px: how close a connection point must be
const START_MOVE = 5; // screen px before a press becomes a drag

let api = null;
let pending = null;
let drag = null;

function ratio(){ return api.box.getBoundingClientRect().width / api.box.offsetWidth; }
function inside(r, x, y){ return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

function slotDefault(type){ return type === "bool" ? null : ""; }

// Takes the pressed thing out of the project; returns the blocks to drag.
function detach(p){
  if(p.from === "palette") return [cloneBlock(templates[p.tpl])];
  if(p.chip) return [makeBlock("param", { def: p.chip.dataset.def, param: p.chip.dataset.param })];
  const info = api.ctx().map[p.el.dataset.id];
  if(!info) return null;
  if(info.owner){
    const slot = p.el.parentElement;
    info.owner.args[info.key] = slotDefault(slot.dataset.type);
    return [info.block];
  }
  const blocks = info.list.splice(info.index);
  const file = api.file();
  if(info.stack && !info.stack.blocks.length) file.stacks.splice(file.stacks.indexOf(info.stack), 1);
  return blocks;
}

function begin(e){
  const r = ratio();
  const grab = (pending.chip || pending.el).getBoundingClientRect();
  const blocks = detach(pending);
  if(!blocks || !blocks.length){ pending = null; return; }
  const value = isValueShape(shapeOf(blocks[0]));
  drag = { blocks: blocks, value: value, hat: shapeOf(blocks[0]) === "hat",
    cap: shapeOf(blocks[blocks.length - 1]) === "cap",
    offX: (e.clientX - grab.left) / r, offY: (e.clientY - grab.top) / r, target: null };
  const from = pending.from;
  pending = null;
  if(from !== "palette") api.rerender();
  const ghost = document.createElement("div");
  ghost.className = "blkGhost";
  const gctx = { map: {} };
  ghost.appendChild(value ? renderBlock(blocks[0], gctx) : renderList(blocks, gctx, null));
  api.box.appendChild(ghost);
  drag.ghost = ghost;
  const marker = document.createElement("div");
  marker.className = "blkMarker hidden";
  api.box.appendChild(marker);
  drag.marker = marker;
  api.palWrap.classList.add("armed");
  move(e);
}

function clearHot(){
  api.canvas.querySelectorAll(".blkSlotHot").forEach(function(s){ s.classList.remove("blkSlotHot"); });
}

function findTarget(e){
  const r = ratio();
  if(inside(api.palWrap.getBoundingClientRect(), e.clientX, e.clientY)) return { trash: true };
  if(!inside(api.work.getBoundingClientRect(), e.clientX, e.clientY)) return null;
  const g = drag.ghost.querySelector(".blk").getBoundingClientRect();
  const map = api.ctx().map;
  let best = null, bestD = SNAP * r;
  function consider(x, y, t){
    const d = Math.hypot(x - g.left, y - (drag.value ? g.top + g.height / 2 : g.top));
    if(d < bestD){ bestD = d; best = t; t.x = x; t.y = y; }
  }
  if(drag.value){
    const bool = shapeOf(drag.blocks[0]) === "bool";
    api.canvas.querySelectorAll(".blkSlot").forEach(function(s){
      if(s.querySelector(":scope > .blk")) return;
      const type = s.dataset.type;
      if(bool ? type !== "bool" : (type !== "num" && type !== "text")) return;
      const sr = s.getBoundingClientRect();
      consider(sr.left, sr.top + sr.height / 2, { slot: s });
    });
    return best;
  }
  if(drag.hat) return null;
  api.canvas.querySelectorAll(".blk").forEach(function(b){
    const info = map[b.dataset.id];
    if(!info || !info.list || isValueShape(shapeOf(info.block)) || shapeOf(info.block) === "cap") return;
    const br = b.getBoundingClientRect();
    consider(br.left, br.bottom, { list: info.list, index: info.index + 1 });
  });
  api.canvas.querySelectorAll(".blkMouth").forEach(function(m){
    const owner = map[m.dataset.owner];
    if(!owner) return;
    const mr = m.getBoundingClientRect();
    consider(mr.left, mr.top, { list: owner.block[m.dataset.which], index: 0 });
  });
  if(!drag.cap){
    const gh = drag.ghost.getBoundingClientRect().height;
    api.canvas.querySelectorAll(".blkStackTop").forEach(function(s){
      if(shapeOf(s._stack.blocks[0]) === "hat") return;
      const sr = s.getBoundingClientRect();
      consider(sr.left, sr.top - gh, { stack: s._stack, dy: gh / r, mx: sr.left, my: sr.top });
    });
  }
  return best;
}

function move(e){
  const r = ratio();
  const br = api.box.getBoundingClientRect();
  drag.ghost.style.left = ((e.clientX - br.left) / r - drag.offX) + "px";
  drag.ghost.style.top = ((e.clientY - br.top) / r - drag.offY) + "px";
  const t = findTarget(e);
  drag.target = t;
  clearHot();
  api.palWrap.classList.toggle("hot", !!(t && t.trash));
  const m = drag.marker;
  if(t && t.slot) t.slot.classList.add("blkSlotHot");
  if(t && (t.list || t.stack)){
    m.classList.remove("hidden");
    m.style.left = (((t.mx !== undefined ? t.mx : t.x) - br.left) / r) + "px";
    m.style.top = (((t.my !== undefined ? t.my : t.y) - br.top) / r - 2) + "px";
  } else m.classList.add("hidden");
}

function drop(e){
  const t = drag.target;
  const blocks = drag.blocks;
  const r = ratio();
  const g = drag.ghost.querySelector(".blk").getBoundingClientRect();
  drag.ghost.remove();
  drag.marker.remove();
  api.palWrap.classList.remove("armed", "hot");
  clearHot();
  drag = null;
  if(t && t.trash){ api.trashed(blocks); api.commit(); return; }
  if(t && t.slot){
    const owner = api.ctx().map[t.slot.dataset.owner].block;
    owner.args[t.slot.dataset.arg] = blocks[0];
  } else if(t && t.list){
    Array.prototype.splice.apply(t.list, [t.index, 0].concat(blocks));
  } else if(t && t.stack){
    Array.prototype.unshift.apply(t.stack.blocks, blocks);
    t.stack.y = Math.max(0, t.stack.y - t.dy);
  } else {
    const cr = api.canvas.getBoundingClientRect();
    api.file().stacks.push({ x: Math.max(8, Math.round((g.left - cr.left) / r)), y: Math.max(8, Math.round((g.top - cr.top) / r)), blocks: blocks });
  }
  api.commit();
}

function onMove(e){
  if(pending && !drag){
    if(pending.pan){
      const r = ratio();
      api.work.scrollLeft = pending.sl - (e.clientX - pending.x) / r;
      api.work.scrollTop = pending.st - (e.clientY - pending.y) / r;
      return;
    }
    if(Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < START_MOVE) return;
    begin(e);
  }
  if(drag){ e.preventDefault(); move(e); }
}

function onUp(e){
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  if(drag) drop(e);
  if(pending && pending.pan) api.work.classList.remove("panning");
  pending = null;
}

function press(e, p){
  p.x = e.clientX;
  p.y = e.clientY;
  pending = p;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// a = { box, work, canvas, palette, palWrap, ctx(), file(), rerender(),
//       commit(), trashed(blocks) }
export function initBlockDrag(a){
  api = a;
  api.canvas.addEventListener("pointerdown", function(e){
    if(e.button !== 0 || e.target.closest("input, select, button")) return;
    const chip = e.target.closest(".blkParam");
    const el = e.target.closest(".blk");
    if(chip){ e.preventDefault(); press(e, { from: "work", chip: chip }); return; }
    if(el){ e.preventDefault(); press(e, { from: "work", el: el }); return; }
    e.preventDefault();
    api.work.classList.add("panning");
    press(e, { pan: true, sl: api.work.scrollLeft, st: api.work.scrollTop });
  });
  api.palette.addEventListener("pointerdown", function(e){
    if(e.button !== 0) return;
    const item = e.target.closest(".blkPalItem");
    if(!item || e.target.closest("button")) return;
    e.preventDefault();
    press(e, { from: "palette", tpl: +item.dataset.tpl, el: item.querySelector(".blk") });
  });
}

export function isDragging(){ return !!drag; }
