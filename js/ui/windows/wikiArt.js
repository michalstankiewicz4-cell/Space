// Pictures for the Wiki (ui/windows/wiki.js): one small SVG per entry,
// drawn from its `art` spec in wikiEntries.js — no image files. Every
// gradient gets a unique id, since the same art can be on the page twice
// (list thumbnail + detail view) and SVG ids are document-wide.
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
  building: building, ship: ship, tech: tech, race: race };

export function wikiArt(art){
  return DRAW[art.type](art);
}
