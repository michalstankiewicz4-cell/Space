import { findDef, mainFile, shapeOf } from "./blockProject.js";

// Turns the block project into drone DSL source (drone/dsl.js) — the
// blocks never run on their own, they're a different way of writing the
// same scripts. Definitions from every file come first (as `def`s),
// followed by the main file's "when started" stacks in top-to-bottom
// order. Stacks not starting with a hat are scratch work and are skipped.
const CMP = { "<": "<", ">": ">", "=": "==", "≠": "!=", "≤": "<=", "≥": ">=" };
const MATH = { "+": "+", "−": "-", "×": "*", "÷": "/" };

function num(v){
  const n = parseFloat(String(v).replace(",", "."));
  if(!isFinite(n)) return "0";
  return n < 0 ? "(" + n + ")" : String(n);
}

function str(v){ return '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

function slot(v, type){
  if(v && typeof v === "object") return expr(v);
  if(type === "bool") return "0";
  if(type === "text") return str(v === undefined ? "" : v);
  return num(v);
}

function expr(b){
  const a = b.args || {};
  switch(b.op){
    case "fuel": return "fuel()";
    case "maxFuel": return "maxFuel()";
    case "nearPlanet": return "nearPlanet()";
    case "compare": return "(" + slot(a.a, "num") + " " + (CMP[a.op] || "<") + " " + slot(a.b, "num") + ")";
    case "andor": return "(" + slot(a.a, "bool") + (a.op === "or" ? " || " : " && ") + slot(a.b, "bool") + ")";
    case "not": return "!" + slot(a.a, "bool");
    case "bool": return a.v === "false" ? "false" : "true";
    case "math": return "(" + slot(a.a, "num") + " " + (MATH[a.op] || "+") + " " + slot(a.b, "num") + ")";
    case "getvar": return b.v || "0";
    case "param": return b.param || "0";
    case "call": return callExpr(b);
    default: return "0";
  }
}

function callExpr(b){
  const def = findDef(b.def);
  if(!def) return "0";
  return def.id + "(" + def.params.map(function(p, i){ return slot(b.args["p" + i], "num"); }).join(", ") + ")";
}

function list(blocks, ind){
  return blocks.map(function(b){ return stmt(b, ind); }).filter(Boolean).join("\n");
}

function wrap(head, body, ind){
  const inner = list(body || [], ind + "  ");
  return ind + head + " {\n" + (inner ? inner + "\n" : "") + ind + "}";
}

function stmt(b, ind){
  const a = b.args || {};
  switch(b.op){
    case "wait": return ind + "wait(" + slot(a.s, "num") + ")";
    case "repeat": return wrap("repeat (" + slot(a.n, "num") + ")", b.body, ind);
    case "forever": return wrap("while (true)", b.body, ind);
    case "while": return wrap("while (" + slot(a.c, "bool") + ")", b.body, ind);
    case "if": return wrap("if (" + slot(a.c, "bool") + ")", b.body, ind);
    case "ifelse": {
      const inner = list(b.else || [], ind + "  ");
      return wrap("if (" + slot(a.c, "bool") + ")", b.body, ind) + " else {\n" + (inner ? inner + "\n" : "") + ind + "}";
    }
    case "move": return ind + "move(" + slot(a.d, "num") + ")";
    case "turn": return ind + "turn(" + slot(a.a, "num") + ")";
    case "attack": return ind + "attack()";
    case "print": return ind + "print(" + slot(a.m, "text") + ")";
    case "setvar": return a.v ? ind + a.v + " = " + slot(a.x, "num") : "";
    case "changevar": return a.v ? ind + a.v + " = " + a.v + " + " + slot(a.x, "num") : "";
    case "return": return ind + "return " + slot(a.x, "num");
    case "call": return findDef(b.def) ? ind + callExpr(b) : "";
    default:
      // A value block left on its own in a stack does nothing.
      return shapeOf(b) === "reporter" || shapeOf(b) === "bool" ? "" : ind + "# ? " + b.op;
  }
}

export function compileProject(p){
  const out = ["# Generated from the block editor — edit the blocks, not this text."];
  let hasStart = false;
  p.files.forEach(function(f){
    f.stacks.forEach(function(s){
      const head = s.blocks[0];
      if(!head || head.op !== "define") return;
      const def = findDef(head.def);
      if(!def) return;
      out.push("", "# " + (def.kind === "func" ? "function" : "procedure") + " " + def.name.replace(/\n/g, " ") + " (file: " + f.name.replace(/\n/g, " ") + ")");
      out.push(wrap("def " + def.id + "(" + def.params.map(function(x){ return x.id; }).join(", ") + ")", s.blocks.slice(1), ""));
    });
  });
  const main = mainFile();
  const starts = main.stacks.filter(function(s){ return s.blocks[0] && s.blocks[0].op === "start"; })
    .slice().sort(function(x, y){ return x.y - y.y; });
  starts.forEach(function(s){
    hasStart = true;
    out.push("", "# when started (file: " + main.name.replace(/\n/g, " ") + ")");
    const body = list(s.blocks.slice(1), "");
    if(body) out.push(body);
  });
  return { code: out.join("\n") + "\n", hasStart: hasStart };
}
