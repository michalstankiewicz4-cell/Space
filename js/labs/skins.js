// The skins lab's own script (skins.html): its scene and panels, wired to the kits'
// public APIs. Moved out of the page (2026-10-03) so the page is markup and styles.
(function(){
  // ---------- stage scale, like the game (1536x1024 design surface) ----------
  const stageEl = document.getElementById("stage");
  function fitStage(){
    const s = Math.min(window.innerWidth / 1536, window.innerHeight / 1024);
    document.documentElement.style.setProperty("--uiScale", s);
    stageEl.style.left = "50%";
  }
  window.addEventListener("resize", fitStage); fitStage();

  // ---------- skins ----------
  const SKINS = {
    term: { logoA: ["#b6ffcc", "#39ff7a"], logoB: ["#39ff7a", "#1f9b48"], filter: "url(#phosphor)" },
    syn:  { logoA: ["#ffb45c", "#ff6ac1"], logoB: ["#5ee7ff", "#b58cff"], filter: "" }
  };
  let skin = "term";
  try{ skin = localStorage.getItem("roj-skinlab") || "term"; }catch(e){}
  function setSkin(s){
    skin = SKINS[s] ? s : "term";
    document.body.dataset.skin = skin;
    const k = SKINS[skin];
    document.querySelector(".lgA0").setAttribute("stop-color", k.logoA[0]); document.querySelector(".lgA1").setAttribute("stop-color", k.logoA[1]);
    document.querySelector(".lgB0").setAttribute("stop-color", k.logoB[0]); document.querySelector(".lgB1").setAttribute("stop-color", k.logoB[1]);
    document.getElementById("logoG").setAttribute("filter", k.filter);
    document.querySelectorAll("#skinSwitch button[data-s]").forEach(function(b){ paintSwitch(b, b.dataset.s === skin); });
    paintSwitch(document.getElementById("crtBtn"), document.body.dataset.crt === "on");
    document.getElementById("crtBtn").style.display = skin === "term" ? "" : "none";
    renderText();
    try{ localStorage.setItem("roj-skinlab", skin); }catch(e){}
  }
  function paintSwitch(b, on){
    const term = skin === "term";
    b.style.fontFamily = term ? "'IBM Plex Mono',monospace" : "'Oswald',sans-serif";
    b.style.background = on ? (term ? "#39ff7a" : "linear-gradient(90deg,#ff6ac1,#ffb45c)") : (term ? "#010502" : "#1d2033");
    b.style.color = on ? "#0b0c10" : (term ? "#39ff7a" : "#e6e8f2");
    b.style.border = "1px solid " + (term ? "#1f9b48" : "#2a2e48");
  }
  document.querySelectorAll("#skinSwitch button[data-s]").forEach(function(b){ b.addEventListener("click", function(){ setSkin(b.dataset.s); }); });
  document.getElementById("crtBtn").addEventListener("click", toggleCrt);
  function toggleCrt(){ document.body.dataset.crt = document.body.dataset.crt === "on" ? "off" : "on"; setSkin(skin); }
  window.addEventListener("keydown", function(e){
    if(e.key === "1") setSkin("term"); else if(e.key === "2") setSkin("syn"); else if(e.key.toLowerCase() === "c") toggleCrt();
  });

  // ---------- sample data ----------
  const NAV = [["FLEET", "fleet", "#5ee7ff"], ["PLANETS", "bodies", "#7ef29a"], ["RESEARCH", "research", "#b58cff"], ["BUILD", "build", "#6c7399", true],
    ["DIPLOMACY", "players", "#ffb45c"], ["WIKI", "wiki", "#ff6ac1"], ["SETTINGS", "setup", "#6c7399"]];
  const FLEET = [["Ship 1", "Idle", "idle"], ["Ship 2", "Program", "program"], ["Ship 3", "En route → TERRA-1", "enRoute"],
    ["Ship 4", "Feeding · MAGMA", "feeding"], ["DRONE", "Running · fuel 72%", "drone"]];
  const LOG = [["13:42", "Order: 3 units on course", ""], ["13:41", "Black hole detected in the sector", "alert"],
    ["13:40", "Memory fragment recovered: Reboot", ""], ["13:39", "New Wiki entry: Neutral planet", ""], ["13:38", "Commander Chronicler entered orbit", ""]];
  const CMDS = [["ATTACK", "attack", "target"], ["MOVE", "move", "move"], ["FORM UP", "formUp", "formup"], ["DEFEND", "defend", "shield"], ["SCAN", "scan", "scan"], ["CLOAK", "cloak", "cloak"]];
  const ICONS = {
    target: '<circle cx="12" cy="12" r="8" stroke-width="1.6"/><path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" stroke-width="1.6" stroke-linecap="round"/>',
    move: '<path d="M12 3v18M5 10l7-7 7 7" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    formup: '<circle cx="12" cy="5" r="2.5" stroke-width="1.6"/><circle cx="5" cy="18" r="2.5" stroke-width="1.6"/><circle cx="19" cy="18" r="2.5" stroke-width="1.6"/><path d="M11 7l-5 9M13 7l5 9" stroke-width="1.4"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" stroke-width="1.6" fill="none"/>',
    scan: '<circle cx="12" cy="12" r="9" stroke-width="1.4"/><circle cx="12" cy="12" r="5" stroke-width="1.4"/><circle cx="12" cy="12" r="1.8" stroke-width="1.4"/>',
    cloak: '<circle cx="12" cy="12" r="9" stroke-width="1.4" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3" stroke-width="1.6"/>'
  };
  const CMD_COLORS = ["#ff6ac1", "#5ee7ff", "#b58cff", "#7ef29a", "#ffb45c", "#6c7399"];

  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  // texts that differ per skin are rebuilt on a switch
  function renderText(){
    const term = skin === "term";
    document.getElementById("navList").innerHTML = NAV.map(function(n, i){
      return term
        ? '<div class="navItem glow' + (i === 0 ? " on" : "") + (n[3] ? " dim" : "") + '">' + esc(n[0]) + (n[3] ? " (off)" : "") + '</div>'
        : '<div class="navItem' + (i === 0 ? " on" : "") + (n[3] ? " dim" : "") + '"><span class="gutter">' + (i + 1) + '</span><span class="dot" style="background:' + n[2] + '"></span><span>' + esc(n[1]) + '<span class="ext">.' + (i === 0 ? "swarm" : "view") + '</span></span></div>';
    }).join("");
    document.getElementById("fleetList").innerHTML = FLEET.map(function(f, i){
      const on = i === 1 ? " on" : "";
      if(term){
        const ico = f[2] === "drone" ? "◆" : ">";
        return '<div class="fleetCard' + on + '"><span class="ico glow">' + ico + '</span><div><span class="glow">' + esc(f[0]) + '</span><small>' + esc(f[1]) + '</small></div></div>';
      }
      const col = { idle: "var(--com)", program: "var(--type)", enRoute: "var(--fn)", feeding: "var(--num)", drone: "var(--kw)" }[f[2]];
      return '<div class="fleetCard' + on + '"><span class="gutter">' + (i + 1) + '</span><span style="width:10px;height:10px;border-radius:3px;background:' + col + ';box-shadow:0 0 8px ' + col + '"></span><div><span>' + esc(f[0]) + '</span><small><span style="color:' + col + '">' + f[2] + '</span> · ' + esc(f[1]) + '</small></div></div>';
    }).join("");
    const bars = [["Speed", "speed", 0.6, false], ["Bite", "bite", 0.35, true], ["Heat", "heat", 0.2, true]];
    document.getElementById("unitBars").innerHTML = bars.map(function(b){
      return term
        ? '<div class="row"><span style="width:64px">' + b[0] + '</span><div class="seg"><i style="width:' + (b[2] * 100) + '%"></i></div><span>L' + Math.round(b[2] * 5) + '</span></div>'
        : '<div class="row" style="align-items:center"><span class="ty" style="width:48px">' + b[1] + '</span><div class="bar' + (b[3] ? " hot" : "") + '"><i style="width:' + (b[2] * 100) + '%"></i></div><span class="num" style="width:22px;text-align:right">' + Math.round(b[2] * 5) + '</span></div>';
    }).join("");
    const rows = [["status", "Program", "str"], ["target", "—", "com"], ["speed", "1.0", "num"], ["bite/s", "5.5", "num"]];
    document.getElementById("unitRows").innerHTML = rows.map(function(r){
      return term
        ? '<div class="row"><span>' + r[0].toUpperCase() + '</span><b class="val" style="font-weight:400">' + esc(r[1]) + '</b></div>'
        : '<div class="row"><span><span class="kw">let</span> ' + esc(r[0]) + ' <span class="com">=</span></span><span class="' + r[2] + '">' + (r[2] === "str" ? '"' + esc(r[1]) + '"' : esc(r[1])) + '</span></div>';
    }).join("");
    const irows = [["health", 0.84, "42 / 50"], ["radius", null, "4.75"], ["spin", null, "8.6°/s"]];
    document.getElementById("infoRows").innerHTML = irows.map(function(r){
      if(term) return '<div class="row"><span style="width:64px">' + r[0].toUpperCase() + '</span>' + (r[1] != null ? '<div class="seg"><i style="width:' + (r[1] * 100) + '%"></i></div>' : '<span style="flex:1"></span>') + '<b class="val" style="font-weight:400">' + r[2] + '</b></div>';
      return '<div class="row" style="align-items:center"><span class="ty" style="width:56px">' + r[0] + '</span>' + (r[1] != null ? '<div class="bar"><i style="width:' + (r[1] * 100) + '%"></i></div>' : '<span style="flex:1"></span>') + '<span class="num" style="margin-left:8px">' + r[2] + '</span></div>';
    }).join("");
    document.getElementById("logList").innerHTML = LOG.map(function(l, i){
      if(term) return '<div class="logLine glow ' + l[2] + '"><span class="t">' + l[0] + '</span><span>' + (l[2] === "alert" ? "!! " : "> ") + esc(l[1]) + '</span></div>';
      const lvl = l[2] === "alert" ? '<span class="kw">warn</span>' : '<span class="fn">info</span>';
      return '<div class="logLine"><span class="t">' + l[0] + '</span><span>' + lvl + ' <span class="com">›</span> ' + esc(l[1]) + '</span></div>';
    }).join("") + (term ? '<div class="logLine glow"><span class="t">13:42</span><span>&gt; <span style="animation:blink 1s steps(1) infinite">█</span></span></div>' : "");
    document.getElementById("cmdBtns").innerHTML = CMDS.map(function(c, i){
      const col = term ? "currentColor" : CMD_COLORS[i];
      return '<button title="' + c[0] + '"><svg viewBox="0 0 24 24" fill="none" stroke="' + col + '">' + ICONS[c[2]] + '</svg>' +
        (term ? '<span>' + c[0] + '</span>' : '<span><span class="fn">' + c[1] + '</span>()</span>') + '</button>';
    }).join("");
    document.getElementById("statusBar").innerHTML = term ? "" :
      '<div style="position:absolute;left:0;right:0;top:-2px;height:0"></div>';
    document.querySelectorAll(".sep").forEach(function(s){ s.style.background = term ? "repeating-linear-gradient(90deg,#1f9b48 0 4px,transparent 4px 7px)" : "#2a2e48"; });
  }

  // ---------- the live sketch: viewport, miniatures, minimap ----------
  const view = document.getElementById("view"), vg = view.getContext("2d");
  const mini = document.getElementById("miniCanvas"), mg = mini.getContext("2d");
  const uth = document.getElementById("unitThumb"), ug = uth.getContext("2d");
  const ith = document.getElementById("infoThumb"), ig = ith.getContext("2d");
  const ORBITS = [
    { a: 90, r: 4, c: "#ff8a4c", ph: 0.2, sp: 0.18 }, { a: 150, r: 5.5, c: "#ff5f3c", ph: 2.4, sp: 0.11 }, { a: 220, r: 5, c: "#4fb3ff", ph: 4.1, sp: 0.08 },
    { a: 290, station: true, ph: 5.2, sp: 0.05 }, { a: 370, r: 6.5, c: "#3fd1a0", ph: 1.1, sp: 0.05 }, { a: 470, r: 4.2, c: "#c8e6ff", ph: 3.3, sp: 0.04 },
    { a: 590, r: 6, c: "#a8d8ff", ph: 0.7, sp: 0.03 }, { a: 730, r: 2, c: "#b8a48a", ph: 5.9, sp: 0.022 }, { a: 890, bh: true, ph: 2.0, sp: 0.016 }
  ];
  const TILT = 0.42;               // ellipses: the system seen from above at an angle
  const stars = []; for(let i = 0; i < 260; i++) stars.push([Math.random(), Math.random(), Math.random()]);
  let t0 = performance.now();

  function pos(o, t, scale, cx, cy){ const ang = o.ph + t * o.sp; return [cx + Math.cos(ang) * o.a * scale, cy + Math.sin(ang) * o.a * scale * TILT]; }

  function drawView(t){
    const W = view.width, H = view.height, term = skin === "term";
    const cx = W * 0.5, cy = H * 0.47, sc = Math.min(W, H) / 1950;
    vg.setTransform(1, 0, 0, 1, 0, 0);
    vg.fillStyle = term ? "#010803" : "#0b0c16"; vg.fillRect(0, 0, W, H);
    if(!term){
      const neb = vg.createRadialGradient(W * 0.25, H * 0.3, 0, W * 0.25, H * 0.3, W * 0.6);
      neb.addColorStop(0, "rgba(181,140,255,.20)"); neb.addColorStop(0.5, "rgba(94,231,255,.06)"); neb.addColorStop(1, "rgba(0,0,0,0)");
      vg.fillStyle = neb; vg.fillRect(0, 0, W, H);
      const neb2 = vg.createRadialGradient(W * 0.85, H * 0.8, 0, W * 0.85, H * 0.8, W * 0.5);
      neb2.addColorStop(0, "rgba(255,106,193,.16)"); neb2.addColorStop(1, "rgba(0,0,0,0)");
      vg.fillStyle = neb2; vg.fillRect(0, 0, W, H);
    }
    // stars
    stars.forEach(function(s){
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + s[2] * 20);
      vg.fillStyle = term ? "rgba(57,255,122," + (0.15 + 0.35 * tw * s[2]) + ")" : "rgba(230,232,242," + (0.2 + 0.6 * tw * s[2]) + ")";
      vg.fillRect(s[0] * W, s[1] * H, s[2] > 0.8 ? 3 : 2, s[2] > 0.8 ? 3 : 2);
    });
    if(term){
      // a polar grid, like a vector display
      vg.strokeStyle = "rgba(31,155,72,.18)"; vg.lineWidth = 1;
      for(let a = 0; a < Math.PI * 2; a += Math.PI / 12){ vg.beginPath(); vg.moveTo(cx, cy); vg.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W * TILT); vg.stroke(); }
    }
    // orbits
    ORBITS.forEach(function(o, i){
      vg.beginPath(); vg.ellipse(cx, cy, o.a * sc, o.a * sc * TILT, 0, 0, Math.PI * 2);
      if(term){ vg.setLineDash(o.station ? [10, 8] : [2, 8]); vg.strokeStyle = o.station ? "rgba(57,255,122,.55)" : "rgba(57,255,122,.32)"; vg.lineWidth = 2; }
      else { vg.setLineDash(o.station ? [14, 10] : []); vg.strokeStyle = o.station ? "rgba(255,180,92,.5)" : "rgba(108,115,153,.35)"; vg.lineWidth = 2; }
      vg.stroke(); vg.setLineDash([]);
    });
    // sun
    const sunR = 38 * sc * 2.2;
    if(term){
      glowStroke(function(){ vg.beginPath(); vg.arc(cx, cy, sunR, 0, Math.PI * 2); }, "#39ff7a", 3);
      for(let k = 0; k < 16; k++){ const a = k / 16 * Math.PI * 2 + t * 0.2; vg.beginPath(); vg.moveTo(cx + Math.cos(a) * sunR * 1.25, cy + Math.sin(a) * sunR * 1.25); vg.lineTo(cx + Math.cos(a) * sunR * 1.55, cy + Math.sin(a) * sunR * 1.55); vg.strokeStyle = "rgba(57,255,122,.6)"; vg.lineWidth = 2; vg.stroke(); }
    } else {
      const sg = vg.createRadialGradient(cx, cy, 0, cx, cy, sunR * 3.2);
      sg.addColorStop(0, "#fff6d8"); sg.addColorStop(0.18, "#ffcf6a"); sg.addColorStop(0.32, "rgba(255,120,80,.55)"); sg.addColorStop(1, "rgba(255,106,193,0)");
      vg.fillStyle = sg; vg.beginPath(); vg.arc(cx, cy, sunR * 3.2, 0, Math.PI * 2); vg.fill();
    }
    // bodies
    ORBITS.forEach(function(o){
      const p = pos(o, t, sc, cx, cy);
      if(o.station){ drawStation(p[0], p[1], term); drawSwarm(p[0], p[1], t, term); return; }
      if(o.bh){ drawBlackHole(p[0], p[1], sc, t, term); return; }
      const r = o.r * sc * 5.5;
      if(term){
        glowStroke(function(){ vg.beginPath(); vg.arc(p[0], p[1], r, 0, Math.PI * 2); }, "#39ff7a", 2);
        vg.strokeStyle = "rgba(57,255,122,.45)"; vg.lineWidth = 1.2;
        vg.beginPath(); vg.ellipse(p[0], p[1], r, r * 0.35, 0, 0, Math.PI * 2); vg.stroke();
        vg.beginPath(); vg.ellipse(p[0], p[1], r * 0.45, r, 0, 0, Math.PI * 2); vg.stroke();
      } else {
        const g = vg.createRadialGradient(p[0] - r * 0.4, p[1] - r * 0.4, r * 0.1, p[0], p[1], r * 1.05);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, o.c); g.addColorStop(1, "#0b0c16");
        vg.shadowColor = o.c; vg.shadowBlur = 24; vg.fillStyle = g; vg.beginPath(); vg.arc(p[0], p[1], r, 0, Math.PI * 2); vg.fill(); vg.shadowBlur = 0;
      }
    });
    // a comet
    const ca = t * 0.07, cxp = cx + Math.cos(ca) * 620 * sc, cyp = cy + Math.sin(ca) * 260 * sc * 1.6;
    const tx = cxp - cx, ty = cyp - cy, tl = Math.hypot(tx, ty) || 1;
    vg.beginPath(); vg.moveTo(cxp, cyp); vg.lineTo(cxp + tx / tl * 110, cyp + ty / tl * 110);
    vg.strokeStyle = term ? "rgba(57,255,122,.7)" : "rgba(94,231,255,.7)"; vg.lineWidth = term ? 2 : 3; vg.stroke();
    vg.fillStyle = term ? "#b6ffcc" : "#e6f9ff"; vg.beginPath(); vg.arc(cxp, cyp, 5, 0, Math.PI * 2); vg.fill();
    // TERMINAL: a radar sweep over the whole viewport
    if(term){
      const a = (t * 0.6) % (Math.PI * 2);
      const sw = vg.createConicGradient ? vg.createConicGradient(a - 0.9, cx, cy) : null;
      if(sw){ sw.addColorStop(0, "rgba(57,255,122,0)"); sw.addColorStop(0.14, "rgba(57,255,122,.10)"); sw.addColorStop(0.145, "rgba(57,255,122,0)");
        vg.fillStyle = sw; vg.fillRect(0, 0, W, H); }
      vg.fillStyle = "rgba(57,255,122,.75)"; vg.font = "22px 'IBM Plex Mono', monospace";
      vg.fillText("SECTOR 4 · STATION ORBIT · SCALE 1:" + Math.round(1 / sc), 30, 110);
    }
  }
  function glowStroke(path, color, w){
    vg.save(); vg.shadowColor = color; vg.shadowBlur = 16; vg.strokeStyle = color; vg.lineWidth = w; path(); vg.stroke(); vg.restore();
  }
  function drawStation(x, y, term){
    if(term){
      glowStroke(function(){ vg.beginPath(); vg.ellipse(x, y, 34, 13, 0, 0, Math.PI * 2); }, "#39ff7a", 2);
      glowStroke(function(){ vg.beginPath(); vg.moveTo(x - 60, y - 6); vg.lineTo(x + 60, y - 6); vg.moveTo(x, y - 36); vg.lineTo(x, y + 26); }, "#39ff7a", 2);
      vg.fillStyle = "#39ff7a"; vg.font = "20px 'IBM Plex Mono', monospace"; vg.fillText("[ST-04]", x + 44, y - 20);
    } else {
      vg.save(); vg.shadowColor = "#ffb45c"; vg.shadowBlur = 20;
      vg.strokeStyle = "#ffb45c"; vg.lineWidth = 4; vg.beginPath(); vg.ellipse(x, y, 34, 13, 0, 0, Math.PI * 2); vg.stroke();
      vg.strokeStyle = "#e6e8f2"; vg.lineWidth = 3; vg.beginPath(); vg.moveTo(x - 60, y - 6); vg.lineTo(x + 60, y - 6); vg.moveTo(x, y - 36); vg.lineTo(x, y + 26); vg.stroke();
      vg.restore();
      vg.font = "20px 'IBM Plex Mono', monospace"; vg.fillStyle = "#ffb45c"; vg.fillText("station", x + 44, y - 20); vg.fillStyle = "#6c7399"; vg.fillText(".haven", x + 118, y - 20);
    }
  }
  function drawSwarm(x, y, t, term){
    for(let i = 0; i < 7; i++){
      const a = i * 2.4 + t * 0.35, r = 70 + 18 * Math.sin(i * 1.7);
      const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.5, h = a + Math.PI / 2;
      vg.save(); vg.translate(sx, sy); vg.rotate(h);
      vg.beginPath(); vg.moveTo(12, 0); vg.lineTo(-8, -6); vg.lineTo(-4, 0); vg.lineTo(-8, 6); vg.closePath();
      if(term){ vg.strokeStyle = "#39ff7a"; vg.lineWidth = 2; vg.shadowColor = "#39ff7a"; vg.shadowBlur = 8; vg.stroke(); }
      else { vg.fillStyle = i === 1 ? "#b58cff" : "#5ee7ff"; vg.shadowColor = vg.fillStyle; vg.shadowBlur = 14; vg.fill(); }
      vg.restore();
    }
    // the selected ship's program route
    vg.save(); vg.translate(x, y);
    vg.beginPath(); for(let k = 0; k <= 6; k++){ const a = k / 6 * Math.PI * 2; const px = 150 + Math.cos(a) * 70, py = -40 + Math.sin(a) * 34; k ? vg.lineTo(px, py) : vg.moveTo(px, py); }
    vg.setLineDash(term ? [6, 6] : []); vg.strokeStyle = term ? "rgba(57,255,122,.8)" : "#b58cff"; vg.lineWidth = 2.5; vg.stroke(); vg.setLineDash([]);
    vg.restore();
  }
  function drawBlackHole(x, y, sc, t, term){
    const r = 16;
    if(term){
      for(let k = 0; k < 5; k++){ vg.beginPath(); vg.ellipse(x, y, r * (2 + k * 0.8), r * (0.7 + k * 0.28), 0.3, 0, Math.PI * 2); vg.strokeStyle = "rgba(57,255,122," + (0.6 - k * 0.1) + ")"; vg.lineWidth = 1.5; vg.stroke(); }
      vg.fillStyle = "#010803"; vg.beginPath(); vg.arc(x, y, r, 0, Math.PI * 2); vg.fill();
      glowStroke(function(){ vg.beginPath(); vg.arc(x, y, r, 0, Math.PI * 2); }, "#39ff7a", 2);
      vg.fillStyle = "#39ff7a"; vg.font = "18px 'IBM Plex Mono', monospace"; vg.fillText("!! ABYSS", x + 28, y - 26);
    } else {
      const g = vg.createRadialGradient(x, y, r * 0.8, x, y, r * 4);
      g.addColorStop(0, "rgba(255,180,92,.9)"); g.addColorStop(0.35, "rgba(255,106,193,.45)"); g.addColorStop(1, "rgba(181,140,255,0)");
      vg.save(); vg.translate(x, y); vg.scale(1, 0.4); vg.rotate(t * 0.2); vg.fillStyle = g; vg.beginPath(); vg.arc(0, 0, r * 4, 0, Math.PI * 2); vg.fill(); vg.restore();
      vg.fillStyle = "#000"; vg.beginPath(); vg.arc(x, y, r, 0, Math.PI * 2); vg.fill();
      vg.strokeStyle = "#ffb45c"; vg.lineWidth = 2; vg.beginPath(); vg.arc(x, y, r + 1, 0, Math.PI * 2); vg.stroke();
    }
  }
  function drawMini(t){
    const W = mini.width, H = mini.height, term = skin === "term", cx = W / 2, cy = H / 2, sc = W / 1950;
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.fillStyle = term ? "#010803" : "#12131f"; mg.fillRect(0, 0, W, H);
    ORBITS.forEach(function(o){
      mg.beginPath(); mg.arc(cx, cy, o.a * sc, 0, Math.PI * 2);
      mg.strokeStyle = term ? "rgba(57,255,122,.35)" : "rgba(108,115,153,.45)"; mg.lineWidth = 1.5; mg.stroke();
      const ang = o.ph + t * o.sp, x = cx + Math.cos(ang) * o.a * sc, y = cy + Math.sin(ang) * o.a * sc;
      mg.fillStyle = term ? "#39ff7a" : (o.station ? "#ffb45c" : o.bh ? "#ff6ac1" : o.c);
      mg.beginPath(); mg.arc(x, y, o.station ? 6 : 5, 0, Math.PI * 2); mg.fill();
    });
    mg.fillStyle = term ? "#b6ffcc" : "#ffcf6a"; mg.beginPath(); mg.arc(cx, cy, 8, 0, Math.PI * 2); mg.fill();
    if(term){
      const a = (t * 1.2) % (Math.PI * 2);
      if(mg.createConicGradient){ const sw = mg.createConicGradient(a - 1, cx, cy); sw.addColorStop(0, "rgba(57,255,122,0)"); sw.addColorStop(0.16, "rgba(57,255,122,.35)"); sw.addColorStop(0.162, "rgba(57,255,122,0)"); mg.fillStyle = sw; mg.fillRect(0, 0, W, H); }
    } else {
      mg.strokeStyle = "#5ee7ff"; mg.lineWidth = 2; mg.strokeRect(cx + 40, cy - 70, 120, 90);   // the camera frame
    }
  }
  function drawThumbs(t){
    const term = skin === "term";
    // unit: the ship in profile
    ug.setTransform(1, 0, 0, 1, 0, 0); ug.clearRect(0, 0, uth.width, uth.height);
    ug.save(); ug.translate(uth.width / 2, uth.height / 2 + Math.sin(t * 2) * 3);
    ug.beginPath(); ug.moveTo(120, 0); ug.lineTo(-60, -26); ug.lineTo(-90, -12); ug.lineTo(-90, 12); ug.lineTo(-60, 26); ug.closePath();
    if(term){ ug.strokeStyle = "#39ff7a"; ug.lineWidth = 3; ug.shadowColor = "#39ff7a"; ug.shadowBlur = 12; ug.stroke();
      ug.beginPath(); ug.moveTo(-40, 0); ug.lineTo(90, 0); ug.stroke(); }
    else { const g = ug.createLinearGradient(-90, 0, 120, 0); g.addColorStop(0, "#b58cff"); g.addColorStop(1, "#5ee7ff"); ug.fillStyle = g; ug.shadowColor = "#5ee7ff"; ug.shadowBlur = 18; ug.fill(); }
    // engine
    ug.fillStyle = term ? "rgba(57,255,122,.8)" : "rgba(255,180,92,.9)"; ug.beginPath(); ug.ellipse(-104 - Math.random() * 8, 0, 16 + Math.random() * 6, 7, 0, 0, Math.PI * 2); ug.fill();
    ug.restore();
    // info: the planet
    ig.setTransform(1, 0, 0, 1, 0, 0); ig.clearRect(0, 0, ith.width, ith.height);
    const x = 80, y = 80, r = 58;
    if(term){
      ig.strokeStyle = "#39ff7a"; ig.lineWidth = 2; ig.shadowColor = "#39ff7a"; ig.shadowBlur = 10;
      ig.beginPath(); ig.arc(x, y, r, 0, Math.PI * 2); ig.stroke(); ig.shadowBlur = 0;
      for(let k = -2; k <= 2; k++){ ig.beginPath(); ig.ellipse(x, y + k * 20, Math.sqrt(r * r - (k * 20) * (k * 20)), 6, 0, 0, Math.PI * 2); ig.strokeStyle = "rgba(57,255,122,.45)"; ig.stroke(); }
      for(let k = 0; k < 4; k++){ ig.beginPath(); ig.ellipse(x, y, Math.abs(Math.cos(t * 0.6 + k * 0.8)) * r, r, 0, 0, Math.PI * 2); ig.stroke(); }
    } else {
      const g = ig.createRadialGradient(x - 22, y - 22, 6, x, y, r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.3, "#4fb3ff"); g.addColorStop(0.7, "#3fd1a0"); g.addColorStop(1, "#0b0c16");
      ig.shadowColor = "#4fb3ff"; ig.shadowBlur = 20; ig.fillStyle = g; ig.beginPath(); ig.arc(x, y, r, 0, Math.PI * 2); ig.fill();
    }
  }

  function frame(){
    const t = (performance.now() - t0) / 1000;
    drawView(t); drawMini(t); drawThumbs(t);
    // live numbers
    document.getElementById("sPoints").textContent = (12480 + Math.floor(t * 7)).toLocaleString("en-US");
    requestAnimationFrame(frame);
  }

  setSkin(skin);
  requestAnimationFrame(frame);
})();
