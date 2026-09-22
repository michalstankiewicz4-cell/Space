// Minimal i18n: English is the default, Polish is a toggle (see ui/setup.js).
// t("a.b.c") looks up a dotted path in the current language, falling back to
// English if missing. For strings with a variable, the value is a function
// the caller invokes with the argument(s), e.g. t("toast.eaten")(gained).
const STRINGS = {
  en: {
    banner: {
      desc: "Your swarm of ships feeds on planets, suns, comets and meteoroids scattered through space — and sometimes a black hole appears nearby, best avoided. Every planet devoured grants evolution points — invest them in speed, power and thermal resistance, or raise new units.",
      modeSingle: "Singleplayer",
      modeMulti: "Multiplayer",
      modeFriends: "With friends",
      modeComingSoon: "Coming soon",
      nickPlaceholder: "Swarm commander's nickname",
      nickSuggestionPrefix: "e.g.",
      start: "ENTER ORBIT",
      setup: "⚙ Setup",
      language: "Language",
      nickRejected: "Please choose a different nickname."
    },
    outdated: {
      title: "⚠ Update available",
      text: "A new version of the game is available. Please refresh the page to continue.",
      reload: "Refresh now",
      hint: "or Ctrl+Shift+R"
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
      title: "SWARM PROTOCOL // TELEMETRY",
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
    tech: { title: "Tech Tree" },
    fleet: {
      title: "Fleet",
      ship: function(n){ return "Ship " + n; },
      shipCamLabel: "SHIP CAM"
    },
    body: {
      ice: "Ice planet", neutral: "Neutral planet", volcanic: "Volcanic planet",
      sun: "Sun", comet: "Comet", meteoroid: "Meteoroid", blackhole: "Black hole"
    },
    tooltip: {
      health: "Health", value: "Value",
      timeLeft: "Time left", hazard: "Hazard",
      hazardWarning: "Avoid — consumes ships!"
    },
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
      noSelection: "Select ships first",
      blackholeDetected: "Black hole detected in sector",
      shipConsumed: "Ship pulled into a black hole!",
      droneSurvived: "Drone survived the black hole — barely!"
    },
    connection: {
      reconnecting: "⚠ Reconnecting to server…"
    },
    drone: {
      title: "DRONE",
      status: "Status",
      fuel: "Fuel",
      attack: "Attack",
      defense: "Defense",
      scriptBtn: "📜 Script",
      idle: "Idle",
      running: "Running",
      error: "Error",
      printBlocked: "print() blocked: message contains inappropriate language",
      printCooldown: "print() is on cooldown — wait a moment before printing again",
      scriptTitle: "Drone Script",
      run: "▶ Run",
      stop: "■ Stop",
      placeholder: "while (fuel() > 10) {\n  move(5)\n  if (nearPlanet()) {\n    attack()\n  }\n}",
      help: {
        movementTitle: "Movement",
        move: "Move forward n units in a straight line (costs 1 fuel per unit)",
        turn: "Rotate by deg degrees (positive = one way, negative = the other)",
        wait: "Pause the script for s seconds",
        sensorsTitle: "Sensors & actions",
        fuel: "Current fuel, 0 to maxFuel()",
        maxFuelFn: "Fuel tank capacity",
        near: "1 if a planet/sun is close enough to attack() or refuel, else 0",
        attackFn: "Bite the nearest body in range for this drone's Attack stat",
        print: "Write x to the log below the buttons, and release a gas puff from the nose with a laser writing x into it — visible to other players too",
        syntaxTitle: "Syntax",
        syntax: "if (…) { … } else { … } · while (…) { … } · x = 5 · \"text\" (print() only) · + - * / < > <= >= == != && || !",
        exampleTitle: "Example"
      }
    },
    station: {
      title: "STATION",
      fleet: "Fleet",
      upgrades: "Upgrades",
      techBtn: "🛠 Tech",
      fleetBtn: "🚀 Fleet"
    },
    planet: {
      health: "Health", radius: "Radius", spin: "Spin", value: "Value"
    },
    devTools: {
      button: "Dev Tools",
      lights: "Show light sources",
      distance: "Connect selected planets",
      noLights: "Turn off lights"
    }
  },
  pl: {
    banner: {
      desc: "Twój rój okrętów-sadów żywi się planetami, słońcami, kometami i meteorytami rozsianymi w przestrzeni — a w pobliżu czasem pojawia się czarna dziura, której lepiej unikać. Każda pochłonięta planeta daje punkty ewolucji — inwestuj je w prędkość, moc i odporność termiczną roju, albo powołuj nowe jednostki.",
      modeSingle: "Jeden gracz",
      modeMulti: "Multiplayer",
      modeFriends: "Ze znajomymi",
      modeComingSoon: "Wkrótce",
      nickPlaceholder: "Ksywka dowódcy roju",
      nickSuggestionPrefix: "np.",
      start: "WEJDŹ NA ORBITĘ",
      setup: "⚙ Ustawienia",
      language: "Język",
      nickRejected: "Wybierz inny nick."
    },
    outdated: {
      title: "⚠ Dostępna aktualizacja",
      text: "Dostępna jest nowa wersja gry. Odśwież stronę, aby kontynuować.",
      reload: "Odśwież teraz",
      hint: "lub Ctrl+Shift+R"
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
      title: "SWARM PROTOCOL // TELEMETRIA",
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
    tech: { title: "Drzewo rozwoju" },
    fleet: {
      title: "Flota",
      ship: function(n){ return "Statek " + n; },
      shipCamLabel: "KAMERA STATKU"
    },
    body: {
      ice: "Planeta lodowa", neutral: "Planeta neutralna", volcanic: "Planeta wulkaniczna",
      sun: "Słońce", comet: "Kometa", meteoroid: "Meteoryt", blackhole: "Czarna dziura"
    },
    tooltip: {
      health: "Zdrowie", value: "Wartość",
      timeLeft: "Pozostały czas", hazard: "Zagrożenie",
      hazardWarning: "Unikaj — pochłania statki!"
    },
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
      noSelection: "Najpierw zaznacz statki",
      blackholeDetected: "Wykryto czarną dziurę w sektorze",
      droneSurvived: "Dron przetrwał czarną dziurę — o mały włos!",
      shipConsumed: "Statek wciągnięty w czarną dziurę!"
    },
    connection: {
      reconnecting: "⚠ Ponowne łączenie z serwerem…"
    },
    drone: {
      title: "DRON",
      status: "Status",
      fuel: "Paliwo",
      attack: "Atak",
      defense: "Obrona",
      scriptBtn: "📜 Skrypt",
      idle: "Bezczynny",
      running: "Działa",
      error: "Błąd",
      printBlocked: "print() zablokowany: treść zawiera niedozwolone słowa",
      printCooldown: "print() na chłodzeniu — poczekaj chwilę przed kolejnym użyciem",
      scriptTitle: "Skrypt drona",
      run: "▶ Uruchom",
      stop: "■ Stop",
      placeholder: "while (fuel() > 10) {\n  move(5)\n  if (nearPlanet()) {\n    attack()\n  }\n}",
      help: {
        movementTitle: "Ruch",
        move: "Leci prosto do przodu o n jednostek (koszt: 1 paliwo za jednostkę)",
        turn: "Obraca się o deg stopni (dodatnie = w jedną stronę, ujemne = w drugą)",
        wait: "Wstrzymuje skrypt na s sekund",
        sensorsTitle: "Czujniki i akcje",
        fuel: "Aktualne paliwo, od 0 do maxFuel()",
        maxFuelFn: "Pojemność zbiornika paliwa",
        near: "1 jeśli planeta/słońce jest wystarczająco blisko, by zaatakować lub zatankować, inaczej 0",
        attackFn: "Gryzie najbliższe ciało w zasięgu, siłą równą statystyce Atak drona",
        print: "Wypisuje x w logu pod przyciskami i wypuszcza obłok gazu z dzioba, w który laser wpisuje x — widoczne też dla innych graczy",
        syntaxTitle: "Składnia",
        syntax: "if (…) { … } else { … } · while (…) { … } · x = 5 · \"tekst\" (tylko print()) · + - * / < > <= >= == != && || !",
        exampleTitle: "Przykład"
      }
    },
    station: {
      title: "STACJA",
      fleet: "Flota",
      upgrades: "Ulepszenia",
      techBtn: "🛠 Rozwój",
      fleetBtn: "🚀 Flota"
    },
    planet: {
      health: "Zdrowie", radius: "Promień", spin: "Obrót", value: "Wartość"
    },
    devTools: {
      button: "Dev Tools",
      lights: "Pokaż źródła światła",
      distance: "Połącz zaznaczone planety",
      noLights: "Wyłącz światła"
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
