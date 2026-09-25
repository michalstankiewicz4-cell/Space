// Pictures for the Wiki (ui/windows/wiki.js): one small SVG per entry,
// drawn from its `art` spec in wikiEntries.js — no image files. Every
// gradient gets a unique id, since the same art can be on the page twice
// (list thumbnail + detail view) and SVG ids are document-wide.
import { SPECS, categoryOf } from "../../blocks/blockSpecs.js";
import { t } from "../../i18n.js";

let uid = 0;

const PLANETS = {
  ice:      { hi: "#f2fbff", mid: "#8fd0ff", lo: "#1f5e9e", bands: "#d9f2ff" },
  neutral:  { hi: "#d8f2c0", mid: "#6fb86a", lo: "#1f4f3a", bands: "#9fd6e6" },
  volcanic: { hi: "#ffc08a", mid: "#c2461c", lo: "#3a0e06", bands: "#ffb347" }
};
const ELEMENT_GROUP = {
  noble: ["#b07cb6", "#8a5693"], nonmetal: ["#0bd99a", "#049a6c"], alkaline: ["#ff9a6a", "#d0603a"],
  metalloid: ["#3aa8e0", "#1f7cb4"], metal: ["#8ea6fd", "#687fe6"], precious: ["#f8bb56", "#d38b37"]
};

function frame(inner){
  return '<svg viewBox="0 0 200 200" aria-hidden="true">' + inner + "</svg>";
}

// A lit sphere: radial highlight toward the upper left, dark limb.
function sphere(id, cx, cy, r, c){
  return '<defs><radialGradient id="' + id + '" cx=".35" cy=".3" r=".75">' +
    '<stop offset="0" stop-color="' + c.hi + '"/><stop offset=".45" stop-color="' + c.mid + '"/><stop offset="1" stop-color="' + c.lo + '"/>' +
    "</radialGradient></defs>" +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#' + id + ')"/>';
}

function planet(a){
  const c = PLANETS[a.variant], id = "wa" + (++uid);
  let out = sphere(id, 100, 100, 70, c);
  out += '<clipPath id="' + id + 'c"><circle cx="100" cy="100" r="70"/></clipPath><g clip-path="url(#' + id + 'c)">';
  if(a.variant === "ice"){
    out += '<ellipse cx="100" cy="34" rx="58" ry="14" fill="#ffffff" opacity=".85"/>' +
      '<ellipse cx="100" cy="168" rx="50" ry="11" fill="#ffffff" opacity=".7"/>' +
      '<path d="M30 92 Q100 80 170 96" stroke="' + c.bands + '" stroke-width="5" fill="none" opacity=".45"/>';
  } else if(a.variant === "neutral"){
    out += '<path d="M44 70 Q70 52 96 66 T150 60 L160 86 Q120 96 92 86 T40 96 Z" fill="#3f8f4f" opacity=".75"/>' +
      '<path d="M60 118 Q90 104 118 120 T170 122 L166 146 Q128 150 100 140 T54 146 Z" fill="#4c9a58" opacity=".7"/>' +
      '<path d="M30 100 Q100 88 170 104" stroke="' + c.bands + '" stroke-width="4" fill="none" opacity=".35"/>';
  } else {
    out += '<path d="M48 80 L78 96 L92 78 L120 102 L150 88" stroke="' + c.bands + '" stroke-width="3" fill="none" opacity=".9"/>' +
      '<path d="M56 128 L84 118 L104 136 L134 122 L152 138" stroke="#ff7a2f" stroke-width="2.5" fill="none" opacity=".85"/>' +
      '<circle cx="118" cy="104" r="5" fill="#ffd27a" opacity=".9"/>';
  }
  return frame(out + "</g>");
}

function sun(){
  const id = "wa" + (++uid);
  let rays = "";
  for(let i = 0; i < 12; i++){
    const ang = i * Math.PI / 6, x1 = 100 + Math.cos(ang) * 64, y1 = 100 + Math.sin(ang) * 64,
      x2 = 100 + Math.cos(ang) * (i % 2 ? 84 : 94), y2 = 100 + Math.sin(ang) * (i % 2 ? 84 : 94);
    rays += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#ffcf5a" stroke-width="3" stroke-linecap="round" opacity=".7"/>';
  }
  return frame('<defs><radialGradient id="' + id + 'g"><stop offset="0" stop-color="#ffd24a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd24a" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="100" cy="100" r="98" fill="url(#' + id + 'g)"/>' + rays +
    sphere(id, 100, 100, 58, { hi: "#fffbe0", mid: "#ffd21f", lo: "#e07a00" }));
}

function meteoroid(){
  const id = "wa" + (++uid);
  return frame('<defs><radialGradient id="' + id + '" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d9c2a3"/><stop offset=".5" stop-color="#8a735c"/><stop offset="1" stop-color="#3a2c22"/></radialGradient></defs>' +
    '<path d="M52 92 L70 56 L112 44 L150 64 L162 104 L140 146 L96 158 L60 134 Z" fill="url(#' + id + ')"/>' +
    '<circle cx="96" cy="84" r="12" fill="#5e4b3b" opacity=".7"/><circle cx="128" cy="118" r="8" fill="#5e4b3b" opacity=".7"/><circle cx="80" cy="126" r="6" fill="#5e4b3b" opacity=".6"/>');
}

