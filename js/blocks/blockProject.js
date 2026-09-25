import { readStorage, writeStorage } from "../core/utils.js";
import { SPECS, FILE_COLORS } from "./blockSpecs.js";

// The block program: a small "virtual file system" plus the names shared
// by every file. Persisted as JSON under its own localStorage key.
//
//   project = {
//     seq,                                 last id handed out
//     files: [{ id, name, color, main, stacks: [{ x, y, blocks: [block] }] }],
//     vars:  [{ id, name }],               global variables
//     defs:  [{ id, kind: "proc"|"func", name, params: [{ id, name }] }]
//   }
//   block = { id, op, args: { name: literal | block | varId }, body?, else?,
//             def?, param?, v? }
//
// Exactly one file is `main`: START runs its "when started" stacks. Every
// file can hold procedure/function definitions, and those can be called
// from any file — that's all a "file" is here, a way to group stacks.
// Ids ("b12", "v3", "f7", "p9") double as the identifiers the compiled
// script uses, so the names players type can be anything (Polish letters,
// spaces) without ever reaching the DSL's lexer.
const STORAGE_KEY = "roj-drone-blocks";
let project = null;

export function newId(prefix){ project.seq += 1; return prefix + project.seq; }

function argDefault(a){
  if(a.t === "bool") return null;
  if(a.t === "var") return project.vars.length ? project.vars[0].id : "";
  return a.d !== undefined ? a.d : "";
}

// A fresh block with every arg at its default; `extra` sets def/param/v.
export function makeBlock(op, extra){
  const spec = SPECS[op];
  const b = { id: newId("b"), op: op, args: {} };
  (spec.args || []).forEach(function(a){ b.args[a.n] = argDefault(a); });
  if(spec.shape === "c" || spec.shape === "cc") b.body = [];
  if(spec.shape === "cc") b.else = [];
  if(extra) Object.keys(extra).forEach(function(k){ b[k] = extra[k]; });
  if(op === "call"){
    const def = findDef(b.def);
    (def ? def.params : []).forEach(function(p, i){ if(b.args["p" + i] === undefined) b.args["p" + i] = ""; });
  }
  return b;
}

// Deep copy with new ids (palette blocks and examples are templates).
export function cloneBlock(b){
  const c = JSON.parse(JSON.stringify(b));
  (function renew(x){
    if(!x || typeof x !== "object") return;
    x.id = newId("b");
    Object.keys(x.args || {}).forEach(function(k){ if(x.args[k] && typeof x.args[k] === "object") renew(x.args[k]); });
    (x.body || []).forEach(renew);
    (x.else || []).forEach(renew);
  })(c);
  return c;
}

export function shapeOf(b){
  if(b.op === "call"){
    const def = findDef(b.def);
    return def && def.kind === "func" ? "reporter" : "stack";
  }
  return SPECS[b.op].shape;
}

export function argSpecs(b){
  if(b.op !== "call") return SPECS[b.op].args || [];
  const def = findDef(b.def);
  return (def ? def.params : []).map(function(p, i){ return { n: "p" + i, t: "num", d: "", label: p.name }; });
}

function defaultProject(){
  project = { seq: 0, files: [], vars: [], defs: [] };
  const loop = makeBlock("repeat");
  loop.body.push(makeBlock("move"), makeBlock("turn"));
  project.files.push({ id: newId("file"), name: "main", color: FILE_COLORS[0], main: true,
    stacks: [{ x: 40, y: 40, blocks: [makeBlock("start"), loop] }] });
  return project;
}

function valid(p){
  return p && Array.isArray(p.files) && p.files.length && Array.isArray(p.vars) && Array.isArray(p.defs) && typeof p.seq === "number";
}

export function getProject(){
  if(project) return project;
  try{
    const raw = JSON.parse(readStorage(STORAGE_KEY) || "null");
    if(valid(raw)) project = raw;
  }catch(e){}
  if(!project) defaultProject();
  if(!project.files.some(function(f){ return f.main; })) project.files[0].main = true;
  return project;
}

