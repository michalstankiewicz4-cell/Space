import { ctx } from "../core/context.js";
import { MAX_PLANETS, NET_PLANET_TOPUP_S } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import {
  materializePlanet, requestSpawnPlanet, spawnPlanetLocalOnly,
  despawnLocalOnly, applyHealthVisual, destroyPlanet, pendingSpawnCount
} from "../world/bodies.js";
import { materializeBlackHole } from "../world/blackholes.js";
import { refreshDock } from "../ui/dock.js";
import { triggerBreakup } from "../fx/breakup.js";
import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud.js";
import { isSteward } from "./presence.js";

// Buduje lokalny obiekt (planeta/kometa/... lub czarna dziura) z wiersza `bodies`.
export function materializeBody(row){
  if(ctx.netBodies[row.id]) return;
  const pos = new THREE.Vector3(row.pos_x, row.pos_y, row.pos_z);
  if(row.kind === "blackhole"){
    materializeBlackHole(row, pos);
    return;
  }
  const vel = (row.vel_x!=null) ? new THREE.Vector3(row.vel_x, row.vel_y, row.vel_z) : null;
  const elapsedSec = Math.max(0, (Date.now() - new Date(row.spawned_at).getTime())/1000);
  materializePlanet(row, pos, vel, elapsedSec);
}

export function onBodyUpdated(row){
  const obj = ctx.netBodies[row.id];
  if(!obj || row.kind === "blackhole") return;
  if(row.health != null){
    obj.health = Math.min(obj.health, row.health);
    applyHealthVisual(obj);
  }
}

export function onBodyDeleted(oldRow){
  const obj = ctx.netBodies[oldRow.id];
  if(!obj) return;
  delete ctx.netBodies[oldRow.id];
  if(oldRow.kind === "blackhole"){
    if(ctx.blackholes.indexOf(obj) === -1) return;
    ctx.scene.remove(obj.group);
    obj.core.geometry.dispose(); obj.core.material.dispose();
    obj.horizon.geometry.dispose(); obj.horizon.material.dispose();
    obj.disk.geometry.dispose(); obj.disk.material.dispose();
    obj.halo.material.dispose();
    ctx.blackholes.splice(ctx.blackholes.indexOf(obj), 1);
    return;
  }
  if(ctx.planets.indexOf(obj) === -1) return;
  if(oldRow.health != null && oldRow.health <= 0 && !obj.dying){
    // zjedzona przez kogos - wspolny wybuch dla wszystkich; punkty przyznaje
    // wylacznie klient ktory dostal killed:true z bite_body (patrz flushDamage)
    triggerBreakup(obj);
    destroyPlanet(obj);
    refreshDock();
  } else {
    // po prostu wyleciala poza pole (kometa) - bez punktow
    despawnLocalOnly(obj);
  }
}

export function flushDamage(){
  ctx.planets.forEach(function(p){
    if(p.pendingDamage > 0 && p.dbId){
      const amount = p.pendingDamage;
      p.pendingDamage = 0;
      supabase.rpc("bite_body", { p_body_id: p.dbId, p_amount: amount }).then(function(res){
        const row = res.data && res.data[0];
        if(!row) return;
        if(row.killed){
          const gained = Math.round(p.radius*14 + Math.abs(p.temp)*8 + (p.valueBonus||0));
          state.points += gained;
          state.eaten += 1;
          showToast("+"+gained+" pkt // planeta pochłonięta");
          save();
        } else {
          p.health = Math.min(p.health, row.health);
          applyHealthVisual(p);
        }
      }).catch(function(){ p.pendingDamage += amount; });
    }
  });
}

let topUpTimer = 0;
export function maintainPlanetCount(dt){
  topUpTimer -= dt;
  if(topUpTimer > 0) return;
  topUpTimer = NET_PLANET_TOPUP_S;
  if(ctx.planets.length + pendingSpawnCount >= MAX_PLANETS) return;
  if(NET_ENABLED){ if(isSteward) requestSpawnPlanet(); }
  else { spawnPlanetLocalOnly(); }
}

export function bootstrapWorld(){
  supabase.from("bodies").select("*").then(function(res){
    const rows = res.data || [];
    rows.forEach(materializeBody);
    if(rows.length === 0){
      supabase.rpc("claim_world_init").then(function(res2){
        if(res2.data === true){
          for(let i=0;i<MAX_PLANETS;i++) requestSpawnPlanet();
        }
      });
    }
  });
}