function comet(){
  const id = "wa" + (++uid);
  return frame('<defs><linearGradient id="' + id + 't" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#bfe9ff" stop-opacity=".9"/><stop offset="1" stop-color="#4fa8ff" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="M136 136 L20 44 L44 20 Z" fill="url(#' + id + 't)"/>' +
    '<path d="M136 136 L30 70 L70 30 Z" fill="url(#' + id + 't)" opacity=".5"/>' +
    sphere(id, 140, 140, 18, { hi: "#ffffff", mid: "#bfe9ff", lo: "#4a78a6" }));
}

function blackhole(){
  const id = "wa" + (++uid);
  return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b06cff"/><stop offset=".5" stop-color="#ff9a3c"/><stop offset="1" stop-color="#b06cff"/></linearGradient>' +
    '<radialGradient id="' + id + 'h"><stop offset=".55" stop-color="#b06cff" stop-opacity=".45"/><stop offset="1" stop-color="#b06cff" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="100" cy="100" r="92" fill="url(#' + id + 'h)"/>' +
    '<ellipse cx="100" cy="104" rx="88" ry="26" fill="none" stroke="url(#' + id + ')" stroke-width="9" opacity=".9"/>' +
    '<circle cx="100" cy="100" r="44" fill="#000"/>' +
    '<path d="M12 104 A88 26 0 0 0 188 104" fill="none" stroke="url(#' + id + ')" stroke-width="9"/>');
}

function system(a){
  let out = "";
  for(let i = 1; i <= a.rings; i++){
    const r = 14 + i * (80 / a.rings);
    out += '<ellipse cx="100" cy="100" rx="' + r + '" ry="' + r * 0.62 + '" fill="none" stroke="#2f5cff" stroke-opacity=".55"/>';
  }
  for(let i = 0; i < a.dots; i++){
    const r = 14 + (i + 1) * (80 / Math.max(a.rings, a.dots)), ang = i * 2.1 + 0.6;
    out += '<circle cx="' + (100 + Math.cos(ang) * r).toFixed(1) + '" cy="' + (100 + Math.sin(ang) * r * 0.62).toFixed(1) + '" r="4" fill="' +
      ["#ff7a45", "#8fd88f", "#4fa8ff", "#c9a27a"][i % 4] + '"/>';
  }
  if(a.binary) out += '<circle cx="90" cy="100" r="11" fill="#ffd21f"/><circle cx="112" cy="100" r="7" fill="#ff8a5a"/>';
  else if(a.rift) out += '<circle cx="100" cy="100" r="12" fill="#000" stroke="#b06cff" stroke-width="3"/>';
  else out += '<circle cx="100" cy="100" r="12" fill="#ffd21f"/><circle cx="100" cy="100" r="18" fill="#ffd21f" opacity=".25"/>';
  return frame(out);
}

function element(a){
  const g = ELEMENT_GROUP[a.group], id = "wa" + (++uid);
  return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + g[0] + '"/><stop offset="1" stop-color="' + g[1] + '"/></linearGradient></defs>' +
    '<rect x="30" y="30" width="140" height="140" rx="14" fill="url(#' + id + ')"/>' +
    '<rect x="36" y="36" width="128" height="128" rx="10" fill="none" stroke="#fff" stroke-opacity=".35"/>' +
    '<text x="48" y="62" font-family="Oswald, sans-serif" font-size="20" fill="#0c1440">' + a.n + "</text>" +
    '<text x="100" y="128" text-anchor="middle" font-family="Antonio, Oswald, sans-serif" font-weight="700" font-size="64" fill="#0c1440">' + a.sym + "</text>");
}

