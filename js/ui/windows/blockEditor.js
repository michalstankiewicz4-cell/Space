import { CATEGORIES, FILE_COLORS } from "../../blocks/blockSpecs.js";
import { getProject, saveProject, findFile, findDef, mainFile, addFile, deleteFile, setMainFile, purgeDef, makeBlock, fileOfDef } from "../../blocks/blockProject.js";
import { compileProject } from "../../blocks/blockCompile.js";
import { loadExample } from "../../blocks/blockExamples.js";
import { renderList, fitInput } from "./blockRender.js";
import { renderPalette, resetPaletteForm } from "./blockPalette.js";
import { initBlockDrag } from "./blockDrag.js";
import { t, onLangChange } from "../../i18n.js";
import { readStorage, writeStorage } from "../../core/utils.js";

// The drone's block editor window (#blocksModal): a visual way to write
// the same drone programs the text editor does. Four columns — virtual
// files, block categories, the category's palette, and the workspace of
// the selected file. The project model lives in blocks/blockProject.js,
// the compiler to the drone DSL in blocks/blockCompile.js; this file is
// only the window. Run/Stop and the SCRIPT/BLOCKS switch are wired by
// ui/windows/droneScript.js, which owns "which program runs".
let curFileId = null;
let curCat = "control";
let codeOpen = false;
let wsCtx = { map: {} };
let deleteArmed = null;
let flashTimer = 0;
const CODE_WIDTH_KEY = "roj-blocks-code-width";

function el(id){ return document.getElementById(id); }
function mk(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}

export function isBlockEditorOpen(){ return !el("blocksModal").classList.contains("hidden"); }
export function closeBlockEditor(){ el("blocksModal").classList.add("hidden"); }
export function openBlockEditor(){
  el("blocksModal").classList.remove("hidden");
  renderAll();
}

export function compiledBlocks(){ return compileProject(getProject()).code; }

function curFile(){
  const p = getProject();
  let f = findFile(curFileId);
  if(!f){ f = mainFile() || p.files[0]; curFileId = f.id; }
  return f;
}

function flash(msg){
  const m = el("blkMsg");
  m.textContent = msg;
  m.classList.add("flash");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(function(){ m.classList.remove("flash"); m.textContent = ""; }, 4500);
}

// ---------- files ----------
function renderFiles(){
  const p = getProject();
  const list = el("blkFileList");
  list.innerHTML = "";
  p.files.forEach(function(f){
    const li = mk("li", "blkFile" + (f.id === curFileId ? " sel" : "") + (f.main ? " main" : ""));
    const dot = mk("button", "blkFileDot");
    dot.type = "button";
    dot.style.background = f.color;
    dot.title = t("blocks.colorTitle");
    dot.addEventListener("click", function(e){
      e.stopPropagation();
      f.color = FILE_COLORS[(FILE_COLORS.indexOf(f.color) + 1) % FILE_COLORS.length];
      commit();
    });
    const name = mk("span", "blkFileName", f.name);
    name.title = t("blocks.renameTitle");
    name.addEventListener("dblclick", function(e){ e.stopPropagation(); renameFile(f, name); });
    const defs = p.defs.filter(function(d){ return fileOfDef(d.id) === f; }).length;
    const info = mk("span", "blkFileInfo", defs ? t("blocks.defsIn")(defs) : "");
    const star = mk("button", "blkStar", f.main ? "★" : "☆");
    star.type = "button";
    star.title = f.main ? t("blocks.mainTitle") : t("blocks.makeMain");
    star.addEventListener("click", function(e){ e.stopPropagation(); setMainFile(f.id); commit(); });
    const del = mk("button", "blkFileDel" + (deleteArmed === f.id ? " armed" : ""), "✕");
    del.type = "button";
    del.title = t("blocks.deleteTitle");
    del.disabled = p.files.length < 2;
    del.addEventListener("click", function(e){
      e.stopPropagation();
      if(deleteArmed !== f.id){
        deleteArmed = f.id;
        flash(t("blocks.deleteAgain"));
        renderFiles();
        setTimeout(function(){ if(deleteArmed === f.id){ deleteArmed = null; renderFiles(); } }, 3000);
        return;
      }
      deleteArmed = null;
      deleteFile(f.id);
      commit();
    });
    li.append(dot, name, info, star, del);
    li.addEventListener("click", function(){ curFileId = f.id; renderAll(); });
    list.appendChild(li);
  });
}

