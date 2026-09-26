// "Check library updates": the game ships local copies of its two
// libraries in vendor/ (no CDN at runtime). This compares the versions in
// use against the latest ones on the npm registry (it allows cross-origin
// requests, so a plain fetch works). The versions in use are read from the
// vendor file names that index.html loads — the one place they're written —
// so updating a library (new file + new src) needs no change here.
const LIBS = [
  { name: "Three.js", pkg: "three", pattern: /vendor\/three-r(\d+)\.min\.js/, toVersion: (m) => "0." + m[1] + ".0",
    note: "Newer releases no longer ship the classic build (three.min.js, the global THREE) — r160 dropped it — " +
          "so moving past r159 means loading the game, ShipKit and BodyKit as ES modules, not a file swap." },
  { name: "supabase-js", pkg: "@supabase/supabase-js", pattern: /vendor\/supabase-js-([\d.]+)\.js/, toVersion: (m) => m[1],
    note: "Download the new dist/umd/supabase.js into vendor/ under the new version's name and update the src in index.html and admin.html." },
];

function compareSemver(a, b){
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for(let i = 0; i < 3; i++){ if((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

function line(parent, parts){
  const div = document.createElement("div");
  parts.forEach(function(p){
    const el = document.createElement(p.tag || "span");
    el.textContent = p.text;             // textContent only (registry data is external)
    if(p.cls) el.className = p.cls;
    div.appendChild(el);
  });
  parent.appendChild(div);
}

async function check(){
  const out = document.getElementById("libResult");
  out.className = ""; out.textContent = "Checking…";
  try {
    const html = await (await fetch("index.html", { cache: "no-store" })).text();
    const rows = await Promise.all(LIBS.map(async function(lib){
      const m = html.match(lib.pattern);
      const used = m ? lib.toVersion(m) : null;
      const res = await fetch("https://registry.npmjs.org/" + lib.pkg + "/latest", { cache: "no-store" });
      if(!res.ok) throw new Error(lib.pkg + ": registry answered " + res.status);
      const latest = (await res.json()).version;
      return { lib: lib, used: used, latest: latest };
    }));
    out.textContent = "";
    rows.forEach(function(r){
      const newer = r.used && compareSemver(r.latest, r.used) > 0;
      line(out, [
        { text: r.lib.name + ": ", tag: "b" },
        { text: "in use " + (r.used || "? (not found in index.html)") + ", latest " + r.latest + " — " },
        { text: newer ? "a newer version exists." : "up to date.", cls: newer ? "newer" : "" },
      ]);
      if(newer) line(out, [{ text: "↳ " + r.lib.note }]);
    });
  } catch(err){
    out.className = "error";
    out.textContent = "Couldn't check: " + err.message;
  }
}

document.getElementById("libCheckBtn").addEventListener("click", check);