function material(a){
  const gold = "#f8bb56", blue = "#8ea6fd", dark = "#0c1440";
  let out = "";
  if(a.shape === "plates"){
    out = '<rect x="40" y="110" width="120" height="22" rx="4" fill="' + blue + '"/><rect x="50" y="86" width="120" height="22" rx="4" fill="#a8b8ff"/><rect x="30" y="62" width="120" height="22" rx="4" fill="#cfd8ff"/>' +
      '<circle cx="42" cy="73" r="3" fill="' + dark + '"/><circle cx="138" cy="73" r="3" fill="' + dark + '"/>';
  } else if(a.shape === "glass"){
    out = '<path d="M54 40 L154 56 L146 166 L46 150 Z" fill="#9fe6ff" opacity=".35" stroke="#cfefff" stroke-width="3"/>' +
      '<path d="M72 62 L96 66 M68 84 L82 86" stroke="#fff" stroke-opacity=".8" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M120 130 L136 132" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>';
  } else if(a.shape === "tiles"){
    const tile = function(x, y, c){ return '<path d="M' + x + ' ' + (y - 24) + ' L' + (x + 21) + ' ' + (y - 12) + ' L' + (x + 21) + ' ' + (y + 12) + ' L' + x + ' ' + (y + 24) + ' L' + (x - 21) + ' ' + (y + 12) + ' L' + (x - 21) + ' ' + (y - 12) + ' Z" fill="' + c + '" stroke="' + dark + '" stroke-width="3"/>'; };
    out = tile(78, 76, "#e8e2d6") + tile(122, 76, "#d9d1c2") + tile(56, 114, "#cfc6b4") + tile(100, 114, "#f1ece2") + tile(144, 114, "#c9bfae") + tile(78, 152, "#ddd6c8") + tile(122, 152, "#e6dfd2") +
      '<path d="M100 96 L100 132" stroke="#ff7a45" stroke-width="3" opacity=".6"/>';
  } else if(a.shape === "fuel"){
    out = '<rect x="62" y="44" width="76" height="120" rx="14" fill="' + gold + '"/><rect x="84" y="30" width="32" height="18" rx="4" fill="#d38b37"/>' +
      '<rect x="74" y="80" width="52" height="50" rx="6" fill="' + dark + '"/><path d="M100 88 L88 108 L100 108 L94 124 L112 102 L100 102 Z" fill="' + gold + '"/>';
  } else if(a.shape === "fiber"){
    for(let i = 0; i < 6; i++){
      out += '<path d="M30 ' + (60 + i * 16) + ' Q100 ' + (40 + i * 16) + ' 170 ' + (60 + i * 16) + '" stroke="' + (i % 2 ? blue : "#b07cb6") + '" stroke-width="5" fill="none"/>';
    }
  } else {
    out = '<rect x="46" y="46" width="108" height="108" rx="10" fill="#0bd99a"/><rect x="74" y="74" width="52" height="52" rx="4" fill="' + dark + '"/>';
    for(let i = 0; i < 4; i++){
      const p = 58 + i * 28;
      out += '<line x1="' + p + '" y1="30" x2="' + p + '" y2="46" stroke="' + gold + '" stroke-width="5"/><line x1="' + p + '" y1="154" x2="' + p + '" y2="170" stroke="' + gold + '" stroke-width="5"/>';
    }
  }
  return frame(out);
}

// Real minerals and ores: a crystal habit per mineral, light/dark tone
// from `colors`.
function mineral(a){
  const id = "wa" + (++uid), lt = a.colors[0], dk = a.colors[1];
  const grad = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + lt + '"/><stop offset="1" stop-color="' + dk + '"/></linearGradient></defs>';
  const f = 'fill="url(#' + id + ')"';
  const edge = 'stroke="#fff" stroke-opacity=".4" fill="none"';
  let out = "";
  if(a.shape === "gem"){
    out = '<path d="M60 70 L100 34 L140 70 L128 150 L72 150 Z" ' + f + '/><path d="M60 70 L140 70 M100 34 L86 70 L100 150 L114 70 Z" ' + edge + '/>' +
      '<path d="M120 96 L150 80 L168 100 L154 146 L126 146 Z" ' + f + ' opacity=".8"/>';
  } else if(a.shape === "prism"){
    out = '<path d="M70 44 L118 36 L138 60 L130 164 L82 170 L62 146 Z" ' + f + '/><path d="M118 36 L110 166 M70 44 L90 60 L138 60" ' + edge + '/>';
  } else if(a.shape === "hexprism"){
    out = '<path d="M100 20 L126 50 L126 150 L100 180 L74 150 L74 50 Z" ' + f + ' opacity=".9"/><path d="M100 20 L100 180 M74 50 L126 50" ' + edge + '/>' +
      '<path d="M140 70 L156 88 L156 150 L140 168 L124 150 L124 88 Z" ' + f + ' opacity=".6"/>';
  } else if(a.shape === "hexplate"){
    out = '<path d="M100 36 L156 68 L156 132 L100 164 L44 132 L44 68 Z" ' + f + ' opacity=".85"/>' +
      '<path d="M100 36 L100 164 M44 68 L156 132 M156 68 L44 132" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>';
  } else if(a.shape === "etched"){
    out = '<rect x="40" y="40" width="120" height="120" rx="12" ' + f + '/>';
    for(let i = -2; i <= 3; i++){
      out += '<line x1="' + (40 + i * 24) + '" y1="160" x2="' + (100 + i * 24) + '" y2="40" stroke="#4a515c" stroke-width="3" opacity=".55"/>' +
        '<line x1="40" y1="' + (70 + i * 22) + '" x2="160" y2="' + (70 + i * 22) + '" stroke="#eef1f6" stroke-width="2" opacity=".35"/>';
    }
  } else if(a.shape === "nugget"){
    out = '<path d="M54 110 L64 70 L104 52 L146 70 L156 116 L124 150 L78 150 Z" ' + f + '/><path d="M64 70 L110 96 L146 70 M110 96 L124 150" ' + edge + '/>';
  } else if(a.shape === "spheres"){
    [[80, 90, 30], [128, 110, 24], [96, 140, 18], [138, 64, 14]].forEach(function(c){
      out += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" ' + f + '/>';
    });
  } else if(a.shape === "octa"){
    out = '<path d="M100 26 L162 100 L100 174 L38 100 Z" ' + f + '/><path d="M38 100 L162 100 M100 26 L118 100 L100 174" ' + edge + '/>';
  } else if(a.shape === "cube"){
    out = '<path d="M64 76 L104 56 L144 76 L144 128 L104 148 L64 128 Z" ' + f + '/><path d="M64 76 L104 96 L144 76 M104 96 L104 148" ' + edge + '/>';
  } else {
    for(let i = 0; i < 6; i++){
      out += '<path d="M44 ' + (60 + i * 16) + ' L150 ' + (48 + i * 16) + ' L160 ' + (60 + i * 16) + ' L54 ' + (72 + i * 16) + ' Z" ' + f + ' opacity="' + (0.6 + i * 0.07).toFixed(2) + '"/>';
    }
  }
  return frame(grad + out);
}

