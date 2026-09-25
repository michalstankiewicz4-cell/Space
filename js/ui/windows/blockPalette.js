import { PALETTE, categoryOf } from "../../blocks/blockSpecs.js";
import { getProject, makeBlock, addVar, addDef, removeVar, varInUse, fileOfDef } from "../../blocks/blockProject.js";
import { EXAMPLE_KEYS } from "../../blocks/blockExamples.js";
import { renderBlock } from "./blockRender.js";
import { t } from "../../i18n.js";

// The block editor's palette column: the chosen category's blocks to drag
// out, plus the "+ Variable / Procedure / Function" forms and the example
// programs. Palette blocks are templates — `templates[i]` is what gets
// cloned when item `data-tpl="i"` is dragged (ui/windows/blockDrag.js).
let formKind = null; // "var" | "proc" | "func" while its little form is open
export let templates = [];

function el(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}

function addTemplate(box, b, extra){
  const item = el("div", "blkPalItem");
  item.dataset.tpl = templates.length;
  templates.push(b);
  item.appendChild(renderBlock(b, { map: {}, palette: true }));
  if(extra) item.appendChild(extra);
  box.appendChild(item);
}

function formButton(box, kind, label, h){
  const btn = el("button", "blkMake", label);
  btn.type = "button";
  btn.addEventListener("click", function(){ formKind = formKind === kind ? null : kind; h.render(); });
  box.appendChild(btn);
  if(formKind !== kind) return;
  const form = el("form", "blkForm");
  const name = el("input");
  name.placeholder = t("blocks.namePh");
  name.maxLength = 24;
  form.appendChild(name);
  let params = null;
  if(kind !== "var"){
    params = el("input");
    params.placeholder = t("blocks.paramsPh");
    params.maxLength = 60;
    form.appendChild(params);
  }
  const ok = el("button", "mat gold", t("blocks.ok"));
  ok.type = "submit";
  form.appendChild(ok);
  form.addEventListener("submit", function(e){
    e.preventDefault();
    const n = name.value.trim();
    if(!n) return;
    formKind = null;
    if(kind === "var") addVar(n);
    else {
      const ps = params.value.split(",").map(function(s){ return s.trim(); }).filter(Boolean).slice(0, 6);
      h.placeDefinition(addDef(kind, n, ps));
    }
    h.changed();
  });
  box.appendChild(form);
  setTimeout(function(){ name.focus(); }, 0);
}

function renderVars(box, h){
  const p = getProject();
  formButton(box, "var", t("blocks.newVar"), h);
  if(!p.vars.length) box.appendChild(el("p", "blkPalHint", t("blocks.noVars")));
  p.vars.forEach(function(v){
    const del = el("button", "blkPalDel", "✕");
    del.type = "button";
    del.addEventListener("click", function(){
      if(varInUse(v.id)){ h.flash(t("blocks.varInUse")); return; }
      removeVar(v.id);
      h.changed();
    });
    addTemplate(box, makeBlock("getvar", { v: v.id }), del);
  });
  box.appendChild(el("div", "blkPalSep"));
  PALETTE.vars.forEach(function(op){ addTemplate(box, makeBlock(op)); });
}

function renderMine(box, h){
  const p = getProject();
  formButton(box, "proc", t("blocks.newProc"), h);
  formButton(box, "func", t("blocks.newFunc"), h);
  if(!p.defs.length) box.appendChild(el("p", "blkPalHint", t("blocks.noDefs")));
  // Grouped by file, in file order, so the color markers line up.
  p.files.forEach(function(f){
    const defs = p.defs.filter(function(d){ return fileOfDef(d.id) === f; });
    if(!defs.length) return;
    const head = el("div", "blkPalFile", f.name);
    head.style.setProperty("--dot", f.color);
    box.appendChild(head);
    defs.forEach(function(d){ addTemplate(box, makeBlock("call", { def: d.id })); });
  });
  box.appendChild(el("div", "blkPalSep"));
  PALETTE.mine.forEach(function(op){ addTemplate(box, makeBlock(op)); });
  box.appendChild(el("p", "blkPalHint", t("blocks.mineHint")));
}

function renderExamples(box, h){
  EXAMPLE_KEYS.forEach(function(key){
    const card = el("div", "blkExample");
    card.appendChild(el("div", "blkExName", t("blocks.examples." + key + ".name")));
    card.appendChild(el("div", "blkExDesc", t("blocks.examples." + key + ".desc")));
    const btn = el("button", "mat blkExBtn", t("blocks.exampleLoad"));
    btn.type = "button";
    btn.addEventListener("click", function(){ h.loadExample(key); });
    card.appendChild(btn);
    box.appendChild(card);
  });
}

// h = { render, changed, flash, placeDefinition, loadExample } from the editor.
export function renderPalette(box, cat, h){
  templates = [];
  box.innerHTML = "";
  const c = categoryOf(cat);
  box.style.setProperty("--cat", c.c);
  const title = el("div", "blkPalTitle", t("blocks.cats." + cat));
  box.appendChild(title);
  if(cat === "vars") renderVars(box, h);
  else if(cat === "mine") renderMine(box, h);
  else if(cat === "examples") renderExamples(box, h);
  else PALETTE[cat].forEach(function(op){ addTemplate(box, makeBlock(op)); });
}

export function resetPaletteForm(){ formKind = null; }