function renameFile(f, nameEl){
  const inp = mk("input", "blkRename");
  inp.value = f.name;
  inp.maxLength = 24;
  nameEl.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  function finish(ok){
    if(done) return;
    done = true;
    const v = inp.value.trim();
    if(ok && v) f.name = v;
    commit();
  }
  inp.addEventListener("keydown", function(e){
    if(e.key === "Enter") finish(true);
    if(e.key === "Escape"){ e.stopPropagation(); finish(false); }
  });
  inp.addEventListener("blur", function(){ finish(true); });
  inp.addEventListener("click", function(e){ e.stopPropagation(); });
}

// ---------- categories + palette ----------
function renderCats(){
  const nav = el("blkCats");
  nav.innerHTML = "";
  CATEGORIES.forEach(function(c){
    const b = mk("button", "blkCat" + (c.id === curCat ? " on" : ""));
    b.type = "button";
    b.style.setProperty("--c", c.c);
    b.style.setProperty("--ink", c.ink);
    b.appendChild(mk("span", "blkCatSq"));
    b.appendChild(mk("span", "blkCatName", t("blocks.cats." + c.id)));
    b.addEventListener("click", function(){ curCat = c.id; resetPaletteForm(); renderPaletteNow(); renderCats(); });
    nav.appendChild(b);
  });
}

const paletteHooks = {
  render: function(){ renderPaletteNow(); },
  changed: function(){ commit(); },
  flash: flash,
  placeDefinition: function(def){
    const f = curFile();
    const y = f.stacks.reduce(function(m, s){ return Math.max(m, s.y); }, -60) + 60;
    f.stacks.push({ x: 40, y: y, blocks: [makeBlock("define", { def: def.id })] });
    commit();
    tidy();
    const hat = el("blkCanvas").querySelector('.op-define[data-id]:last-of-type');
    if(hat) hat.scrollIntoView({ block: "nearest" });
  },
  loadExample: function(key){
    const f = loadExample(key);
    curFileId = f.id;
    commit();
    tidy();
    flash(t("blocks.exampleAdded")(f.name));
  }
};

function renderPaletteNow(){ renderPalette(el("blkPalette"), curCat, paletteHooks); }

// ---------- workspace ----------
function renderWorkspace(){
  const canvas = el("blkCanvas");
  const f = curFile();
  canvas.innerHTML = "";
  wsCtx = { map: {} };
  let maxX = 0, maxY = 0;
  f.stacks.forEach(function(s){
    const top = mk("div", "blkStackTop");
    top.style.left = s.x + "px";
    top.style.top = s.y + "px";
    top._stack = s;
    top.appendChild(renderList(s.blocks, wsCtx, s));
    if(s.blocks[0] && s.blocks[0].op !== "start" && s.blocks[0].op !== "define") top.classList.add("loose");
    canvas.appendChild(top);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  });
  canvas.style.width = (maxX + 900) + "px";
  canvas.style.height = (maxY + 700) + "px";
  el("blkWorkEmpty").classList.toggle("hidden", f.stacks.length > 0);
  el("blkFileTab").textContent = (f.main ? "★ " : "") + f.name;
  el("blkFileTab").style.setProperty("--dot", f.color);
}

// Pushes stacks down until none overlaps the one above it.
function tidy(){
  const f = curFile();
  const tops = Array.prototype.slice.call(el("blkCanvas").querySelectorAll(".blkStackTop"));
  const sorted = tops.slice().sort(function(a, b){ return a._stack.y - b._stack.y; });
  let bottom = -Infinity;
  sorted.forEach(function(top){
    const s = top._stack;
    if(s.y < bottom + 24) s.y = bottom + 24;
    bottom = s.y + top.offsetHeight;
  });
  if(sorted.length) commit();
  return f;
}