function building(a){
  const id = "wa" + (++uid);
  const metal = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd6e4"/><stop offset="1" stop-color="#5a6272"/></linearGradient></defs>';
  const f = 'fill="url(#' + id + ')"';
  let out = "";
  if(a.kind === "station"){
    out = '<ellipse cx="100" cy="104" rx="84" ry="30" fill="none" stroke="url(#' + id + ')" stroke-width="10"/>' +
      '<line x1="16" y1="104" x2="184" y2="104" stroke="#8a93a8" stroke-width="3"/>' +
      '<circle cx="100" cy="100" r="30" ' + f + '/><path d="M100 40 L108 72 L92 72 Z" ' + f + '/>' +
      '<ellipse cx="100" cy="104" rx="70" ry="22" fill="none" stroke="#4fe3c6" stroke-width="3" stroke-dasharray="3 6"/>';
  } else if(a.kind === "mine"){
    out = '<path d="M30 160 L60 120 L100 128 L140 112 L172 160 Z" fill="#6b5846"/>' +
      '<path d="M84 128 L100 44 L116 128 Z" fill="none" stroke="url(#' + id + ')" stroke-width="7"/>' +
      '<rect x="92" y="96" width="16" height="44" ' + f + '/><circle cx="100" cy="44" r="7" fill="#f8bb56"/>';
  } else if(a.kind === "refinery"){
    out = '<rect x="40" y="70" width="44" height="90" rx="20" ' + f + '/><rect x="96" y="54" width="44" height="106" rx="20" ' + f + '/>' +
      '<path d="M84 100 H96 M140 120 H164 V160" stroke="#f8bb56" stroke-width="6" fill="none"/><circle cx="118" cy="44" r="8" fill="#ff7a45" opacity=".8"/>';
  } else if(a.kind === "shipyard"){
    out = '<path d="M30 60 H170 M30 150 H170 M40 60 V150 M160 60 V150" stroke="url(#' + id + ')" stroke-width="8" fill="none"/>' +
      '<path d="M60 105 L130 90 L150 105 L130 120 Z" fill="#4fe3c6" opacity=".85"/>' +
      '<path d="M70 60 V90 M110 60 V88" stroke="#8a93a8" stroke-width="3"/>';
  } else {
    out = '<path d="M40 150 Q40 70 100 70 Q160 70 160 150 Z" ' + f + '/><rect x="30" y="148" width="140" height="14" rx="4" fill="#5a6272"/>' +
      '<path d="M100 70 V40" stroke="#8a93a8" stroke-width="4"/><path d="M78 34 Q100 18 122 34" stroke="#b07cb6" stroke-width="6" fill="none"/>' +
      '<rect x="84" y="112" width="32" height="36" rx="4" fill="#0c1440"/>';
  }
  return frame(metal + out);
}

function ship(a){
  const id = "wa" + (++uid);
  if(a.kind === "swarmer"){
    return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1fae95"/><stop offset="1" stop-color="#b9fff0"/></linearGradient></defs>' +
      '<path d="M30 100 L160 64 L176 100 L160 136 Z" fill="url(#' + id + ')"/><circle cx="36" cy="100" r="10" fill="#4fe3c6" opacity=".6"/>');
  }
  if(a.kind === "drone"){
    return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe0a0"/><stop offset="1" stop-color="#cf8a35"/></linearGradient></defs>' +
      '<path d="M100 28 L158 100 L100 172 L42 100 Z" fill="url(#' + id + ')"/><path d="M42 100 L158 100 M100 28 L118 100 L100 172" stroke="#7a4a12" stroke-opacity=".5" fill="none"/>');
  }
  if(a.kind === "codewing"){
    return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f6"/><stop offset="1" stop-color="#6a7282"/></linearGradient></defs>' +
      '<path d="M24 92 H140 L184 100 L140 108 H24 Z" fill="url(#' + id + ')"/><path d="M40 92 L60 62 H80 L70 92 Z M40 108 L60 138 H80 L70 108 Z" fill="#8a93a8"/>' +
      '<ellipse cx="96" cy="100" rx="10" ry="38" fill="none" stroke="#f8bb56" stroke-width="4"/><circle cx="120" cy="92" r="6" fill="#5f77f7"/>');
  }
  return frame('<path d="M24 100 L110 70 L180 100 L110 130 Z" fill="#d05b69"/><path d="M60 88 L150 100 L60 112 Z" fill="#ff9a3c"/>' +
    '<path d="M70 72 L50 40 L96 70 Z M70 128 L50 160 L96 130 Z" fill="#f8bb56"/>');
}

