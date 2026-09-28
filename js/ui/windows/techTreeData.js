// The Research window's trees (drawn by ui/windows/techTree.js; the ◀ ▶
// arrows switch between them). Edit this file to grow them: add a tree, a
// branch point or a node anywhere, in any depth — no coordinates, the
// layout is computed (the leaves spread in a fan above the root, each
// node centred over its children, one ring per depth).
//
// A node:
//   id        unique across all trees; also its i18n keys:
//             upgrades.tree.<id> (name), upgrades.tree.<id>Desc (description)
//             — a working upgrade uses upgrades.<key> for its name instead
//   kind      "root" | "hub" (a branch point, not bought) | "upgrade" (a
//             working upgrade: `upgrade` = its key in config.js#TREE — cost,
//             levels, effect come from there) | "soon" (planned, locked)
//   icon      a key of techTree.js#ICONS
//   children  nodes growing out of this one (any kind can have them);
//             their order is their order left to right
export const TECH_TREES = [
  // 1. The swarm: the working upgrades, unchanged.
  { id: "core", kind: "root", icon: "core", children: [
    { id: "hubShield", kind: "hub", icon: "shield", children: [
      { id: "heat", kind: "upgrade", upgrade: "heat", icon: "flame" },
      { id: "cold", kind: "upgrade", upgrade: "cold", icon: "snow" }
    ] },
    { id: "speed", kind: "upgrade", upgrade: "speed", icon: "bolt" },
    { id: "power", kind: "upgrade", upgrade: "power", icon: "jaw" },
    { id: "hubSwarm", kind: "hub", icon: "swarm", children: [
      { id: "fleet", kind: "upgrade", upgrade: "fleet", icon: "ships" }
    ] }
  ] },
  // 2. Programming — the user's concept art (UpgradeTree.png): planned,
  // tied to the future computing-power limit (IDEAS.md, "Drone
  // computational power").
  { id: "codeRoot", kind: "root", icon: "code", children: [
    { id: "cpu", kind: "soon", icon: "chip", children: [
      { id: "overclock", kind: "soon", icon: "gauge" },
      { id: "cache", kind: "soon", icon: "layers" }
    ] },
    { id: "memory", kind: "soon", icon: "memory", children: [
      { id: "stack", kind: "soon", icon: "stack" },
      { id: "compress", kind: "soon", icon: "compress" }
    ] },
    { id: "bandwidth", kind: "soon", icon: "antenna", children: [
      { id: "relay", kind: "soon", icon: "relay" },
      { id: "range", kind: "soon", icon: "range" }
    ] },
    { id: "threads", kind: "soon", icon: "threads", children: [
      { id: "parallel", kind: "soon", icon: "parallel" },
      { id: "sync", kind: "soon", icon: "sync" }
    ] }
  ] }
];
