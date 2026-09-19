// Minimal i18n: English is the default, Polish is a toggle (see ui/setup.js).
// t("a.b.c") looks up a dotted path in the current language, falling back to
// English if missing. For strings with a variable, the value is a function
// the caller invokes with the argument(s), e.g. t("toast.eaten")(gained).
const STRINGS = {
  en: {
    banner: {
      desc: "Your swarm of ships feeds on planets, suns, comets and meteoroids scattered through space — and sometimes a black hole appears nearby, best avoided. Every planet devoured grants evolution points — invest them in speed, power and thermal resistance, or raise new units.",
      nickPlaceholder: "Swarm commander's nickname",
      nickSuggestionPrefix: "e.g.",
      start: "ENTER ORBIT",
      setup: "⚙ Setup",
      language: "Language"
    },
    setup: {
      title: "Setup",
      tabLanguage: "Language",
      tabMouse: "Mouse",
      tabHelp: "Help",
      invertX: "Invert X (right-drag)",
      invertY: "Invert Y (right-drag)",
      swapButtons: "Swap left/right mouse button"
    },
    telemetry: {
      title: "ROJ // TELEMETRY",
      points: "Evolution points",
      ships: "Units",
      eaten: "Planets devoured",
      players: "Players online"
    },
    hint: "Right button + drag = rotate camera · scroll = zoom<br>Left click / box select = select ships<br>Click a planet = course order for selected (or whole swarm)",
    legend: {
      ice: "Ice planets", neutral: "Neutral planets", volcanic: "Volcanic planets",
      sun: "☀ Suns", comet: "☄ Comets", meteoroid: "🪨 Meteoroids", blackhole: "🌀 Black holes (hazard!)"
    },
    players: { title: "PLAYERS", you: " (You)", defaultName: "Player" },
    upgrades: {
      speed: "Speed", power: "Bite power", heat: "Heat resistance+",
      cold: "Cold resistance-", fleet: "Swarm size",
      level: function(lvl, max){ return "level " + lvl + " / " + max; },
      max: "MAX", pts: "pts",
      resetName: "Reset upgrades", resetDesc: "refunds spent pts",
      resetConfirm: "Reset all swarm upgrades? Spent points will be refunded.",
      resetToast: function(n){ return "Upgrades reset · +" + n + " pts refunded"; }
    },
    toast: {
      eaten: function(n){ return "+" + n + " pts // planet devoured"; },
      orderAll: "Order: whole swarm on course",
      orderSome: function(n){ return "Order: " + n + " units on course"; },
      selected: function(n, total){ return "Selected: " + n + " / " + total; },
      blackholeDetected: "Black hole detected in sector",
      shipConsumed: "Ship pulled into a black hole!"
    }
  },
  pl: {
    banner: {
      desc: "Twój rój okrętów-sadów żywi się planetami, słońcami, kometami i meteorytami rozsianymi w przestrzeni — a w pobliżu czasem pojawia się czarna dziura, której lepiej unikać. Każda pochłonięta planeta daje punkty ewolucji — inwestuj je w prędkość, moc i odporność termiczną roju, albo powołuj nowe jednostki.",
      nickPlaceholder: "Ksywka dowódcy roju",
      nickSuggestionPrefix: "np.",
      start: "WEJDŹ NA ORBITĘ",
      setup: "⚙ Ustawienia",
      language: "Język"
    },
    setup: {
      title: "Ustawienia",
      tabLanguage: "Język",
      tabMouse: "Mysz",
      tabHelp: "Pomoc",
      invertX: "Odwróć X (obrót PPM)",
      invertY: "Odwróć Y (obrót PPM)",
      swapButtons: "Zamień lewy/prawy przycisk myszy"
    },
    telemetry: {
      title: "ROJ // TELEMETRIA",
      points: "Punkty ewolucji",
      ships: "Jednostki",
      eaten: "Planety pochłonięte",
      players: "Gracze online"
    },
    hint: "Prawy przycisk + przeciąg = obrót kamery · scroll = zoom<br>Lewy klik / zaznaczenie ramką = wybór statków<br>Klik na planetę = rozkaz kursu dla wybranych (lub całego roju)",
    legend: {
      ice: "Planety lodowe", neutral: "Planety neutralne", volcanic: "Planety wulkaniczne",
      sun: "☀ Słońca", comet: "☄ Komety", meteoroid: "🪨 Meteoryty", blackhole: "🌀 Czarne dziury (hazard!)"
    },
    players: { title: "GRACZE", you: " (Ty)", defaultName: "Gracz" },
    upgrades: {
      speed: "Prędkość", power: "Siła żucia", heat: "Odporność+ (gorąco)",
      cold: "Odporność- (zimno)", fleet: "Wielkość roju",
      level: function(lvl, max){ return "poziom " + lvl + " / " + max; },
      max: "MAX", pts: "pkt",
      resetName: "Reset ulepszeń", resetDesc: "zwraca wydane pkt",
      resetConfirm: "Zresetować wszystkie ulepszenia roju? Wydane punkty zostaną zwrócone.",
      resetToast: function(n){ return "Ulepszenia zresetowane · +" + n + " pkt zwrocone"; }
    },
    toast: {
      eaten: function(n){ return "+" + n + " pkt // planeta pochłonięta"; },
      orderAll: "Rozkaz: cały rój na kurs",
      orderSome: function(n){ return "Rozkaz: " + n + " jednostek na kurs"; },
      selected: function(n, total){ return "Zaznaczono: " + n + " / " + total; },
      blackholeDetected: "Wykryto czarną dziurę w sektorze",
      shipConsumed: "Statek wciągnięty w czarną dziurę!"
    }
  }
};

export const LANGS = ["en", "pl"];

let currentLang = "en";
try{
  const saved = localStorage.getItem("roj-lang");
  if(saved && STRINGS[saved]) currentLang = saved;
}catch(e){ /* ignore */ }

export function getLang(){ return currentLang; }

export function setLang(lang){
  if(!STRINGS[lang]) return;
  currentLang = lang;
  try{ localStorage.setItem("roj-lang", lang); }catch(e){ /* ignore */ }
}

export function t(key){
  const parts = key.split(".");
  let node = STRINGS[currentLang];
  for(let i=0;i<parts.length;i++){ node = node ? node[parts[i]] : undefined; }
  if(node === undefined){
    node = STRINGS.en;
    for(let i=0;i<parts.length;i++){ node = node ? node[parts[i]] : undefined; }
  }
  return node;
}
