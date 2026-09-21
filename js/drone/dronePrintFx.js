import { ctx } from "../core/context.js";

// print(x)'s in-world visual (see drone.js's "print" builtin case, and
// net/shipsBroadcast.js for the multiplayer relay): a gas cloud sprays out
// from the drone's nose to the size of the text over GAS_GROW_END seconds,
// a laser projects the text onto it — legible only while the gas is there
// to scatter it, like a real laser needs smoke/fog to show up at all —
// then the gas disperses and a bare laser beam (no text) lingers for a
// moment before fading out too. The laser's tip sweeps left-to-right
// across the text, CRT-scanline style, the whole time it's visible.
const GAS_GROW_END = 1.5;
const GAS_HOLD_END = 2.3;
const GAS_FADE_OUT_END = 3.0;
const LASER_FADE_IN_END = 0.15;
const LASER_FADE_OUT_END = 3.6;
const LASER_PEAK_OPACITY = 0.9;
const SWEEP_PERIOD = 0.15; // one fast left->right pass, snap back, repeat

function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }

let gasTexture = null;
function getGasTexture(){
  if(gasTexture) return gasTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const c2d = canvas.getContext("2d");
  const grad = c2d.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  c2d.fillStyle = grad;
  c2d.fillRect(0, 0, size, size);
  gasTexture = new THREE.CanvasTexture(canvas);
  return gasTexture;
}

// Each puff animates from a tight jitter around the nose (where the gas
// is "released from") out to a spread sized to the text sprite's own
// world width/height (where the gas needs to reach to back the text) —
// see updateDronePrintFx's use of puff.userData.from/to.
function makeGasPuffs(nosePos, textPos, textWidth, textHeight){
  const tex = getGasTexture();
  const puffs = [];
  for(let i=0;i<6;i++){
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xaab2c4, transparent:true, opacity:0, depthWrite:false });
    const sprite = new THREE.Sprite(mat);
    const startJitter = new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2);
    const endJitter = new THREE.Vector3((Math.random()-0.5)*textWidth*0.9, (Math.random()-0.5)*textHeight*1.6, (Math.random()-0.5)*0.25);
    sprite.userData.from = nosePos.clone().add(startJitter);
    sprite.userData.to = textPos.clone().add(endJitter);
    sprite.position.copy(sprite.userData.from);
    sprite.userData.scaleStart = 0.15 + Math.random()*0.1;
    sprite.userData.scaleEnd = textHeight*(0.7 + Math.random()*0.4);
    sprite.scale.set(sprite.userData.scaleStart, sprite.userData.scaleStart, 1);
    ctx.scene.add(sprite);
    puffs.push(sprite);
  }
  return puffs;
}

function makeTextSprite(text, colorHex){
  const fontSize = 72;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "bold " + fontSize + "px 'Courier New', monospace";
  const textWidth = Math.ceil(measure.measureText(text).width);

  const padX = 28, padY = 20;
  const canvas = document.createElement("canvas");
  canvas.width = textWidth + padX*2;
  canvas.height = fontSize + padY*2;
  const c2d = canvas.getContext("2d");
  c2d.font = "bold " + fontSize + "px 'Courier New', monospace";
  c2d.textBaseline = "middle";
  c2d.textAlign = "center";
  const colorCss = "#" + colorHex.toString(16).padStart(6, "0");
  c2d.shadowColor = colorCss;
  c2d.shadowBlur = 22;
  c2d.fillStyle = colorCss;
  c2d.fillText(text, canvas.width/2, canvas.height/2);
  c2d.fillText(text, canvas.width/2, canvas.height/2); // second pass thickens the glow

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent:true, depthWrite:false, blending: THREE.AdditiveBlending, opacity:0 });
  const sprite = new THREE.Sprite(mat);
  const worldHeight = 0.55;
  sprite.scale.set(worldHeight * (canvas.width/canvas.height), worldHeight, 1);
  return sprite;
}

// A unit-length beam along +Y, repositioned/rescaled/reoriented every
// frame in updateDronePrintFx instead of rebuilding geometry each time —
// its tip needs to move every frame for the left-right sweep.
function makeLaserBeam(colorHex){
  const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
  geo.translate(0, 0.5, 0); // base at the origin
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
  const mesh = new THREE.Mesh(geo, mat);
  ctx.scene.add(mesh);
  return mesh;
}

function aimBeam(mesh, from, to){
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, dir.length());
  mesh.position.copy(from);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
}

const activeEffects = [];
const UP = new THREE.Vector3(0,1,0);