// Refined resources: an ingot, a faceted chunk, a sand heap or a drop.
function resource(a){
  const id = "wa" + (++uid), lt = a.colors[0], dk = a.colors[1];
  const grad = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + lt + '"/><stop offset="1" stop-color="' + dk + '"/></linearGradient></defs>';
  const f = 'fill="url(#' + id + ')"';
  let out = "";
  if(a.shape === "ingot"){
    out = '<path d="M34 138 L58 94 L166 94 L142 138 Z" ' + f + '/><path d="M34 138 L142 138 L142 150 L34 150 Z" fill="' + dk + '"/>' +
      '<path d="M142 138 L166 94 L166 106 L142 150 Z" fill="' + dk + '" opacity=".7"/>' +
      '<path d="M70 70 L92 46 L164 46 L142 70 Z" ' + f + ' opacity=".85"/><path d="M70 70 L142 70 L142 80 L70 80 Z" fill="' + dk + '" opacity=".85"/>' +
      '<path d="M64 102 L152 102" stroke="#fff" stroke-opacity=".45" stroke-width="3"/>';
  } else if(a.shape === "chunk"){
    out = '<path d="M50 120 L72 62 L128 48 L158 92 L140 146 L80 156 Z" ' + f + '/>' +
      '<path d="M72 62 L104 100 L128 48 M104 100 L158 92 M104 100 L80 156 M104 100 L50 120" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none"/>';
  } else if(a.shape === "sand"){
    out = '<path d="M26 150 Q100 40 174 150 Z" ' + f + '/>';
    for(let i = 0; i < 40; i++){
      const x = 40 + ((i * 37) % 120), y = 140 - ((i * 53) % 70) * (1 - Math.abs(x - 100) / 90);
      out += '<circle cx="' + x + '" cy="' + y.toFixed(1) + '" r="1.8" fill="#fff" opacity=".5"/>';
    }
  } else {
    out = '<path d="M100 34 C122 72 150 98 150 126 A50 50 0 0 1 50 126 C50 98 78 72 100 34 Z" ' + f + '/>' +
      '<path d="M72 124 A28 28 0 0 0 92 150" stroke="#fff" stroke-opacity=".7" stroke-width="5" fill="none" stroke-linecap="round"/>';
  }
  return frame(grad + out);
}

function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// A block's label with sample values in its slots (empty slots as "…").
function blockLabel(a){
  if(a.op === "define") return t("blocks.kind.proc") + " " + ((t("blocks.examples.spiral.names") || {}).side || "side");
  const sample = a.sample || {};
  return t("blocks.op." + a.op).replace(/\{(\w+)\}/g, function(m, k){
    const v = sample[k];
    if(v === undefined) return "…";
    return k === "op" && (v === "and" || v === "or") ? t("blocks.opt." + v) : String(v);
  });
}

function labelText(x, y, s, ink, max){
  const fit = s.length > 15 ? ' textLength="' + max + '" lengthAdjust="spacingAndGlyphs"' : "";
  return '<text x="' + x + '" y="' + y + '" font-family="Oswald, sans-serif" font-size="17" font-weight="500" fill="' + ink + '"' + fit + ">" + esc(s) + "</text>";
}

// Programming entries: the block itself, drawn in its category's colors
// (the same ones the block editor uses), or the SCRIPT/BLOCKS switch and
// a pair of files for the two feature entries.
function code(a){
  const id = "wa" + (++uid);
  if(a.special === "switch"){
    return frame('<rect x="22" y="80" width="156" height="40" rx="20" fill="#040a26" stroke="#3c55d8" stroke-width="2.5"/>' +
      '<path d="M100 82 H158 A18 18 0 0 1 158 118 H100 Z" fill="#f8bb56"/>' +
      labelText(36, 106, t("blocks.mode.script"), "#93a6ff", 56) + labelText(110, 106, t("blocks.mode.blocks"), "#241404", 56));
  }
  if(a.special === "files"){
    const file = function(y, c, name, star){
      return '<rect x="30" y="' + y + '" width="140" height="42" rx="6" fill="#040a26" stroke="' + (star ? "#f5bd5c" : "#1d36a0") + '" stroke-width="2"/>' +
        '<rect x="40" y="' + (y + 8) + '" width="10" height="26" rx="2" fill="' + c + '"/>' +
        labelText(60, y + 27, name, "#fff", 70) + (star ? '<text x="150" y="' + (y + 28) + '" font-size="18" fill="#f8bb56" text-anchor="middle">★</text>' : "");
    };
    return frame(file(40, "#f8bb56", "main", true) + file(90, "#2fc79a", t("blocks.newFile")(2), false) + file(140, "#e0607a", t("blocks.newFile")(3), false));
  }
  const spec = SPECS[a.op], c = categoryOf(spec.cat), shape = spec.shape;
  const grad = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.hi + '"/><stop offset=".45" stop-color="' + c.c + '"/><stop offset="1" stop-color="' + c.lo + '"/></linearGradient></defs>';
  const f = 'fill="url(#' + id + ')"', label = blockLabel(a);
  let out = "";
  if(shape === "c" || shape === "cc"){
    const elseRow = shape === "cc";
    out = '<path d="M20 42 H160 A20 20 0 0 1 160 82 H44 V' + (elseRow ? 98 : 128) + ' H20 Z" ' + f + '/>' +
      '<rect x="48" y="86" width="96" height="' + (elseRow ? 10 : 38) + '" rx="4" fill="#fff" opacity=".12"/>' +
      (elseRow ? '<path d="M20 98 H44 H150 A14 14 0 0 1 150 126 H44 V144 H20 Z" ' + f + '/><rect x="48" y="130" width="96" height="12" rx="4" fill="#fff" opacity=".12"/>' : "") +
      '<path d="M20 ' + (elseRow ? 144 : 128) + ' H44 V' + (elseRow ? 144 : 128) + ' H130 A12 12 0 0 1 130 ' + (elseRow ? 168 : 152) + ' H20 Z" ' + f + '/>' +
      labelText(32, 68, label, c.ink, 130) + (elseRow ? labelText(52, 118, t("blocks.op.else"), c.ink, 100) : "");
  } else if(shape === "bool"){
    out = '<path d="M34 76 H166 L186 100 L166 124 H34 L14 100 Z" ' + f + '/>' + labelText(38, 106, label, c.ink, 124);
  } else if(shape === "reporter"){
    out = '<rect x="22" y="78" width="156" height="44" rx="22" ' + f + '/>' + labelText(40, 106, label, c.ink, 120);
  } else {
    const hat = shape === "hat", cap = shape === "cap";
    out = '<path d="M' + (hat ? 40 : 26) + ' 76 H156 A24 24 0 0 1 156 124 H20 V' + (hat ? 96 : 82) + (hat ? " A20 20 0 0 1 40 76" : " A6 6 0 0 1 26 76") + ' Z" ' + f + '/>' +
      (cap ? "" : '<rect x="34" y="122" width="24" height="7" rx="3" fill="' + c.lo + '"/>') +
      labelText(32, 107, label, c.ink, 128);
  }
  return frame(grad + out);
}

