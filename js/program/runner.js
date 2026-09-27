import { parseDroneScript } from "../drone/dsl.js";
import { runProgram } from "../drone/interpreter.js";

// Runs a player's program on any programmable unit — the drone or a swarm
// ship. The language (drone/dsl.js) and its generator-based interpreter
// (drone/interpreter.js) are shared; what differs per unit kind is only
// what the builtins do, supplied as `unit.api`:
//
//   api.start(unit, name, args) -> { blocking: false, value } for an instant
//     result, or { blocking: true, state } to start a multi-frame operation
//   api.advance(unit, pending, dt) -> true once that operation is done
//     (it may set pending.value: what the blocking call returns)
//   api.prepare(unit) (optional) -> called when a program starts
//
// The unit carries its run state: running, error, logs, gen, pending.

// Runaway-script guard: a script with no move()/turn()/wait() in a while
// loop (e.g. `while(true){ attack() }`) would otherwise resolve instant
// builtins synchronously forever inside a single frame, freezing the tab.
// If a script hasn't hit a blocking call within this many resumptions in
// one frame, it's stopped with an error instead.
export const MAX_INSTANT_STEPS_PER_FRAME = 2000;

export function logTo(unit, msg){
  unit.logs.push(String(msg));
  if(unit.logs.length > 50) unit.logs.shift();
}

export function stopUnitProgram(unit){
  unit.running = false;
  unit.gen = null;
  unit.pending = null;
}

// Parses and starts `src`. A parse error is reported in unit.error.
export function runUnitProgram(unit, src){
  stopUnitProgram(unit);
  unit.error = null;
  unit.logs = [];
  try{
    if(unit.api.prepare) unit.api.prepare(unit);
    const ast = parseDroneScript(src || "");
    unit.gen = runProgram(ast, { vars: {} });
    unit.running = true;
    driveGenerator(unit, undefined);
  }catch(e){
    unit.error = e.message;
    unit.running = false;
  }
}

// Resumes unit.gen with `input` (the value its last `yield` should evaluate
// to) and keeps resolving instant builtins synchronously until either the
// script finishes, it hits a blocking call (stored in unit.pending for
// stepUnitProgram() to advance over time), or it errors.
function driveGenerator(unit, input){
  let steps = 0;
  try{
    while(true){
      const res = unit.gen.next(input);
      if(res.done){
        unit.running = false;
        unit.gen = null;
        return;
      }
      const call = res.value; // {name, args}
      const outcome = unit.api.start(unit, call.name, call.args);
      if(outcome.blocking){
        unit.pending = outcome.state;
        return;
      }
      input = outcome.value;
      if(++steps > MAX_INSTANT_STEPS_PER_FRAME){
        throw new Error("Script did not pause (missing wait()?) — stopped after " + MAX_INSTANT_STEPS_PER_FRAME + " steps.");
      }
    }
  }catch(e){
    unit.error = e.message;
    unit.running = false;
    unit.gen = null;
    unit.pending = null;
  }
}

// One frame of a running program: advance the blocking call in progress,
// or resume the script once it's done.
export function stepUnitProgram(unit, dt){
  if(!unit.running) return;
  if(unit.pending){
    if(unit.api.advance(unit, unit.pending, dt)){
      const value = unit.pending.value;
      unit.pending = null;
      driveGenerator(unit, value);
    }
  } else {
    driveGenerator(unit, undefined);
  }
}
