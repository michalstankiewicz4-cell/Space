// The block editor's catalog: categories (with their colors, reused as the
// block colors) and one spec per block type. The words on a block come from
// i18n `blocks.op.<op>`, a template whose `{name}` placeholders are this
// spec's args. Shapes:
//   hat      starts a stack (nothing above it)        start, define
//   stack    one command                              move, wait, ...
//   c / cc   a command wrapping one / two stacks      repeat, if, if-else
//   cap      ends a stack (nothing below it)          return
//   reporter a round value                            fuel, math, variables
//   bool     a pointed true/false value               comparisons, and/or
// Arg types: num, text (typed in place), bool (an empty pointed hole
// until a bool block is dropped in), var (a variable dropdown), op (a
// fixed dropdown, `options`).
export const CATEGORIES = [
  { id: "control",  c: "#f8bb56", hi: "#ffda92", lo: "#d38b37", ink: "#241404" },
  { id: "engine",   c: "#5f77f7", hi: "#90a3ff", lo: "#3a50d2", ink: "#ffffff" },
  { id: "logic",    c: "#2fc79a", hi: "#7fe8c7", lo: "#1b9a76", ink: "#04241b" },
  { id: "vars",     c: "#ff8a3c", hi: "#ffb27f", lo: "#d8651c", ink: "#2a1002" },
  { id: "mine",     c: "#e0607a", hi: "#f59aac", lo: "#b53e58", ink: "#ffffff" },
  { id: "examples", c: "#b07cb6", hi: "#d3a7d8", lo: "#875a8d", ink: "#ffffff" }
];

// Color markers a file can carry (cycled by clicking the file's dot);
// blocks you define show their file's marker, so you can tell at a glance
// which "file" a procedure lives in.
export const FILE_COLORS = ["#f8bb56", "#5f77f7", "#2fc79a", "#ff8a3c", "#e0607a", "#b07cb6"];

export const SPECS = {
  start:      { cat: "control", shape: "hat" },
  wait:       { cat: "control", shape: "stack", args: [{ n: "s", t: "num", d: 1 }] },
  repeat:     { cat: "control", shape: "c", args: [{ n: "n", t: "num", d: 4 }] },
  forever:    { cat: "control", shape: "c" },
  while:      { cat: "control", shape: "c", args: [{ n: "c", t: "bool" }] },
  if:         { cat: "control", shape: "c", args: [{ n: "c", t: "bool" }] },
  ifelse:     { cat: "control", shape: "cc", args: [{ n: "c", t: "bool" }] },

  move:       { cat: "engine", shape: "stack", args: [{ n: "d", t: "num", d: 10 }] },
  turn:       { cat: "engine", shape: "stack", args: [{ n: "a", t: "num", d: 90 }] },
  attack:     { cat: "engine", shape: "stack" },
  print:      { cat: "engine", shape: "stack", args: [{ n: "m", t: "text", d: "Hello!" }] },
  fuel:       { cat: "engine", shape: "reporter" },
  maxFuel:    { cat: "engine", shape: "reporter" },
  nearPlanet: { cat: "engine", shape: "bool" },

  compare:    { cat: "logic", shape: "bool", args: [{ n: "a", t: "num", d: "" }, { n: "op", t: "op", options: ["<", ">", "=", "≠", "≤", "≥"], d: "<" }, { n: "b", t: "num", d: 50 }] },
  andor:      { cat: "logic", shape: "bool", args: [{ n: "a", t: "bool" }, { n: "op", t: "op", options: ["and", "or"], d: "and" }, { n: "b", t: "bool" }] },
  not:        { cat: "logic", shape: "bool", args: [{ n: "a", t: "bool" }] },
  bool:       { cat: "logic", shape: "bool", args: [{ n: "v", t: "op", options: ["true", "false"], d: "true" }] },

  setvar:     { cat: "vars", shape: "stack", args: [{ n: "v", t: "var" }, { n: "x", t: "num", d: 0 }] },
  changevar:  { cat: "vars", shape: "stack", args: [{ n: "v", t: "var" }, { n: "x", t: "num", d: 1 }] },
  getvar:     { cat: "vars", shape: "reporter" },   // block.v = variable id
  math:       { cat: "vars", shape: "reporter", args: [{ n: "a", t: "num", d: "" }, { n: "op", t: "op", options: ["+", "−", "×", "÷"], d: "+" }, { n: "b", t: "num", d: 1 }] },

  define:     { cat: "mine", shape: "hat" },        // block.def = definition id
  call:       { cat: "mine", shape: "stack" },      // block.def; reporter for a function; args p0, p1, ...
  param:      { cat: "mine", shape: "reporter" },   // block.def + block.param
  return:     { cat: "mine", shape: "cap", args: [{ n: "x", t: "num", d: 0 }] }
};

// Which ops each palette category offers (vars/mine/examples add their
// own dynamic parts on top, see ui/windows/blockPalette.js).
export const PALETTE = {
  control: ["start", "wait", "repeat", "forever", "while", "if", "ifelse"],
  engine: ["move", "turn", "attack", "print", "fuel", "maxFuel", "nearPlanet"],
  logic: ["compare", "andor", "not", "bool"],
  vars: ["setvar", "changevar", "math"],
  mine: ["return"]
};

export function categoryOf(id){
  return CATEGORIES.find(function(c){ return c.id === id; });
}

export function isValueShape(shape){ return shape === "reporter" || shape === "bool"; }
