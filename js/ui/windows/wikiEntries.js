// The Wiki's entries, per tab (texts live in js/i18n.js under wiki.entries.*,
// keyed by the part of the id after the colon). `art` describes the picture
// (ui/windows/wikiArt.js draws it); `unlock` says how it gets discovered:
//   "start"    known from the first moment (the home system, your own race,
//              station, ships and drone)
//   "inspect"  the first time the player looks at that body (select/hover)
//   "research" the first upgrade bought in it
//   "script"   the first drone script run
//   "use"      a drone program using that command/feature was run
//              (drone/scriptFeatures.js reads it off the program itself)
//   "blocks"   a program built from blocks was run
//   "files"    a second file was made in the block editor
//   "future"   not reachable yet — arrives with a future update
// `meta` (optional) is a language-neutral fact line shown under the name:
// elements, minerals and ores are real, so it carries their real data
// (atomic number, symbol, standard atomic weight / chemical formula);
// refined resources their real composition; programming entries the same
// command written in the text script language.
export const WIKI_TABS = ["systems", "bodies", "elements", "minerals", "ores", "resources", "materials", "buildings", "ships", "tech", "programming", "races"];

export const WIKI_ENTRIES = {
  systems: [
    { id: "system:home", unlock: "start", art: { type: "system", rings: 9, dots: 8 } },
    { id: "system:binary", unlock: "future", art: { type: "system", rings: 5, dots: 5, binary: true } },
    { id: "system:rift", unlock: "future", art: { type: "system", rings: 3, dots: 2, rift: true } }
  ],
  bodies: [
    { id: "body:sun", unlock: "inspect", art: { type: "sun" } },
    { id: "body:volcanic", unlock: "inspect", art: { type: "planet", variant: "volcanic" } },
    { id: "body:neutral", unlock: "inspect", art: { type: "planet", variant: "neutral" } },
    { id: "body:ice", unlock: "inspect", art: { type: "planet", variant: "ice" } },
    { id: "body:meteoroid", unlock: "inspect", art: { type: "meteoroid" } },
    { id: "body:comet", unlock: "inspect", art: { type: "comet" } },
    { id: "body:blackhole", unlock: "inspect", art: { type: "blackhole" } }
  ],
  elements: [
    { id: "element:hydrogen", unlock: "future", meta: "Z = 1 · H · 1.008 u", art: { type: "element", n: 1, sym: "H", group: "nonmetal" } },
    { id: "element:helium", unlock: "future", meta: "Z = 2 · He · 4.0026 u", art: { type: "element", n: 2, sym: "He", group: "noble" } },
    { id: "element:carbon", unlock: "future", meta: "Z = 6 · C · 12.011 u", art: { type: "element", n: 6, sym: "C", group: "nonmetal" } },
    { id: "element:oxygen", unlock: "future", meta: "Z = 8 · O · 15.999 u", art: { type: "element", n: 8, sym: "O", group: "nonmetal" } },
    { id: "element:magnesium", unlock: "future", meta: "Z = 12 · Mg · 24.305 u", art: { type: "element", n: 12, sym: "Mg", group: "alkaline" } },
    { id: "element:silicon", unlock: "future", meta: "Z = 14 · Si · 28.085 u", art: { type: "element", n: 14, sym: "Si", group: "metalloid" } },
    { id: "element:sulfur", unlock: "future", meta: "Z = 16 · S · 32.06 u", art: { type: "element", n: 16, sym: "S", group: "nonmetal" } },
    { id: "element:iron", unlock: "future", meta: "Z = 26 · Fe · 55.845 u", art: { type: "element", n: 26, sym: "Fe", group: "metal" } },
    { id: "element:nickel", unlock: "future", meta: "Z = 28 · Ni · 58.693 u", art: { type: "element", n: 28, sym: "Ni", group: "metal" } },
    { id: "element:platinum", unlock: "future", meta: "Z = 78 · Pt · 195.08 u", art: { type: "element", n: 78, sym: "Pt", group: "precious" } }
  ],
  minerals: [
    { id: "mineral:olivine", unlock: "future", meta: "(Mg,Fe)₂SiO₄", art: { type: "mineral", shape: "gem", colors: ["#c6f07a", "#6f9a2a"] } },
    { id: "mineral:pyroxene", unlock: "future", meta: "(Mg,Fe)SiO₃", art: { type: "mineral", shape: "prism", colors: ["#6e7d55", "#1f2a18"] } },
    { id: "mineral:quartz", unlock: "future", meta: "SiO₂", art: { type: "mineral", shape: "hexprism", colors: ["#f4f8ff", "#9fb4d6"] } },
    { id: "mineral:waterice", unlock: "future", meta: "H₂O", art: { type: "mineral", shape: "hexplate", colors: ["#e6f7ff", "#6fb8e8"] } },
    { id: "mineral:graphite", unlock: "future", meta: "C", art: { type: "mineral", shape: "layers", colors: ["#5a5e66", "#15171b"] } },
    { id: "mineral:troilite", unlock: "future", meta: "FeS", art: { type: "mineral", shape: "nugget", colors: ["#e3c27a", "#7a5a22"] } }
  ],
  ores: [
    { id: "ore:hematite", unlock: "future", meta: "Fe₂O₃", art: { type: "mineral", shape: "spheres", colors: ["#b8b8c2", "#7a1f18"] } },
    { id: "ore:magnetite", unlock: "future", meta: "Fe₃O₄", art: { type: "mineral", shape: "octa", colors: ["#6a6f7a", "#111318"] } },
    { id: "ore:kamacite", unlock: "future", meta: "α-(Fe,Ni)", art: { type: "mineral", shape: "etched", colors: ["#d7dbe2", "#7d8591"] } },
    { id: "ore:pentlandite", unlock: "future", meta: "(Fe,Ni)₉S₈", art: { type: "mineral", shape: "nugget", colors: ["#f0dd9a", "#8a7430"] } },
    { id: "ore:sperrylite", unlock: "future", meta: "PtAs₂", art: { type: "mineral", shape: "cube", colors: ["#e8ecf2", "#7c8594"] } }
  ],
  // Refined resources: the step between raw ore and a finished material.
  resources: [
    { id: "resource:pigiron", unlock: "future", meta: "Fe + 3.5–4.5% C", art: { type: "resource", shape: "ingot", colors: ["#8a8f99", "#3a3d44"] } },
    { id: "resource:steel", unlock: "future", meta: "Fe + < 2.1% C", art: { type: "resource", shape: "ingot", colors: ["#dfe6f0", "#7d8a9c"] } },
    { id: "resource:nickelrefined", unlock: "future", meta: "Ni ≥ 99.8%", art: { type: "resource", shape: "ingot", colors: ["#e6e0c6", "#8f8a70"] } },
    { id: "resource:platinumrefined", unlock: "future", meta: "Pt ≥ 99.95%", art: { type: "resource", shape: "ingot", colors: ["#ffffff", "#9aa0aa"] } },
    { id: "resource:mgsilicon", unlock: "future", meta: "Si 98–99%", art: { type: "resource", shape: "chunk", colors: ["#b9c9dc", "#4a5a70"] } },
    { id: "resource:quartzsand", unlock: "future", meta: "SiO₂ ≥ 99%", art: { type: "resource", shape: "sand", colors: ["#f1e6cc", "#b8a57e"] } },
    { id: "resource:water", unlock: "future", meta: "H₂O", art: { type: "resource", shape: "drop", colors: ["#d9f2ff", "#2f7fd0"] } }
  ],
  materials: [
    { id: "material:hullplate", unlock: "future", art: { type: "material", shape: "plates" } },
    { id: "material:glass", unlock: "future", art: { type: "material", shape: "glass" } },
    { id: "material:electronics", unlock: "future", art: { type: "material", shape: "circuit" } },
    { id: "material:ceramic", unlock: "future", art: { type: "material", shape: "tiles" } },
    { id: "material:fiber", unlock: "future", art: { type: "material", shape: "fiber" } },
    { id: "material:fuel", unlock: "future", art: { type: "material", shape: "fuel" } }
  ],
  buildings: [
    { id: "building:station", unlock: "start", art: { type: "building", kind: "station" } },
    { id: "building:mine", unlock: "future", art: { type: "building", kind: "mine" } },
    { id: "building:refinery", unlock: "future", art: { type: "building", kind: "refinery" } },
    { id: "building:shipyard", unlock: "future", art: { type: "building", kind: "shipyard" } },
    { id: "building:lab", unlock: "future", art: { type: "building", kind: "lab" } }
  ],
  ships: [
    { id: "ship:swarmer", unlock: "start", art: { type: "ship", kind: "swarmer" } },
    { id: "ship:drone", unlock: "start", art: { type: "ship", kind: "drone" } },
    { id: "ship:codewing", unlock: "future", art: { type: "ship", kind: "codewing" } },
    { id: "ship:bladeship", unlock: "future", art: { type: "ship", kind: "blade" } }
  ],
  tech: [
    { id: "tech:speed", unlock: "research", art: { type: "tech", icon: "⚡" } },
    { id: "tech:power", unlock: "research", art: { type: "tech", icon: "💥" } },
    { id: "tech:heat", unlock: "research", art: { type: "tech", icon: "🔥" } },
    { id: "tech:cold", unlock: "research", art: { type: "tech", icon: "❄️" } },
    { id: "tech:fleet", unlock: "research", art: { type: "tech", icon: "🚀" } },
    { id: "tech:droneScript", unlock: "script", art: { type: "tech", icon: "📜" } }
  ],
  // One entry per drone command/feature, discovered by using it.
  programming: [
    { id: "prog:cmdMove", unlock: "use", meta: "move(10)", art: { type: "code", op: "move", sample: { d: 10 } } },
    { id: "prog:cmdTurn", unlock: "use", meta: "turn(90)", art: { type: "code", op: "turn", sample: { a: 90 } } },
    { id: "prog:cmdWait", unlock: "use", meta: "wait(1)", art: { type: "code", op: "wait", sample: { s: 1 } } },
    { id: "prog:cmdAttack", unlock: "use", meta: "attack()", art: { type: "code", op: "attack" } },
    { id: "prog:cmdPrint", unlock: "use", meta: "print(\"Hello!\")", art: { type: "code", op: "print", sample: { m: "“…”" } } },
    { id: "prog:cmdFuel", unlock: "use", meta: "fuel()  ·  maxFuel()", art: { type: "code", op: "fuel" } },
    { id: "prog:cmdNear", unlock: "use", meta: "nearPlanet()", art: { type: "code", op: "nearPlanet" } },
    { id: "prog:cmdRepeat", unlock: "use", meta: "repeat (4) { … }", art: { type: "code", op: "repeat", sample: { n: 4 } } },
    { id: "prog:cmdWhile", unlock: "use", meta: "while (…) { … }", art: { type: "code", op: "forever" } },
    { id: "prog:cmdIf", unlock: "use", meta: "if (…) { … } else { … }", art: { type: "code", op: "ifelse" } },
    { id: "prog:cmdLogic", unlock: "use", meta: "<  >  ==  !=  &&  ||  !", art: { type: "code", op: "compare", sample: { a: "x", op: "<", b: 5 } } },
    { id: "prog:cmdMath", unlock: "use", meta: "+  -  *  /", art: { type: "code", op: "math", sample: { a: "x", op: "×", b: 2 } } },
    { id: "prog:cmdVars", unlock: "use", meta: "x = 5", art: { type: "code", op: "setvar", sample: { v: "x", x: 5 } } },
    { id: "prog:cmdProc", unlock: "use", meta: "def side(length) { … }", art: { type: "code", op: "define" } },
    { id: "prog:cmdFunc", unlock: "use", meta: "return x * x", art: { type: "code", op: "return", sample: { x: "x × x" } } },
    { id: "prog:cmdBlocks", unlock: "blocks", art: { type: "code", special: "switch" } },
    { id: "prog:cmdFiles", unlock: "files", art: { type: "code", special: "files" } }
  ],
  races: [
    { id: "race:swarm", unlock: "start", art: { type: "race", race: "swarm" } },
    { id: "race:blade", unlock: "future", art: { type: "race", race: "blade" } },
    { id: "race:unknown", unlock: "future", art: { type: "race", race: "unknown" } }
  ]
};

export function allWikiIds(){
  const ids = [];
  WIKI_TABS.forEach(function(tab){ WIKI_ENTRIES[tab].forEach(function(e){ ids.push(e.id); }); });
  return ids;
}

export function findWikiEntry(id){
  for(let i = 0; i < WIKI_TABS.length; i++){
    const e = WIKI_ENTRIES[WIKI_TABS[i]].find(function(x){ return x.id === id; });
    if(e) return e;
  }
  return null;
}
