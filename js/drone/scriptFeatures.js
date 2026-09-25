import { parseDroneScript } from "./dsl.js";

// Which language features a drone program uses — the keys of the Wiki's
// programming entries ("prog:" + key, see ui/windows/wikiEntries.js).
// Read off the parsed program rather than tracked while it runs, so a
// command counts as used as soon as a program containing it is started.
// Pure: no game state, no DOM; returns [] for a program that won't parse.
const CALLS = { move: "cmdMove", turn: "cmdTurn", wait: "cmdWait", attack: "cmdAttack", print: "cmdPrint",
  fuel: "cmdFuel", maxFuel: "cmdFuel", nearPlanet: "cmdNear" };
const LOGIC_OPS = ["<", ">", "<=", ">=", "==", "!=", "&&", "||"];
const MATH_OPS = ["+", "-", "*", "/"];

export function scriptFeatures(src){
  let ast;
  try{ ast = parseDroneScript(src || ""); }catch(e){ return []; }
  const found = new Set();
  function visit(n, inDef){
    if(!n || typeof n !== "object") return;
    switch(n.type){
      case "Call": if(CALLS[n.name]) found.add(CALLS[n.name]); break;
      case "Repeat": found.add("cmdRepeat"); break;
      case "While": found.add("cmdWhile"); break;
      case "If": found.add("cmdIf"); break;
      case "Assign": found.add("cmdVars"); break;
      case "Def": found.add("cmdProc"); break;
      case "Return": if(inDef && n.value) found.add("cmdFunc"); break;
      case "Unary": found.add(n.op === "!" ? "cmdLogic" : "cmdMath"); break;
      case "Binary":
        if(LOGIC_OPS.indexOf(n.op) !== -1) found.add("cmdLogic");
        if(MATH_OPS.indexOf(n.op) !== -1) found.add("cmdMath");
        break;
    }
    const nowInDef = inDef || n.type === "Def";
    Object.keys(n).forEach(function(k){
      const v = n[k];
      if(Array.isArray(v)) v.forEach(function(x){ visit(x, nowInDef); });
      else if(v && typeof v === "object") visit(v, nowInDef);
    });
  }
  visit(ast, false);
  return Array.from(found);
}
