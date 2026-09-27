import { ctx } from "../core/context.js";
import { readStorage, writeStorage } from "../core/utils.js";
import { withProject } from "../blocks/blockProject.js";
import { compileProject } from "../blocks/blockCompile.js";

// Every programmable unit keeps two programs side by side — a text script
// and a block project — plus which of the two START runs ("script" |
// "blocks"). Switching modes only chooses, it never deletes either (the
// user's explicit call). Persisted per unit in localStorage: the drone
// under its original keys (roj-drone-script / -mode / -blocks, so existing
// programs survive), swarm ship N under roj-ship-script-N / -mode-N /
// -blocks-N — N is the ship's place in the fleet ("Ship N" in the HUD).
// Everything else about a program's run (running, error, logs) lives on
// the unit and resets every session, like the rest of ctx.

function base(unit){
  if(unit === ctx.drone) return { script: "roj-drone-script", mode: "roj-drone-mode", blocks: "roj-drone-blocks" };
  const n = ctx.ships.indexOf(unit) + 1;
  return { script: "roj-ship-script-" + n, mode: "roj-ship-mode-" + n, blocks: "roj-ship-blocks-" + n };
}

export function getUnitScript(unit){ return readStorage(base(unit).script) || ""; }
export function setUnitScript(unit, src){ writeStorage(base(unit).script, src); }

export function getUnitMode(unit){ return readStorage(base(unit).mode) === "blocks" ? "blocks" : "script"; }
export function setUnitMode(unit, mode){ writeStorage(base(unit).mode, mode === "blocks" ? "blocks" : "script"); }

// The localStorage key of the unit's block project (blocks/blockProject.js).
export function unitBlocksKey(unit){ return base(unit).blocks; }

// The program START runs: the text script as typed, or the block project
// compiled to the same language.
export function activeProgramSource(unit){
  if(getUnitMode(unit) === "blocks") return withProject(unitBlocksKey(unit), function(p){ return compileProject(p).code; });
  return getUnitScript(unit);
}
