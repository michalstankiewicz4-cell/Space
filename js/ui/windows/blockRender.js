import { SPECS, categoryOf } from "../../blocks/blockSpecs.js";
import { shapeOf, argSpecs, findDef, findVar, fileOfDef, getProject } from "../../blocks/blockProject.js";
import { t } from "../../i18n.js";

// Builds the DOM for blocks. Pure view: it never changes the project, it
// only records in `ctx.map` where each rendered block lives
// (id -> { block, list, index, stack } for blocks in a stack, or
// { block, owner, key } for a value block sitting in another block's slot),
// which is what the editor's drag & drop and input handling look up.
// `ctx.palette` renders read-only templates (inputs can't be typed into).
function paint(el, catId){
  const c = categoryOf(catId);
  el.style.setProperty("--c", c.c);
  el.style.setProperty("--hi", c.hi);
  el.style.setProperty("--lo", c.lo);
  el.style.setProperty("--ink", c.ink);
}

function span(cls, text){
  const s = document.createElement("span");
  if(cls) s.className = cls;
  if(text !== undefined) s.textContent = text;
  return s;
}

export function fitInput(inp){
  inp.style.width = Math.max(2, String(inp.value).length + 1) + "ch";
}

function fileDot(defId){
  const f = fileOfDef(defId);
  const d = span("blkDot");
  d.style.background = f ? f.color : "#888";
  if(f) d.title = f.name;
  return d;
}

function optionLabel(op, o){
  return op === "andor" || op === "bool" ? t("blocks.opt." + o) : o;
}

function renderSlot(b, a, ctx){
  const v = b.args[a.n];
  const s = span("blkSlot");
  s.dataset.owner = b.id;
  s.dataset.arg = a.n;
  s.dataset.type = a.t;
  if(v && typeof v === "object"){
    ctx.map[v.id] = { block: v, owner: b, key: a.n };
    s.appendChild(renderBlock(v, ctx));
    return s;
  }
  if(a.t === "num" || a.t === "text"){
    const inp = document.createElement("input");
    inp.className = "blkIn" + (a.t === "text" ? " txt" : "");
    inp.type = "text";
    inp.spellcheck = false;
    inp.maxLength = a.t === "text" ? 60 : 12;
    if(a.t === "num") inp.inputMode = "decimal";
    inp.value = v === null || v === undefined ? "" : v;
    if(ctx.palette){ inp.readOnly = true; inp.tabIndex = -1; }
    fitInput(inp);
    s.appendChild(inp);
  } else if(a.t === "bool"){
    s.appendChild(span("blkHole"));
  } else {
    const sel = document.createElement("select");
    sel.className = "blkSel";
    if(ctx.palette) sel.tabIndex = -1;
    const opts = a.t === "var"
      ? getProject().vars.map(function(x){ return [x.id, x.name]; })
      : a.options.map(function(o){ return [o, optionLabel(b.op, o)]; });
    if(!opts.length) opts.push(["", "—"]);
    opts.forEach(function(o){
      const op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      sel.appendChild(op);
    });
    sel.value = v || opts[0][0];
    s.appendChild(sel);
  }
  return s;
}

// Fills a row from an i18n template like "repeat {n} times".
function fillTemplate(row, b, template, ctx){
  const args = {};
  argSpecs(b).forEach(function(a){ args[a.n] = a; });
  template.split(/(\{\w+\})/).forEach(function(part){
    const m = /^\{(\w+)\}$/.exec(part);
    if(m && args[m[1]]) row.appendChild(renderSlot(b, args[m[1]], ctx));
    else if(part.trim()) row.appendChild(span("blkTxt", part.trim()));
  });
}

function renderRow(b, ctx){
  const row = document.createElement("div");
  row.className = "blkRow";
  if(b.op === "start"){
    row.appendChild(span("blkIco", "▶"));
    row.appendChild(span("blkTxt", t("blocks.op.start")));
  } else if(b.op === "define"){
    const def = findDef(b.def);
    row.appendChild(fileDot(b.def));
    row.appendChild(span("blkKind", def ? t("blocks.kind." + def.kind) : "?"));
    row.appendChild(span("blkName", def ? def.name : "?"));
    (def ? def.params : []).forEach(function(p){
      const chip = span("blkParam", p.name);
      chip.dataset.def = def.id;
      chip.dataset.param = p.id;
      if(!ctx.palette) chip.title = t("blocks.dragParam");
      row.appendChild(chip);
    });
  } else if(b.op === "call"){
    const def = findDef(b.def);
    row.appendChild(fileDot(b.def));
    row.appendChild(span("blkName", def ? def.name : "?"));
    argSpecs(b).forEach(function(a){
      row.appendChild(span("blkArgName", a.label + ":"));
      row.appendChild(renderSlot(b, a, ctx));
    });
  } else if(b.op === "getvar"){
    const v = findVar(b.v);
    row.appendChild(span("blkTxt", v ? v.name : "?"));
  } else if(b.op === "param"){
    const def = findDef(b.def);
    const p = def && def.params.find(function(x){ return x.id === b.param; });
    row.appendChild(span("blkTxt", p ? p.name : "?"));
  } else {
    fillTemplate(row, b, t("blocks.op." + b.op), ctx);
  }
  return row;
}

export function renderList(list, ctx, stack){
  const box = document.createElement("div");
  box.className = "blkList";
  list.forEach(function(b, i){
    ctx.map[b.id] = { block: b, list: list, index: i, stack: stack };
    box.appendChild(renderBlock(b, ctx));
  });
  return box;
}

function mouth(list, ctx, which){
  const m = document.createElement("div");
  m.className = "blkMouth";
  m.dataset.which = which;
  m.appendChild(renderList(list, ctx, null));
  const arm = document.createElement("div");
  arm.className = "blkArm";
  const mid = document.createElement("div");
  mid.className = "blkMid";
  mid.appendChild(arm);
  mid.appendChild(m);
  return mid;
}

export function renderBlock(b, ctx){
  const shape = shapeOf(b);
  const el = document.createElement("div");
  el.className = "blk blk-" + shape + " op-" + b.op;
  el.dataset.id = b.id;
  paint(el, SPECS[b.op].cat);
  const row = renderRow(b, ctx);
  if(shape === "c" || shape === "cc"){
    row.classList.add("blkTop");
    el.appendChild(row);
    const m1 = mouth(b.body, ctx, "body");
    m1.querySelector(".blkMouth").dataset.owner = b.id;
    el.appendChild(m1);
    if(shape === "cc"){
      const elseRow = document.createElement("div");
      elseRow.className = "blkRow blkElse";
      elseRow.appendChild(span("blkTxt", t("blocks.op.else")));
      el.appendChild(elseRow);
      const m2 = mouth(b.else, ctx, "else");
      m2.querySelector(".blkMouth").dataset.owner = b.id;
      el.appendChild(m2);
    }
    const foot = document.createElement("div");
    foot.className = "blkFoot";
    if(b.op === "forever") foot.appendChild(span("blkIco", "↻"));
    if(b.op === "repeat") foot.appendChild(span("blkIco", "↺"));
    el.appendChild(foot);
  } else {
    el.appendChild(row);
  }
  return el;
}