// originPos/heading: the drone's own state at the moment print() ran (a
// snapshot, not a live reference - the effect doesn't track the drone
// around afterward). colorHex ties it to whoever's drone it is: the
// drone's own material color locally, the ghost drone's owner-tinted
// color for a remote one (see net/shipsBroadcast.js).
export function spawnPrintEffect(originPos, heading, text, colorHex){
  if(!text) return;
  const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const nose = originPos.clone().addScaledVector(fwd, 0.5);
  const textPos = originPos.clone().addScaledVector(fwd, 1.6).add(new THREE.Vector3(0, 0.35, 0));

  const textSprite = makeTextSprite(text, colorHex);
  textSprite.position.copy(textPos);
  ctx.scene.add(textSprite);

  const puffs = makeGasPuffs(nose, textPos, textSprite.scale.x, textSprite.scale.y);
  const laser = makeLaserBeam(colorHex);

  activeEffects.push({
    age: 0, nose: nose, textPos: textPos,
    textHalfWidth: textSprite.scale.x/2,
    puffs: puffs, textSprite: textSprite, laser: laser
  });
}

export function updateDronePrintFx(dt){
  const rightVec = new THREE.Vector3();
  for(let i=activeEffects.length-1; i>=0; i--){
    const fx = activeEffects[i];
    fx.age += dt;

    // Gas sprays from the nose out to the text's size/position over
    // GAS_GROW_END seconds (eased so it billows rather than snapping into
    // place), holds fully formed, then disperses.
    const growT = easeOutCubic(Math.min(1, fx.age/GAS_GROW_END));
    const gasOpacity = fx.age < GAS_GROW_END ? growT
      : fx.age < GAS_HOLD_END ? 1
      : fx.age < GAS_FADE_OUT_END ? Math.max(0, 1 - (fx.age-GAS_HOLD_END)/(GAS_FADE_OUT_END-GAS_HOLD_END))
      : 0;
    fx.puffs.forEach(function(p){
      p.material.opacity = gasOpacity*0.55;
      p.position.lerpVectors(p.userData.from, p.userData.to, growT);
      const s = p.userData.scaleStart + (p.userData.scaleEnd-p.userData.scaleStart)*growT;
      p.scale.set(s, s, 1);
    });
    // Text is only legible once the gas has (mostly) reached its full
    // spread - it fades in over the back half of the grow phase instead
    // of the whole thing, so it doesn't show through a still-tiny puff.
    const textOpacity = fx.age < GAS_GROW_END ? Math.max(0, (growT-0.5)*2)
      : gasOpacity;
    fx.textSprite.material.opacity = textOpacity;

    // The laser fades in fast, holds through the gas's full lifetime, then
    // lingers bare (no text, no gas) a little longer before it fades too.
    const laserOpacity = fx.age < LASER_FADE_IN_END ? LASER_PEAK_OPACITY*(fx.age/LASER_FADE_IN_END)
      : fx.age < GAS_FADE_OUT_END ? LASER_PEAK_OPACITY
      : fx.age < LASER_FADE_OUT_END ? Math.max(0, LASER_PEAK_OPACITY*(1-(fx.age-GAS_FADE_OUT_END)/(LASER_FADE_OUT_END-GAS_FADE_OUT_END)))
      : 0;
    fx.laser.material.opacity = laserOpacity;

    // CRT-style sweep: the beam's tip races left->right across the text
    // width, snapping back to the left edge each pass, for as long as the
    // laser itself is visible. Measured in camera-space "right" so it
    // always tracks the text sprite's actual (billboarded) left/right
    // edges regardless of the current camera angle.
    rightVec.setFromMatrixColumn(ctx.camera.matrixWorld, 0).normalize();
    const sweepT = (fx.age % SWEEP_PERIOD) / SWEEP_PERIOD;
    const tip = fx.textPos.clone().addScaledVector(rightVec, (sweepT*2-1)*fx.textHalfWidth);
    aimBeam(fx.laser, fx.nose, tip);

    if(fx.age >= LASER_FADE_OUT_END){
      fx.puffs.forEach(function(p){ ctx.scene.remove(p); p.material.dispose(); });
      ctx.scene.remove(fx.textSprite);
      fx.textSprite.material.map.dispose();
      fx.textSprite.material.dispose();
      ctx.scene.remove(fx.laser);
      fx.laser.geometry.dispose();
      fx.laser.material.dispose();
      activeEffects.splice(i, 1);
    }
  }
}
