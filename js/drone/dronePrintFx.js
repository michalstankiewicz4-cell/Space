import { ctx } from "../core/context.js";

// print(x)'s in-world visual (see drone.js's "print" builtin case, and
// net/shipsBroadcast.js for the multiplayer relay): a gas cloud puffs out
// from the drone's nose, a laser projects the text onto it — legible only
// while the gas is there to scatter it, like a real laser needs smoke/fog
// to show up at all — then the gas disperses and a bare laser beam (no
// text) lingers for a moment before fading out too.
const GAS_FADE_IN_END = 0.3;
const GAS_HOLD_END = 2.3;
const GAS_FADE_OUT_END = 3.0;
const LASER_FADE_IN_END = 0.15;
const LASER_FADE_OUT_END = 3.6;
const LASER_PEAK_OPACITY = 0.9;

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

function makeGasPuffs(nosePos){
  const tex = getGasTexture();
  const puffs = [];
  for(let i=0;i<5;i++){
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xaab2c4, transparent:true, opacity:0, depthWrite:false });
    const sprite = new THREE.Sprite(mat);
    const jitter = new THREE.Vector3((Math.random()-0.5)*0.5, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3);
    sprite.position.copy(nosePos).add(jitter);
    const scale = 0.5 + Math.random()*0.4;
    sprite.scale.set(scale, scale, 1);
    sprite.userData.baseScale = scale;
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

function makeLaserBeam(from, to, colorHex){
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, dir.length());
  const geo = new THREE.CylinderGeometry(0.012, 0.012, length, 6, 1, true);
  geo.translate(0, length/2, 0); // base at the origin, so positioning the mesh = positioning the beam's start
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  ctx.scene.add(mesh);
  return mesh;
}

const activeEffects = [];

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

  const puffs = makeGasPuffs(nose);
  const textSprite = makeTextSprite(text, colorHex);
  textSprite.position.copy(textPos);
  ctx.scene.add(textSprite);
  const laser = makeLaserBeam(nose, textPos, colorHex);

  activeEffects.push({ age: 0, puffs: puffs, textSprite: textSprite, laser: laser });
}

export function updateDronePrintFx(dt){
  for(let i=activeEffects.length-1; i>=0; i--){
    const fx = activeEffects[i];
    fx.age += dt;

    // Gas and text share one fade curve - the text is only legible while
    // the gas is actually there to show it on.
    const gasOpacity = fx.age < GAS_FADE_IN_END ? fx.age/GAS_FADE_IN_END
      : fx.age < GAS_HOLD_END ? 1
      : fx.age < GAS_FADE_OUT_END ? Math.max(0, 1 - (fx.age-GAS_HOLD_END)/(GAS_FADE_OUT_END-GAS_HOLD_END))
      : 0;
    fx.puffs.forEach(function(p){
      p.material.opacity = gasOpacity*0.55;
      const growth = 1 + Math.min(fx.age, GAS_FADE_OUT_END)*0.25;
      const s = p.userData.baseScale*growth;
      p.scale.set(s, s, 1);
    });
    fx.textSprite.material.opacity = gasOpacity;

    // The laser fades in fast, holds through the gas's full lifetime, then
    // lingers bare (no text, no gas) a little longer before it fades too.
    const laserOpacity = fx.age < LASER_FADE_IN_END ? LASER_PEAK_OPACITY*(fx.age/LASER_FADE_IN_END)
      : fx.age < GAS_FADE_OUT_END ? LASER_PEAK_OPACITY
      : fx.age < LASER_FADE_OUT_END ? Math.max(0, LASER_PEAK_OPACITY*(1-(fx.age-GAS_FADE_OUT_END)/(LASER_FADE_OUT_END-GAS_FADE_OUT_END)))
      : 0;
    fx.laser.material.opacity = laserOpacity;

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