// Artifacts humans left behind.
function artifact(a){
  const id = "wa" + (++uid);
  const gold = '<defs><radialGradient id="' + id + '" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".6" stop-color="#e0a93e"/><stop offset="1" stop-color="#8a5a18"/></radialGradient></defs>';
  if(a.kind === "statue"){
    return frame('<path d="M70 180 H130 L124 160 H76 Z" fill="#5d6b72"/>' +
      '<path d="M82 160 L90 92 Q100 82 110 92 L120 160 Z" fill="#5fae96"/><path d="M88 110 L78 150 L92 150 Z" fill="#4e9a83"/>' +
      '<circle cx="100" cy="78" r="11" fill="#6fc0a6"/>' +
      '<path d="M100 60 L100 67 M88 64 L91 70 M112 64 L109 70 M80 72 L87 75 M120 72 L113 75" stroke="#6fc0a6" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M108 96 L128 46" stroke="#5fae96" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M122 44 H136 L133 50 H125 Z" fill="#5fae96"/><path d="M129 42 Q121 30 129 18 Q137 30 129 42 Z" fill="#f8bb56"/>' +
      '<rect x="84" y="112" width="12" height="16" rx="2" fill="#4e9a83"/>');
  }
  if(a.kind === "disc"){
    let grooves = "";
    for(let r = 30; r <= 70; r += 8) grooves += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="#8a5a18" stroke-opacity=".45" stroke-width="1.2"/>';
    return frame(gold + '<circle cx="100" cy="100" r="76" fill="url(#' + id + ')"/>' + grooves +
      '<circle cx="100" cy="100" r="20" fill="#c9922e"/><circle cx="100" cy="100" r="4" fill="#0c1440"/>' +
      '<path d="M44 70 A62 62 0 0 1 80 40" stroke="#fff" stroke-opacity=".5" stroke-width="5" fill="none" stroke-linecap="round"/>');
  }
  if(a.kind === "plaque"){
    let rays = "";
    for(let i = 0; i < 14; i++){
      const ang = i / 14 * Math.PI * 2, len = 14 + (i * 7) % 16;
      rays += '<line x1="62" y1="126" x2="' + (62 + Math.cos(ang) * len).toFixed(1) + '" y2="' + (126 + Math.sin(ang) * len).toFixed(1) + '" stroke="#6b4a14" stroke-width="1.3"/>';
    }
    return frame(gold + '<rect x="30" y="44" width="140" height="112" rx="8" fill="url(#' + id + ')"/>' + rays +
      '<circle cx="120" cy="76" r="5" fill="none" stroke="#6b4a14" stroke-width="2"/><path d="M120 81 V110 M112 92 H128 M120 110 L113 128 M120 110 L127 128" stroke="#6b4a14" stroke-width="2.5" fill="none"/>' +
      '<circle cx="146" cy="80" r="4.5" fill="none" stroke="#6b4a14" stroke-width="2"/><path d="M146 85 V110 M140 96 H152 M146 110 L141 128 M146 110 L151 128" stroke="#6b4a14" stroke-width="2.5" fill="none"/>' +
      '<path d="M36 146 H164" stroke="#6b4a14" stroke-width="1.5"/>');
  }
  if(a.kind === "flag"){
    return frame('<path d="M14 160 Q60 146 100 152 T186 150 V186 H14 Z" fill="#8a8f99"/><ellipse cx="146" cy="166" rx="22" ry="6" fill="#5f646e"/>' +
      '<line x1="80" y1="156" x2="80" y2="44" stroke="#d8dde6" stroke-width="4"/><line x1="80" y1="48" x2="138" y2="48" stroke="#d8dde6" stroke-width="3"/>' +
      '<path d="M80 50 H136 V90 H80 Z" fill="#f4f1ea"/><path d="M80 58 H136 M80 66 H136 M80 74 H136 M80 82 H136" stroke="#e6dfd2" stroke-width="3"/>' +
      '<rect x="80" y="50" width="24" height="20" fill="#e3e7ee"/>');
  }
  if(a.kind === "stone"){
    let lines = "";
    for(let i = 0; i < 4; i++) lines += '<path d="M56 ' + (58 + i * 9) + ' h14 m6 0 h10 m5 0 h16 m4 0 h12" stroke="#9aa0aa" stroke-width="3"/>';
    for(let i = 0; i < 4; i++) lines += '<path d="M54 ' + (104 + i * 8) + ' q8 -5 16 0 t16 0 t16 0 t16 0" stroke="#9aa0aa" stroke-width="2" fill="none"/>';
    for(let i = 0; i < 4; i++) lines += '<path d="M54 ' + (144 + i * 7) + ' H146" stroke="#9aa0aa" stroke-width="2" stroke-dasharray="4 2"/>';
    return frame('<path d="M44 34 L150 30 L160 184 L40 184 Z" fill="#3b3f47"/><path d="M44 34 L150 30 L154 60 L44 62 Z" fill="#4a4f59"/>' + lines);
  }
  return frame('<path d="M0 170 L70 60 L110 110 L140 80 L200 170 Z" fill="#dfe8f2"/><path d="M70 60 L90 90 L78 92 Z M140 80 L152 100 L136 98 Z" fill="#fff"/>' +
    '<path d="M86 170 L100 118 L130 118 L116 170 Z" fill="#6b7482"/><path d="M100 118 L130 118 L124 136 L104 136 Z" fill="#4fe3c6" opacity=".85"/>' +
    '<path d="M0 170 H200 V186 H0 Z" fill="#c9d6e4"/>');
}

