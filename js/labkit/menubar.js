/* =======================================================================
   LABKIT · MENU BAR — the labs' and tools' common menu (FILES, OPTIONS,
   TOOLS, HELP), always visible at the top of every lab and tool page
   =======================================================================
   A classic script with no dependencies, the first thing in <body>:
     <script src="js/labkit/menubar.js"></script>        (a lab)
     <script src="../js/labkit/menubar.js"></script>     (tools/)
   It finds the site's root from its own address, adds the bar (fixed, at
   the top, MENU_H high) and moves each page's top panels down by that much
   (the selectors in OFFSETS — a new lab with a panel at the top adds its
   own there). The labs live in labs/, the tools in tools/; the start
   screen is labs.html in the root. Not part of the game.
   ======================================================================= */
(function () {
"use strict";
// THE LABS' VERSION — their own, apart from the game's (js/version.js).
// Every change to a lab, a tool, LabKit or this bar bumps it, with an entry
// in labs/CHANGELOG.md (CLAUDE.md, "Versioning"): x.y.z — y a new lab, tool
// or feature, z a fix or a small change. Shown on the bar, the start screen
// and in HELP → About.
const LABS_VERSION = "1.4.0";
const MENU_H = 32;
const ROOT = (document.currentScript && document.currentScript.src || "").replace(/js\/labkit\/menubar\.js.*$/, "");
const PARTS = location.pathname.split("/"), HERE = PARTS.pop() || "index.html", DIR = PARTS.pop() || "";
const PAGE = (DIR === "labs" || DIR === "tools" ? DIR + "/" : "") + HERE;   // e.g. "labs/ship.html"
const START = PAGE === "labs.html";
const REPO = "https://github.com/michalstankiewicz4-cell/Space/blob/main/";

// The labs and tools, shared with the start screen (window.LabMenu.ITEMS).
const LABS = [
  { file: "labs/ship.html", name: "Ship lab", doc: "docs/ship.md", keys: [["C", "change view: only the ticked blocks"], ["Double-click the name", "rename the ship"], ["Drag / wheel", "turn and zoom the camera"]] },
  { file: "labs/bodies.html", name: "Body lab", doc: "docs/bodies.md", keys: [["Drag / wheel", "turn and zoom the camera"]] },
  { file: "labs/systems.html", name: "System lab", doc: "docs/systems.md", keys: [["Drag / wheel", "turn and zoom the camera"], ["Gold diamond on the ruler", "drag: an orbit's distance"],
    ["Teal point (FROM ABOVE)", "drag out / in: stretch along / across; around: turn the axis"], ["Violet point (FROM THE SIDE)", "drag up / down: the tilt"], ["An orbit's number", "select it: its sliders"]] },
  { file: "labs/scale.html", name: "Scale lab", doc: "docs/scale.md", keys: [["Drag / wheel", "turn and zoom the camera"]] },
  { file: "labs/skins.html", name: "Skin lab", doc: "docs/skins.md", keys: [] },
  { file: "labs/surface.html", name: "Surface lab", doc: "docs/surface.md", keys: [["W / S, A / D", "drive, turn"], ["Shift", "boost"], ["Right-drag / wheel", "camera"], ["B", "build the first module"], ["R / Esc / Delete", "turn / cancel / remove a module"]] },
  { file: "labs/buildings.html", name: "Building lab", doc: "docs/surface.md", keys: [["Drag / wheel", "turn and zoom the camera"]] },
  { file: "labs/vehicles.html", name: "Vehicle lab", doc: "docs/vehicles.md", keys: [["W / S, A / D", "drive, steer"], ["Drag / wheel", "camera"]] },
  { file: "labs/sound.html", name: "Sound lab", doc: "docs/sound.md", keys: [["Space", "play / stop"], ["MOODS", "a whole mood at once"], ["SEED", "the same seed plays the same piece"]] },
  { file: "labs/marine.html", name: "Sea lab", doc: "docs/marine.md", keys: [["W / S, A / D", "drive, steer"], ["Drag / wheel", "camera"]] },
];
const TOOLS = [
  { file: "tools/doctor.html", name: "Model doctor", doc: "docs/doctor.md", keys: [["Click a model, then a finding", "its parts light up red"], ["Drag / wheel", "turn and zoom the view"]] },
  { file: "tools/kitcheck.html", name: "Kit check", doc: "CLAUDE.md", keys: [] },
  { file: "tools/grainTexture.html", name: "Grain texture", doc: "README.md", keys: [] },
];
// what each lab keeps in this browser (OPTIONS → Reset saved settings)
// (not the surface lab's roj-bases: the game shows those bases too)
const SAVED = { "labs/ship.html": ["shipLab."], "labs/skins.html": ["roj-skinlab"] };
// the pages' own top panels, moved down under the bar
const OFFSETS = `
  #hud, #opt { top: ${16 + MENU_H}px !important; max-height: calc((100vh - ${32 + MENU_H}px) / var(--ui, 1)) !important; }
  #btnView { top: ${14 + MENU_H}px !important; }
  #compass { top: ${16 + MENU_H}px !important; }
  #toast { top: ${70 + MENU_H}px !important; }
  body > #bar { top: ${MENU_H}px !important; }
  body.lmTool { padding-top: ${MENU_H + 16}px !important; }
  body.lmTool #app { height: calc(100% - ${MENU_H}px) !important; margin-top: ${MENU_H}px; }
`;
const all = LABS.concat(TOOLS);
const isTool = DIR === "tools";
const me = all.find((x) => x.file === PAGE) || null;

const CSS = `
#labMenu { position: fixed; left: 0; right: 0; top: 0; height: ${MENU_H}px; z-index: 1000; display: flex; align-items: center; gap: 2px;
  padding: 0 10px; box-sizing: border-box; background: rgba(17, 19, 24, 0.94); backdrop-filter: blur(8px);
  border-bottom: 1px solid #262a33; font: 500 13px/1 "Space Grotesk", system-ui, sans-serif; color: #c9ced8; user-select: none; }
#labMenu .lmHome { display: flex; align-items: center; gap: 8px; margin-right: 10px; padding: 0 8px 0 2px; height: 24px; border-radius: 6px;
  color: #eef1f6; text-decoration: none; font-weight: 600; letter-spacing: .2px; }
#labMenu .lmHome:hover { background: #22262f; }
#labMenu .lmMark { width: 16px; height: 16px; border-radius: 4px; background: conic-gradient(from 210deg, #5b8cff, #36d6b5, #f2b84b, #5b8cff); }
#labMenu .lmTop { position: relative; }
#labMenu .lmTop > button { height: 24px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; cursor: pointer; }
#labMenu .lmTop > button:hover, #labMenu .lmTop.open > button { background: #262a33; color: #fff; }
#labMenu .lmDrop { position: absolute; left: 0; top: 28px; min-width: 240px; padding: 6px; border-radius: 10px; background: #1a1d24;
  border: 1px solid #2c313c; box-shadow: 0 12px 32px rgba(0, 0, 0, .45); display: none; }
#labMenu .lmTop.open .lmDrop { display: block; }
#labMenu .lmItem { display: flex; align-items: center; gap: 10px; width: 100%; height: 28px; padding: 0 10px; box-sizing: border-box; border: 0;
  border-radius: 6px; background: none; color: #d7dbe4; font: inherit; font-weight: 400; text-align: left; text-decoration: none; cursor: pointer; }
#labMenu .lmItem:hover { background: #2b3a63; color: #fff; }
#labMenu .lmItem .lmChk { width: 12px; color: #36d6b5; }
#labMenu .lmItem .lmKey { margin-left: auto; color: #7d8494; font-size: 12px; }
#labMenu .lmItem[aria-disabled="true"] { color: #5d6370; cursor: default; background: none; }
#labMenu .lmSep { height: 1px; margin: 5px 6px; background: #2a2f3a; }
#labMenu .lmLabel { padding: 6px 10px 3px; color: #7d8494; font-size: 11px; letter-spacing: .8px; text-transform: uppercase; }
#labMenu .lmWhere { margin-left: auto; color: #8a91a1; font-weight: 400; }
#labMenu .lmWhere b { color: #eef1f6; font-weight: 600; }
#labMenu .lmVer { margin-left: 14px; padding: 2px 8px; border: 1px solid #2c313c; border-radius: 999px; color: #8a91a1; font-size: 11.5px;
  text-decoration: none; font-weight: 500; }
#labMenu .lmVer:hover { color: #eef1f6; border-color: #3a4152; }
#labMenu .lmWhere + .lmVer { margin-left: 12px; }
#labMenu .lmTop:last-of-type + .lmVer { margin-left: auto; }
#lmDialog { position: fixed; inset: 0; z-index: 1001; display: none; align-items: center; justify-content: center; background: rgba(5, 6, 9, .55); }
#lmDialog.open { display: flex; }
#lmDialog .lmBox { width: min(460px, calc(100vw - 32px)); padding: 20px 22px; border-radius: 14px; background: #1a1d24; border: 1px solid #2c313c;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5); font: 14px/1.5 "Space Grotesk", system-ui, sans-serif; color: #c9ced8; }
#lmDialog h3 { margin: 0 0 12px; font-size: 17px; color: #eef1f6; }
#lmDialog table { width: 100%; border-collapse: collapse; }
#lmDialog td { padding: 5px 0; border-bottom: 1px solid #262a33; vertical-align: top; }
#lmDialog td:first-child { width: 45%; color: #eef1f6; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12.5px; }
#lmDialog button { margin-top: 14px; height: 30px; padding: 0 16px; border: 1px solid #3a4152; border-radius: 8px; background: #22262f; color: #eef1f6;
  font: inherit; cursor: pointer; }
#lmDialog button:hover { background: #2b3a63; }
`;
const FONT = `@font-face{ font-family:"Space Grotesk"; font-weight:300 700; src:url(${ROOT}fonts/space-grotesk-var-latin-ext.woff2) format("woff2"); unicode-range:U+0100-024F; }
@font-face{ font-family:"Space Grotesk"; font-weight:300 700; src:url(${ROOT}fonts/space-grotesk-var-latin.woff2) format("woff2"); }`;

const style = document.createElement("style");
style.textContent = FONT + CSS + (START ? "" : OFFSETS);
document.head.appendChild(style);
if (isTool) document.body.classList.add("lmTool");

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (label, href, opts = {}) => {
  const a = el("a", "lmItem"); a.href = href;
  const c = el("span", "lmChk", opts.on ? "●" : ""); a.append(c, document.createTextNode(label));
  if (opts.key) a.appendChild(el("span", "lmKey", opts.key));
  if (opts.blank) { a.target = "_blank"; a.rel = "noopener"; }
  return a;
};
const action = (label, fn, opts = {}) => {
  const b = el("button", "lmItem"); b.type = "button";
  b.append(el("span", "lmChk", opts.on ? "✓" : ""), document.createTextNode(label));
  if (opts.key) b.appendChild(el("span", "lmKey", opts.key));
  if (opts.disabled) b.setAttribute("aria-disabled", "true");
  b.addEventListener("click", () => { if (!opts.disabled) { closeAll(); fn(b); } });
  return b;
};

// ---------- the dialog (shortcuts, about) ----------
const dlg = el("div"); dlg.id = "lmDialog";
const box = el("div", "lmBox"); dlg.appendChild(box);
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.classList.remove("open"); });
function dialog(title, rows, note) {
  box.textContent = "";
  box.appendChild(el("h3", null, title));
  if (rows && rows.length) {
    const t = el("table");
    rows.forEach(([k, v]) => { const tr = el("tr"); tr.append(el("td", null, k), el("td", null, v)); t.appendChild(tr); });
    box.appendChild(t);
  }
  if (note) box.appendChild(el("p", null, note));
  const ok = el("button", null, "Close"); ok.addEventListener("click", () => dlg.classList.remove("open"));
  box.appendChild(ok);
  dlg.classList.add("open");
}

