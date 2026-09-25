import { readStorage, writeStorage } from "../core/utils.js";

// Which editor the drone's program comes from: "script" (the text DSL,
// drone.script) or "blocks" (the block editor's project, compiled to the
// same DSL on every run). Both programs are kept side by side — switching
// only chooses which one START runs, it never overwrites the other.
const STORAGE_KEY = "roj-drone-mode";
let mode = readStorage(STORAGE_KEY) === "blocks" ? "blocks" : "script";

export function getDroneMode(){ return mode; }

export function setDroneMode(m){
  mode = m === "blocks" ? "blocks" : "script";
  writeStorage(STORAGE_KEY, mode);
}