// Life forms: real space-hardy organisms, and the story's machine "life".
function life(a){
  const id = "wa" + (++uid);
  if(a.kind === "tardigrade"){
    let legs = "";
    [58, 84, 110, 136].forEach(function(x){ legs += '<path d="M' + x + ' 128 q-4 16 -10 20 M' + (x + 8) + ' 128 q2 16 6 20" stroke="#c98f7a" stroke-width="6" stroke-linecap="round" fill="none"/>'; });
    return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3cdb8"/><stop offset="1" stop-color="#c98f7a"/></linearGradient></defs>' + legs +
      '<path d="M40 110 Q40 70 100 70 Q164 70 166 108 Q166 134 100 134 Q40 134 40 110 Z" fill="url(#' + id + ')"/>' +
      '<path d="M76 74 Q72 100 76 132 M104 70 Q100 100 104 134 M132 72 Q128 100 132 132" stroke="#b07a66" stroke-width="2" fill="none" opacity=".6"/>' +
      '<circle cx="152" cy="98" r="3" fill="#3a1f18"/><path d="M164 106 q6 2 8 6" stroke="#b07a66" stroke-width="3" fill="none"/>');
  }
  if(a.kind === "bacteria"){
    const cell = function(x, y){ return '<circle cx="' + x + '" cy="' + y + '" r="30" fill="url(#' + id + ')"/><circle cx="' + (x - 8) + '" cy="' + (y - 10) + '" r="7" fill="#fff" opacity=".35"/>'; };
    return frame('<defs><radialGradient id="' + id + '" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffc7a0"/><stop offset=".6" stop-color="#ff8a5c"/><stop offset="1" stop-color="#b8452a"/></radialGradient></defs>' +
      cell(72, 72) + cell(128, 72) + cell(72, 128) + cell(128, 128));
  }
  if(a.kind === "lichen"){
    return frame('<path d="M20 150 Q30 70 100 60 Q176 58 182 150 Z" fill="#6e737c"/><path d="M40 140 Q54 96 96 92" stroke="#5a5f68" stroke-width="3" fill="none"/>' +
      '<path d="M58 118 q10 -14 24 -6 q12 -12 22 2 q10 8 -2 16 q-14 10 -28 4 q-18 2 -16 -16 Z" fill="#f28c28"/>' +
      '<path d="M116 96 q10 -10 22 -2 q10 10 -2 18 q-14 6 -22 -4 Z" fill="#f5b83d"/><path d="M122 132 q8 -8 18 -2 q6 8 -4 12 q-10 2 -14 -10 Z" fill="#e8742a"/>' +
      '<circle cx="76" cy="118" r="3" fill="#ffd27a"/><circle cx="128" cy="100" r="2.5" fill="#ffe29a"/>');
  }
  if(a.kind === "fungus"){
    let blobs = "";
    [[70, 80, 26], [118, 70, 20], [132, 118, 30], [78, 132, 22], [100, 104, 14]].forEach(function(b){
      blobs += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="#15131a"/><circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + (b[2] * 0.6) + '" fill="#2a2432"/>';
    });
    return frame('<rect x="24" y="24" width="152" height="152" rx="10" fill="#8a8578"/>' + blobs +
      '<g opacity=".55" fill="#f8bb56"><path d="M100 100 L86 76 A28 28 0 0 1 114 76 Z"/><path d="M100 100 L128 100 A28 28 0 0 1 114 124 Z"/><path d="M100 100 L86 124 A28 28 0 0 1 72 100 Z"/></g>');
  }
  if(a.kind === "probe"){
    const bot = function(x, y, s, o){
      return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')" opacity="' + o + '">' +
        '<path d="M0 -26 L22 -13 L22 13 L0 26 L-22 13 L-22 -13 Z" fill="#8ea6fd" stroke="#3a50d2" stroke-width="3"/>' +
        '<circle r="8" fill="#4fe3c6"/><path d="M22 0 H44 M-22 0 H-44 M11 22 L22 42 M-11 22 L-22 42" stroke="#c7d0ff" stroke-width="4" stroke-linecap="round"/></g>';
    };
    return frame(bot(86, 92, 1.3, 1) + bot(150, 146, 0.7, 0.75) + '<path d="M114 118 L136 134" stroke="#4fe3c6" stroke-width="2" stroke-dasharray="4 4"/>');
  }
  return frame('<rect x="40" y="150" width="120" height="10" rx="3" fill="#5a4636"/><path d="M120 150 V112" stroke="#3f8f4a" stroke-width="4"/>' +
    '<path d="M120 124 q-18 -8 -22 -24 q18 2 22 24 Z M120 118 q16 -10 26 -26 q-2 22 -26 26 Z" fill="#5fcf6e"/>' +
    '<rect x="44" y="86" width="44" height="40" rx="8" fill="#8ea6fd"/><rect x="52" y="96" width="28" height="12" rx="4" fill="#0c1440"/>' +
    '<circle cx="60" cy="102" r="3" fill="#4fe3c6"/><circle cx="72" cy="102" r="3" fill="#4fe3c6"/>' +
    '<rect x="50" y="126" width="32" height="18" rx="4" fill="#687fe6"/><circle cx="56" cy="148" r="5" fill="#3a50d2"/><circle cx="76" cy="148" r="5" fill="#3a50d2"/>' +
    '<path d="M88 104 L104 94" stroke="#8ea6fd" stroke-width="6" stroke-linecap="round"/><path d="M100 88 h14 l6 8 h-18 Z" fill="#f8bb56"/>' +
    '<path d="M118 98 q2 6 0 10 M112 100 q0 6 -2 9" stroke="#8fd0ff" stroke-width="2" fill="none"/>');
}

