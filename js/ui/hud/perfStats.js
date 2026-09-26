import { ctx } from "../../core/context.js";
import { readStorage, writeStorage } from "../../core/utils.js";
import { t } from "../../i18n.js";

// Dev Tools -> "Performance stats": a small panel in the 3D viewport's
// top-left corner, like the labs' PERFORMANCE box. main.js brackets every
// frame with perfFrameStart() / perfRenderStart() / perfFrameEnd(); the
// renderer's counters are summed over ALL of a frame's render passes (main
// view, ship cam, miniatures) — three.js resets them per render() call by
// default, so autoReset is off and they're reset once per frame here.
// The text refreshes twice a second; the graph shows the last ~2 s of
// frame times. The on/off choice is remembered (localStorage).
const STORAGE_KEY = "roj-devPerf";
const GRAPH_FRAMES = 120;
const frameMs = new Float32Array(GRAPH_FRAMES);
let head = 0;
let panel = null, textEl = null, graph = null, g2d = null;
let on = false;
let lastFrameAt = 0, frameStartAt = 0, renderStartAt = 0;
// accumulated over the current half-second window
let acc = { frames: 0, time: 0, worst: 0, update: 0, render: 0 };

export function initPerfStats(){
  panel = document.getElementById("perfStats");
  textEl = document.getElementById("perfStatsText");
  graph = document.getElementById("perfStatsGraph");
  g2d = graph.getContext("2d");
  ctx.renderer.info.autoReset = false;
  setPerfStatsVisible(readStorage(STORAGE_KEY) === "1");
}

export function perfStatsVisible(){ return on; }

export function setPerfStatsVisible(show){
  on = !!show;
  panel.classList.toggle("hidden", !on);
  writeStorage(STORAGE_KEY, on ? "1" : "0");
  acc = { frames: 0, time: 0, worst: 0, update: 0, render: 0 };
}

export function perfFrameStart(){
  frameStartAt = performance.now();
  ctx.renderer.info.reset();
}

export function perfRenderStart(){
  renderStartAt = performance.now();
}

export function perfFrameEnd(){
  const now = performance.now();
  const interval = lastFrameAt ? now - lastFrameAt : 16.7;
  lastFrameAt = now;
  if(!on) return;
  frameMs[head] = interval;
  head = (head + 1) % GRAPH_FRAMES;
  acc.frames++;
  acc.time += interval;
  acc.worst = Math.max(acc.worst, interval);
  acc.update += renderStartAt - frameStartAt;
  acc.render += now - renderStartAt;
  if(acc.time >= 500) refresh();
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");

function refresh(){
  const r = ctx.renderer, n = acc.frames;
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  let objects = 0;
  ctx.scene.traverse(function(){ objects++; });
  const rows = [
    [t("devTools.stats.fps"), fmt(n * 1000 / acc.time)],
    [t("devTools.stats.frame"), (acc.time / n).toFixed(1) + " ms"],
    [t("devTools.stats.worst"), acc.worst.toFixed(1) + " ms"],
    [t("devTools.stats.cpu"), (acc.update / n).toFixed(1) + " + " + (acc.render / n).toFixed(1) + " ms"],
    [t("devTools.stats.calls"), fmt(r.info.render.calls)],
    [t("devTools.stats.tris"), fmt(r.info.render.triangles)],
    [t("devTools.stats.memory"), r.info.memory.geometries + " / " + r.info.memory.textures + " / " + r.info.programs.length],
    [t("devTools.stats.resolution"), size.x + "×" + size.y + " @" + r.getPixelRatio().toFixed(2)],
    [t("devTools.stats.scene"), fmt(objects)],
    [t("devTools.stats.units"), ctx.planets.length + " / " + ctx.ships.length + " / " + Object.keys(ctx.remotePlayers).length]
  ];
  if(performance.memory) rows.push([t("devTools.stats.heap"), fmt(performance.memory.usedJSHeapSize / 1048576) + " MB"]);
  // textContent only: no markup from strings
  textEl.textContent = "";
  rows.forEach(function(row){
    const line = document.createElement("div");
    const k = document.createElement("span"); k.textContent = row[0];
    const v = document.createElement("b"); v.textContent = row[1];
    line.append(k, v);
    textEl.appendChild(line);
  });
  drawGraph();
  acc = { frames: 0, time: 0, worst: 0, update: 0, render: 0 };
}

// Frame times as bars: green under 60 FPS' budget, amber to 30 FPS, red above.
function drawGraph(){
  const w = graph.width, h = graph.height, bw = w / GRAPH_FRAMES;
  g2d.clearRect(0, 0, w, h);
  for(let i = 0; i < GRAPH_FRAMES; i++){
    const ms = frameMs[(head + i) % GRAPH_FRAMES];
    if(!ms) continue;
    const bh = Math.min(h, ms / 50 * h);                   // full height = 50 ms (20 FPS)
    g2d.fillStyle = ms <= 17.5 ? "#4fe3c6" : ms <= 34 ? "#f5bd5c" : "#ff5a5f";
    g2d.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh);
  }
  g2d.fillStyle = "rgba(255,255,255,0.35)";                // 60 and 30 FPS lines
  g2d.fillRect(0, h - 16.7 / 50 * h, w, 1);
  g2d.fillRect(0, h - 33.3 / 50 * h, w, 1);
}
