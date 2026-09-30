import { t, onLangChange } from "../i18n.js";

// The loading bar: the start screen's ENTER ORBIT button fills up while
// the game gets ready, with the current stage and a percentage on it; the
// button unlocks once everything is built and the shaders are compiled.
// index.html starts it in the "loading waiting" state (the libraries are
// still downloading then — a sweeping glint, no number, since the browser
// reports no progress for deferred scripts); main.js moves it through the
// stages (setLoad) and ends it (loadDone): a full bar with a random joke
// for JOKE_MS, then ENTER ORBIT. Stages: i18n `load.<stage>`.
const JOKE_MS = 500;
let loading = true, frac = 0, stage = "libs", joke = null;
const doneListeners = [];

function btn(){ return document.getElementById("startBtn"); }

function paint(){
  const b = btn();
  if(!b || !loading) return;
  b.classList.add("loading");
  b.classList.remove("waiting");
  b.style.setProperty("--load", (frac * 100).toFixed(1) + "%");
  if(joke !== null){ b.textContent = t("load.jokes")[joke]; return; }
  b.textContent = t("load." + stage) + "… " + Math.round(frac * 100) + "%";
}

export function isLoading(){ return loading; }

export function setLoad(f, stageKey){
  frac = Math.max(frac, Math.min(1, f));
  if(stageKey) stage = stageKey;
  paint();
}

// Everything's ready: a moment of a full bar and a joke, then the button
// becomes ENTER ORBIT again (its enabled state comes back through the
// listeners — ui/banner.js).
export async function loadDone(){
  joke = Math.floor(Math.random() * t("load.jokes").length);
  setLoad(1);
  await new Promise(function(resolve){ setTimeout(resolve, JOKE_MS); });
  loading = false;
  const b = btn();
  b.classList.remove("loading");
  b.style.removeProperty("--load");
  b.textContent = t("banner.start");
  doneListeners.splice(0).forEach(function(fn){ fn(); });
}

export function onLoadDone(fn){ if(loading) doneListeners.push(fn); else fn(); }

// Lets the browser paint (the bar) before the next blocking step.
export function nextPaint(){
  return new Promise(function(resolve){ requestAnimationFrame(function(){ setTimeout(resolve, 0); }); });
}

onLangChange(paint);