// Story fragments: a small terminal screen with the log number.
function story(a){
  let scan = "";
  for(let y = 44; y < 158; y += 6) scan += '<line x1="30" y1="' + y + '" x2="170" y2="' + y + '" stroke="#4fe3c6" stroke-opacity=".06"/>';
  const bars = a.corrupt ? '<rect x="44" y="130" width="46" height="10" fill="#4fe3c6" opacity=".7"/><rect x="96" y="130" width="60" height="10" fill="#4fe3c6" opacity=".4"/>'
    : '<rect x="44" y="132" width="90" height="4" rx="2" fill="#4fe3c6" opacity=".45"/><rect x="44" y="142" width="60" height="4" rx="2" fill="#4fe3c6" opacity=".3"/>';
  return frame('<rect x="22" y="32" width="156" height="136" rx="12" fill="#02100e" stroke="#1f8f7a" stroke-width="3"/>' + scan +
    '<text x="44" y="62" font-family="IBM Plex Mono, Courier New, monospace" font-size="15" fill="#4fe3c6">LOG ' + (a.n < 10 ? "0" : "") + a.n + "</text>" +
    '<text x="100" y="116" text-anchor="middle" font-size="42">' + a.glyph + "</text>" + bars);
}

function tech(a){
  const id = "wa" + (++uid);
  return frame('<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffda92"/><stop offset="1" stop-color="#d38b37"/></linearGradient></defs>' +
    '<circle cx="100" cy="100" r="74" fill="#040a26" stroke="url(#' + id + ')" stroke-width="8"/>' +
    '<circle cx="100" cy="100" r="60" fill="none" stroke="#3c55d8" stroke-width="2"/>' +
    '<text x="100" y="124" text-anchor="middle" font-size="64">' + a.icon + "</text>");
}

function race(a){
  if(a.race === "swarm"){
    return frame('<path d="M62 32 L14 100 L62 168 M138 32 L186 100 L138 168" fill="none" stroke="url(#gLogoGold)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="66" r="15" fill="url(#gLogoBlue)"/><circle cx="76" cy="126" r="15" fill="url(#gLogoBlue)"/><circle cx="124" cy="126" r="15" fill="url(#gLogoBlue)"/>');
  }
  if(a.race === "blade"){
    return frame('<path d="M100 18 L128 96 L100 182 L72 96 Z" fill="#d05b69"/><path d="M100 18 L112 96 L100 150 L88 96 Z" fill="#ff9a3c"/>' +
      '<path d="M40 70 L100 104 L160 70 L150 92 L100 124 L50 92 Z" fill="#f8bb56"/>');
  }
  return frame('<circle cx="100" cy="100" r="64" fill="none" stroke="#5f6fb8" stroke-width="6" stroke-dasharray="12 10"/><circle cx="100" cy="100" r="22" fill="#5f6fb8"/>');
}

const DRAW = { planet: planet, sun: sun, meteoroid: meteoroid, comet: comet, blackhole: blackhole,
  system: system, element: element, mineral: mineral, material: material,
  building: building, ship: ship, tech: tech, race: race, resource: resource, code: code,
  artifact: artifact, life: life, story: story };

export function wikiArt(art){
  return DRAW[art.type](art);
}
