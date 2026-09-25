import { makeBlock, addFile, addVar, addDef, setMainFile } from "./blockProject.js";
import { FILE_COLORS } from "./blockSpecs.js";
import { t } from "../i18n.js";

// Ready-made programs in the Examples palette. Loading one adds it as a
// new file and makes that file the main one (the star can be moved back
// to the player's own file at any time — nothing of theirs is touched).
// Variable and definition names come from i18n, so an example loaded in
// Polish reads in Polish.
function B(op, args, body, elseBody, extra){
  const b = makeBlock(op, extra);
  Object.keys(args || {}).forEach(function(k){ b.args[k] = args[k]; });
  if(body) b.body = body;
  if(elseBody) b.else = elseBody;
  return b;
}
function names(key){ return t("blocks.examples." + key + ".names") || {}; }

const BUILDERS = {
  patrol: function(){
    return [[B("start"), B("forever", null, [B("repeat", { n: 4 }, [B("move", { d: 20 }), B("turn", { a: 90 })])])]];
  },
  hunter: function(){
    return [[B("start"), B("while", { c: B("compare", { a: B("fuel"), op: ">", b: 10 }) }, [
      B("move", { d: 5 }),
      B("ifelse", { c: B("nearPlanet") },
        [B("print", { m: names("hunter").shout || "!" }), B("attack"), B("wait", { s: 0.5 })],
        [B("turn", { a: 20 })])
    ])]];
  },
  refuel: function(){
    const dist = addVar(names("refuel").dist || "dist");
    const set = function(op, x){ const b = B(op, { x: x }); b.args.v = dist.id; return b; };
    return [[B("start"), set("setvar", 0),
      B("while", { c: B("compare", { a: B("fuel"), op: ">", b: B("math", { a: B("maxFuel"), op: "÷", b: 3 }) }) },
        [B("move", { d: 5 }), set("changevar", 5)]),
      B("turn", { a: 180 }),
      B("move", { d: B("getvar", null, null, null, { v: dist.id }) }),
      B("print", { m: names("refuel").msg || "Refuel" })]];
  },
  spiral: function(){
    const n = names("spiral");
    const side = addDef("proc", n.side || "side", [n.len || "length"]);
    const step = addVar(n.step || "step");
    const setStep = function(op, x){ const b = B(op, { x: x }); b.args.v = step.id; return b; };
    const call = B("call", null, null, null, { def: side.id });
    call.args.p0 = B("getvar", null, null, null, { v: step.id });
    return [
      [B("define", null, null, null, { def: side.id }),
        B("move", { d: B("param", null, null, null, { def: side.id, param: side.params[0].id }) }),
        B("turn", { a: 90 })],
      [B("start"), setStep("setvar", 5), B("repeat", { n: 12 }, [call, setStep("changevar", 5)])]
    ];
  },
  square: function(){
    const n = names("square");
    const sq = addDef("func", n.fn || "square", [n.x || "x"]);
    const i = addVar(n.i || "i");
    const px = function(){ return B("param", null, null, null, { def: sq.id, param: sq.params[0].id }); };
    const setI = function(op, x){ const b = B(op, { x: x }); b.args.v = i.id; return b; };
    const call = B("call", null, null, null, { def: sq.id });
    call.args.p0 = B("getvar", null, null, null, { v: i.id });
    return [
      [B("define", null, null, null, { def: sq.id }), B("return", { x: B("math", { a: px(), op: "×", b: px() }) })],
      [B("start"), setI("setvar", 1), B("repeat", { n: 5 }, [B("print", { m: call }), setI("changevar", 1), B("wait", { s: 2 })])]
    ];
  }
};

export const EXAMPLE_KEYS = Object.keys(BUILDERS);

export function loadExample(key){
  const stacks = BUILDERS[key]();
  const f = addFile(t("blocks.examples." + key + ".name"), FILE_COLORS[5]);
  let y = 40;
  stacks.forEach(function(blocks, i){
    f.stacks.push({ x: 40 + i * 20, y: y, blocks: blocks });
    y += 60 + blocks.length * 50;
  });
  setMainFile(f.id);
  return f;
}