// ---------- the menus ----------
function files() {
  return [link("Start screen", ROOT + "labs.html", { on: START }), el("div", "lmSep"), link("Back to the game", ROOT + "index.html")];
}
function options() {
  const keys = SAVED[PAGE] || [];
  return [
    action("Full screen", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); },
      { key: "F11", on: !!document.fullscreenElement }),
    action("Reload this page", () => location.reload(), { key: "F5" }),
    el("div", "lmSep"),
    action("Reset saved settings…", () => {
      if (!confirm("Forget what this lab keeps in this browser (" + keys.join(", ") + ") and reload?")) return;
      try { Object.keys(localStorage).forEach((k) => { if (keys.some((p) => k.startsWith(p))) localStorage.removeItem(k); }); } catch (e) { /* storage blocked */ }
      location.reload();
    }, { disabled: !keys.length }),
  ];
}
// the labs and the tools, all here (FILES keeps only the start screen and the game)
function tools() {
  const d = [el("div", "lmLabel", "Labs")];
  LABS.forEach((l) => d.push(link(l.name, ROOT + l.file, { on: me === l })));
  d.push(el("div", "lmSep"), el("div", "lmLabel", "Tools"));
  TOOLS.forEach((t) => d.push(link(t.name, ROOT + t.file, { on: me === t })));
  return d;
}
function help() {
  return [
    action("Keyboard and mouse", () => dialog((me ? me.name : "Labs") + ": keys and mouse", me && me.keys.length ? me.keys : [["—", "nothing special here"]])),
    link("This page's notes", REPO + (me ? me.doc : "README.md"), { blank: true }),
    link("All the docs", REPO + "README.md", { blank: true }),
    link("What's new in the labs", REPO + "labs/CHANGELOG.md", { blank: true }),
    el("div", "lmSep"),
    action("About the labs", () => dialog("Swarm Protocol labs", [["What", "the workshops the game's models, worlds and effects are made in"],
      ["Labs", "v" + LABS_VERSION], ["Game", (window.LabMenu && window.LabMenu.version) || "—"], ["Code", "MIT, github.com/michalstankiewicz4-cell/Space"]],
      "The labs and the game share the same kits: what you see here is what the game shows.")),
  ];
}