function renderCode(){
  const code = el("blkCode");
  code.classList.toggle("hidden", !codeOpen);
  el("blkSplit").classList.toggle("hidden", !codeOpen);
  el("blocksCodeBtn").classList.toggle("active", codeOpen);
  const res = compileProject(getProject());
  el("blkNoStart").classList.toggle("hidden", res.hasStart);
  if(!codeOpen) return;
  const esc = res.code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  code.innerHTML = esc.split("\n").map(function(line){
    if(/^\s*#/.test(line)) return '<span class="cm">' + line + "</span>";
    return line.replace(/\b(def|repeat|while|if|else|return|true|false)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(move|turn|wait|attack|print|fuel|maxFuel|nearPlanet)\(/g, '<span class="fn">$1</span>(');
  }).join("\n");
}

function renderAll(){
  curFile();
  renderFiles();
  renderCats();
  renderPaletteNow();
  renderWorkspace();
  renderCode();
}

function commit(){
  saveProject();
  renderFiles();
  renderPaletteNow();
  renderWorkspace();
  renderCode();
}

function trashed(blocks){
  blocks.forEach(function(b){
    if(b.op === "define"){
      const def = findDef(b.def);
      if(def){ purgeDef(def.id); flash(t("blocks.defRemoved")(def.name)); }
    }
  });
}

// Typing into a block's field / picking from its dropdown edits the model
// in place without re-rendering (so the field keeps focus).
function onField(e){
  const slot = e.target.closest(".blkSlot");
  if(!slot) return;
  const info = wsCtx.map[slot.dataset.owner];
  if(!info) return;
  if(e.target.tagName === "INPUT"){
    if(slot.dataset.type === "num") e.target.value = e.target.value.replace(/[^0-9.,\-]/g, "");
    fitInput(e.target);
  }
  info.block.args[slot.dataset.arg] = e.target.value;
  saveProject();
  renderCode();
}

// Called every ~0.4s while the window is open (ui/windows/droneScript.js).
export function refreshBlockEditor(drone){
  if(!isBlockEditorOpen()) return;
  const st = el("blkState");
  const state = !drone ? "" : drone.error ? "error" : drone.running ? "running" : "idle";
  st.textContent = state ? t("blocks." + state) : "";
  st.className = state;
  el("blkLog").textContent = drone && drone.error ? drone.error : drone && drone.logs.length ? "› " + drone.logs[drone.logs.length - 1] : "";
}

function applyLang(){
  el("blocksTitle").textContent = t("blocks.title");
  el("blocksCodeBtn").textContent = t("blocks.code");
  el("blocksCodeBtn").title = t("blocks.codeTitle");
  el("blocksTidyBtn").title = t("blocks.tidy");
  el("blocksRunBtn").textContent = t("blocks.run");
  el("blocksStopBtn").textContent = t("blocks.stop");
  el("blkFilesTitle").textContent = t("blocks.files");
  el("blkNewFile").title = t("blocks.newFileTitle");
  el("blkFilesHint").textContent = t("blocks.filesHint");
  el("blkWorkEmpty").textContent = t("blocks.workEmpty");
  el("blkNoStart").textContent = t("blocks.noStart");
  el("blkTrash").textContent = "🗑 " + t("blocks.trash");
  if(isBlockEditorOpen()) renderAll();
}

// The code column's width, set by dragging #blkSplit (remembered per
// browser). Measured in the window's design px, so it stays put when the
// browser window is resized.
function initSplitter(){
  const split = el("blkSplit"), code = el("blkCode"), row = el("blkWorkRow");
  const saved = parseFloat(readStorage(CODE_WIDTH_KEY));
  if(saved > 0) code.style.width = saved + "px";
  split.addEventListener("pointerdown", function(e){
    if(e.button !== 0) return;
    e.preventDefault();
    const box = el("blocksModalBox");
    const r = box.getBoundingClientRect().width / box.offsetWidth;
    const startX = e.clientX, startW = code.offsetWidth;
    split.classList.add("dragging");
    function move(ev){
      const w = Math.max(220, Math.min(row.offsetWidth - 240, startW - (ev.clientX - startX) / r));
      code.style.width = Math.round(w) + "px";
    }
    function up(){
      split.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      writeStorage(CODE_WIDTH_KEY, String(code.offsetWidth));
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

export function initBlockEditor(onRun, onStop){
  const win = el("blocksModal");
  el("blocksCloseBtn").addEventListener("click", closeBlockEditor);
  win.addEventListener("click", function(e){ if(e.target === win) closeBlockEditor(); });
  el("blocksRunBtn").addEventListener("click", onRun);
  el("blocksStopBtn").addEventListener("click", onStop);
  el("blocksCodeBtn").addEventListener("click", function(){ codeOpen = !codeOpen; renderCode(); });
  el("blocksTidyBtn").addEventListener("click", function(){ tidy(); });
  el("blkNewFile").addEventListener("click", function(){
    const p = getProject();
    const f = addFile(t("blocks.newFile")(p.files.length + 1), FILE_COLORS[p.files.length % FILE_COLORS.length]);
    curFileId = f.id;
    commit();
  });
  const canvas = el("blkCanvas");
  canvas.addEventListener("input", onField);
  canvas.addEventListener("change", onField);
  initBlockDrag({
    box: el("blocksModalBox"), work: el("blkWork"), canvas: canvas,
    palette: el("blkPalette"), palWrap: el("blkPalWrap"),
    ctx: function(){ return wsCtx; }, file: curFile,
    rerender: renderWorkspace, commit: commit, trashed: trashed
  });
  initSplitter();
  applyLang();
  onLangChange(applyLang);
}