export function saveProject(){ writeStorage(STORAGE_KEY, JSON.stringify(project)); }

export function findFile(id){ return project.files.find(function(f){ return f.id === id; }); }
export function findDef(id){ return project.defs.find(function(d){ return d.id === id; }); }
export function findVar(id){ return project.vars.find(function(v){ return v.id === id; }); }
export function mainFile(){ return project.files.find(function(f){ return f.main; }); }

// Calls fn(block, list, index, owner) for every block anywhere in the
// project, reporters inside slots included (list is null for those).
export function walkBlocks(fn){
  function visit(b, list, i, owner){
    fn(b, list, i, owner);
    Object.keys(b.args || {}).forEach(function(k){ const v = b.args[k]; if(v && typeof v === "object") visit(v, null, k, b); });
    visitList(b.body);
    visitList(b.else);
  }
  function visitList(list){ (list || []).forEach(function(b, i){ visit(b, list, i, null); }); }
  project.files.forEach(function(f){ f.stacks.forEach(function(s){ visitList(s.blocks); }); });
}

// The file whose stacks hold `def`'s header block.
export function fileOfDef(defId){
  return project.files.find(function(f){
    return f.stacks.some(function(s){ return s.blocks[0] && s.blocks[0].op === "define" && s.blocks[0].def === defId; });
  });
}

export function varInUse(id){
  let used = false;
  walkBlocks(function(b){ if(b.v === id || ((b.op === "setvar" || b.op === "changevar") && b.args.v === id)) used = true; });
  return used;
}

// Removes a definition together with every call to it and every use of
// its parameters (a call to nothing can't be compiled).
export function purgeDef(defId){
  project.defs = project.defs.filter(function(d){ return d.id !== defId; });
  const doomed = function(b){ return (b.op === "call" || b.op === "param" || b.op === "define") && b.def === defId; };
  function clean(list){
    for(let i = list.length - 1; i >= 0; i--){
      if(doomed(list[i])) list.splice(i, 1);
      else cleanBlock(list[i]);
    }
  }
  function cleanBlock(b){
    Object.keys(b.args || {}).forEach(function(k){
      const v = b.args[k];
      if(v && typeof v === "object"){ if(doomed(v)) b.args[k] = v.op === "param" || shapeOf(v) === "reporter" ? "" : null; else cleanBlock(v); }
    });
    if(b.body) clean(b.body);
    if(b.else) clean(b.else);
  }
  project.files.forEach(function(f){
    f.stacks.forEach(function(s){ clean(s.blocks); });
    f.stacks = f.stacks.filter(function(s){ return s.blocks.length; });
  });
}

export function addFile(name, color){
  const f = { id: newId("file"), name: name, color: color, main: false, stacks: [] };
  project.files.push(f);
  return f;
}

export function deleteFile(id){
  const f = findFile(id);
  if(!f || project.files.length < 2) return;
  f.stacks.forEach(function(s){ if(s.blocks[0] && s.blocks[0].op === "define") purgeDef(s.blocks[0].def); });
  project.files = project.files.filter(function(x){ return x.id !== id; });
  if(!mainFile()) project.files[0].main = true;
}

export function setMainFile(id){
  project.files.forEach(function(f){ f.main = f.id === id; });
}

export function addVar(name){
  const existing = project.vars.find(function(v){ return v.name === name; });
  if(existing) return existing;
  const v = { id: newId("v"), name: name };
  project.vars.push(v);
  return v;
}

export function removeVar(id){ project.vars = project.vars.filter(function(v){ return v.id !== id; }); }

export function addDef(kind, name, paramNames){
  const d = { id: newId("f"), kind: kind === "func" ? "func" : "proc", name: name,
    params: paramNames.map(function(n){ return { id: newId("p"), name: n }; }) };
  project.defs.push(d);
  return d;
}