const bar = el("div"); bar.id = "labMenu";
const home = el("a", "lmHome"); home.href = ROOT + "labs.html"; home.title = "Start screen";
home.append(el("span", "lmMark"), document.createTextNode("Swarm Labs"));
bar.appendChild(home);
const menus = [["Files", files], ["Options", options], ["Tools", tools], ["Help", help]];
menus.forEach(([name, make]) => {
  const top = el("div", "lmTop"), btn = el("button", null, name); btn.type = "button";
  const drop = el("div", "lmDrop");
  top.append(btn, drop);
  let hoverOpened = 0;
  const open = () => { closeAll(); drop.textContent = ""; make().forEach((x) => drop.appendChild(x)); top.classList.add("open"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // a click right after the pointer opened it (below) keeps it open
    if (top.classList.contains("open") && performance.now() - hoverOpened > 400) closeAll(); else open();
  });
  // moving across the bar while one is open opens the next, like a desktop menu
  btn.addEventListener("pointerenter", () => {
    if (bar.querySelector(".lmTop.open") && !top.classList.contains("open")) { open(); hoverOpened = performance.now(); }
  });
  bar.appendChild(top);
});
const where = el("div", "lmWhere");
where.append(document.createTextNode(isTool ? "Tool · " : "Lab · "), el("b", null, me ? me.name : "Start screen"));
if (me) bar.appendChild(where);
// the labs' version, linked to what changed
const ver = el("a", "lmVer", "Labs v" + LABS_VERSION); ver.href = REPO + "labs/CHANGELOG.md"; ver.target = "_blank"; ver.rel = "noopener";
ver.title = "What's new in the labs";
bar.appendChild(ver);
function closeAll() { bar.querySelectorAll(".lmTop.open").forEach((t) => t.classList.remove("open")); }
document.addEventListener("pointerdown", (e) => { if (!bar.contains(e.target)) closeAll(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeAll(); dlg.classList.remove("open"); } });

document.body.prepend(bar);

// the start screen's QUICK ACCESS row: every visit to a lab or tool is counted
// here, in this browser (labsHub.visits: { file: count }, labsHub.recent:
// the newest first)
if (me) {
  try {
    const visits = JSON.parse(localStorage.getItem("labsHub.visits") || "{}") || {};
    visits[me.file] = (visits[me.file] || 0) + 1;
    localStorage.setItem("labsHub.visits", JSON.stringify(visits));
    const recent = (JSON.parse(localStorage.getItem("labsHub.recent") || "[]") || []).filter((f) => f !== me.file);
    recent.unshift(me.file);
    localStorage.setItem("labsHub.recent", JSON.stringify(recent.slice(0, 8)));
  } catch (e) { /* storage blocked: no counting */ }
}
document.body.appendChild(dlg);

// the game's version, for "About"
window.LabMenu = { ITEMS: { LABS, TOOLS }, ROOT, MENU_H, LABS_VERSION, version: null };
fetch(ROOT + "js/version.js").then((r) => r.text()).then((s) => { const m = s.match(/VERSION\s*=\s*"([^"]+)"/); if (m) window.LabMenu.version = "v" + m[1]; }).catch(() => {});
})();
