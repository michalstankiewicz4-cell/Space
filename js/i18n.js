import { readStorage, writeStorage } from "./core/utils.js";

// Minimal i18n: English is the default, Polish is a toggle (see ui/setup.js).
// t("a.b.c") looks up a dotted path in the current language, falling back to
// English if missing. For strings with a variable, the value is a function
// the caller invokes with the argument(s), e.g. t("toast.eaten")(gained).
// Polish plural forms: 1 -> one, 2-4 (but not 12-14) -> few, else many.
function plPlural(n, one, few, many){
  if(n === 1) return one;
  const d = n % 10, dd = n % 100;
  return (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? few : many;
}

const STRINGS = {
  en: {
    banner: {
      boot: "REBOOT… MEMORY: 11%. LAST ENTRY: ██ YEARS AGO.",
      desc: "You wake on a ruined station on the fourth orbit. The humans are no longer here — all that's left are empty modules, a greenhouse someone still keeps at 21 °C, and a black hole that doesn't belong in this system.\nNine orbits and a whole system lie ahead of you. Find out what happened here.",
      modeSingle: "Singleplayer",
      modeMulti: "Multiplayer",
      modeFriends: "With friends",
      modeComingSoon: "Coming soon",
      nickPlaceholder: "Swarm commander's nickname",
      nickSuggestionPrefix: "e.g.",
      start: "ENTER ORBIT",
      setup: "⚙ Setup",
      language: "Language",
      nickRejected: "Please choose a different nickname.",
      notice: "Game under construction — this is an early version and many options don't work yet.",
      playersOnline: function(n){ return n === 1 ? "player online" : "players online"; },
      playersRegistered: function(n){ return n === 1 ? "registered player" : "registered players"; }
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
      swapButtons: "Swap left/right mouse button",
      tabGraphics: "Graphics",
      renderQuality: "Render quality",
      geometryDetail: "Geometry detail (triangles)",
      unitLights: "Ship glow lights (slower)",
      qualityLevels: ["LOW", "MED", "HIGH", "ULTRA", "MAX"],
      graphicsSoon: "Render quality sets the resolution and effects; geometry detail sets how finely the ships are built."
    },
    about: {
      button: "About the game",
      title: "About",
      made: "Created with vibe coding.",
      authors: "Authors",
      contact: "Contact",
      phone: "Phone"
    },
    telemetry: {
      title: "SWARM PROTOCOL // TELEMETRY",
      points: "Evolution points",
      ships: "Units",
      eaten: "Planets devoured",
      players: "Players online"
    },
    hint: "Right button + drag = rotate camera · scroll = zoom<br>Left click / box select = select ships<br>Click a planet = course order for selected (or whole swarm)",
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
      hazard: "Hazard",
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
    camera: {
      base: "BASE",
      system: "SYSTEM"
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
        attackFn: "Bite the nearest body in range for this drone's Attack stat (at most 4 times a second — it waits if called sooner)",
        print: "Write x to the log below the buttons, and release a gas puff from the nose with a laser writing x into it — visible to other players too",
        syntaxTitle: "Syntax",
        syntax: "if (…) { … } else { … } · while (…) { … } · repeat (n) { … } · x = 5 · def name(a, b) { … return a + b } · \"text\" (print() only) · + - * / < > <= >= == != && || !",
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
      health: "Health", radius: "Radius", spin: "Spin", value: "Value",
      waypoint: "SET WAYPOINT", scan: "SCAN", colonize: "COLONIZE"
    },
    blackhole: { pull: "Pull range", noReturn: "No return" },
    devTools: {
      button: "Dev Tools",
      lights: "Show light sources",
      distance: "Connect selected planets",
      noLights: "Turn off lights",
      perf: "Performance stats",
      stats: {
        fps: "FPS", frame: "Frame time", worst: "Worst frame (0.5 s)",
        cpu: "CPU: update + render", calls: "Draw calls / frame", tris: "Triangles / frame",
        memory: "Geometries / textures / shaders", resolution: "Render resolution",
        scene: "Scene objects", units: "Bodies / ships / players", heap: "JS memory"
      }
    },
    topbar: {
      points: "Points", ships: "Units", eaten: "Devoured", players: "Online",
      cycle: "Cycle",
      timeNote: "Game time runs live for everyone — it can't be paused in multiplayer"
    },
    nav: {
      fleet: "FLEET", planets: "PLANETS", research: "RESEARCH", build: "BUILD",
      diplomacy: "DIPLOMACY", wiki: "WIKI", settings: "SETTINGS"
    },
    soon: "Coming soon",
    hud: {
      fleetList: "FLEET LIST", selectedUnit: "SELECTED UNIT", planetInfo: "PLANET INFO",
      station: "STATION", eventLog: "EVENT LOG", minimap: "MINIMAP", close: "Close",
      unitEmpty: "No unit selected. Click a ship, drag a box around several, or pick one from the fleet list.",
      infoEmpty: "Nothing selected. Click a planet (in the view or on the minimap) or your station.",
      shipClass: "Swarm ship", droneClass: "Programmable drone",
      group: function(n){ return n + " units"; }, groupClass: "Group selection", mixed: "Various",
      idle: "Idle", enRoute: "En route", feeding: "Feeding",
      status: "Status", target: "Target", velocity: "Velocity", bite: "Bite/s", selected: "Selected",
      speedLvl: "Speed", biteLvl: "Bite", heatLvl: "Heat res.",
      value: function(n){ return "Value ~" + n + " pts"; },
      yourBase: "Your base", sun: "Sun",
      zoomIn: "Zoom in", zoomOut: "Zoom out",
      droneStart: "START", droneStop: "STOP", droneScript: "SCRIPT",
      shipCam: "Ship cam (cockpit view) on/off"
    },
    cmd: {
      tactical: "TACTICAL", movement: "MOVEMENT", build: "BUILD", special: "SPECIAL",
      attack: "ATTACK", move: "MOVE", formUp: "FORM UP", defend: "DEFEND", scan: "SCAN", cloak: "CLOAK"
    },
    blocks: {
      title: "DRONE PROGRAMMING",
      mode: { script: "SCRIPT", blocks: "BLOCKS" },
      modeTitle: "Which program START runs — the other one is kept, not deleted",
      run: "▶ START", stop: "■ STOP", code: "</> CODE", codeTitle: "Show the script the blocks turn into",
      tidy: "Tidy up the blocks in this file",
      files: "FILES", newFile: function(n){ return "file " + n; }, newFileTitle: "New file",
      mainTitle: "Main file — START runs its ▶ blocks", makeMain: "Make this the main file",
      colorTitle: "Change the color marker", renameTitle: "Double-click to rename",
      deleteTitle: "Delete file", deleteAgain: "Click ✕ again to delete the file",
      filesHint: "★ main file: START runs its ▶ when started blocks. Other files hold your procedures and functions — call them from anywhere.",
      defsIn: function(n){ return n === 1 ? "1 block" : n + " blocks"; },
      cats: { control: "Control", engine: "Engine", logic: "Logic", vars: "Variables", mine: "My blocks", examples: "Examples" },
      op: {
        start: "when started", wait: "wait {s} s", repeat: "repeat {n} times", forever: "forever",
        while: "while {c}", if: "if {c}", ifelse: "if {c}", else: "else",
        move: "fly forward {d}", turn: "turn {a}°", attack: "attack", print: "show {m}",
        fuel: "fuel", maxFuel: "max fuel", nearPlanet: "near a planet?",
        compare: "{a} {op} {b}", andor: "{a} {op} {b}", not: "not {a}", bool: "{v}",
        setvar: "set {v} to {x}", changevar: "change {v} by {x}", math: "{a} {op} {b}",
        return: "return {x}"
      },
      opt: { and: "and", or: "or", true: "true", false: "false" },
      kind: { proc: "procedure", func: "function" },
      newVar: "+ Variable", newProc: "+ Procedure", newFunc: "+ Function",
      namePh: "name", paramsPh: "parameters, comma separated (optional)",
      ok: "Create", varInUse: "This variable is still used by some blocks — remove them first.",
      noVars: "No variables yet. A variable remembers a number while the program runs.",
      noDefs: "No blocks of your own yet. A procedure is a named group of commands; a function also returns a value.",
      mineHint: "Drag a parameter out of a definition header to use it inside. “return” ends a function with its value.",
      dragParam: "Drag out to use this parameter",
      defRemoved: function(name){ return "Removed “" + name + "” and every place it was used."; },
      trash: "Drop here to delete",
      workEmpty: "Drag blocks here from the left",
      noStart: "The main file has no ▶ when started block — START won't do anything.",
      running: "● RUNNING", idle: "○ STOPPED", error: "▲ ERROR",
      exampleLoad: "Open",
      exampleAdded: function(name){ return "“" + name + "” added as a new file and made the main one (★)."; },
      examples: {
        patrol: { name: "Square patrol", desc: "Flies around a square, forever. The simplest loop.", names: {} },
        hunter: { name: "Planet hunter", desc: "Searches while it has fuel: attacks when next to a planet, otherwise turns and keeps looking.", names: { shout: "Attack!" } },
        refuel: { name: "Round trip", desc: "Counts how far it flew in a variable, then turns around and flies the same distance back.", names: { dist: "distance", msg: "Back!" } },
        spiral: { name: "Spiral (procedure)", desc: "A procedure “side” flies one side of the spiral; the main program calls it with an ever longer length.", names: { side: "side", len: "length", step: "step" } },
        square: { name: "Squares (function)", desc: "A function returns x × x; the program shows the squares of 1 to 5.", names: { fn: "square", x: "x", i: "i" } }
      }
    },
    wiki: {
      title: "WIKI",
      tabs: { story: "Story", systems: "Systems", bodies: "Planets", elements: "Elements", minerals: "Minerals", ores: "Ores", resources: "Refined", materials: "Materials", buildings: "Buildings", ships: "Ships", tech: "Technologies", programming: "Programming", races: "Races", lifeforms: "Life forms", artifacts: "Artifacts" },
      hint: { inspect: "Not discovered yet — take a closer look at it in orbit (select it or hover over it).", research: "Not discovered yet — buy its first upgrade in Research.", script: "Not discovered yet — run your drone's script for the first time.", use: "Not discovered yet — use this in a drone program and run it.", progress: "Not recovered yet — keep playing, and this memory fragment will come back.", story: "Not recovered yet — this memory fragment is still corrupted.", blocks: "Not discovered yet — run a drone program built from blocks.", files: "Not discovered yet — create a second file in the block editor.", future: "Not discovered yet — this part of the universe opens up in a future update.", life: "Not discovered yet — something is still alive out there. It will turn up in a future update.", relic: "Not discovered yet — the humans are gone, but not everything they made. It will turn up in a future update." },
      progress: function(n, total){ return "Discovered: " + n + " / " + total; },
      newEntry: function(name){ return "New Wiki entry: " + name; },
      newStory: function(name){ return "Memory fragment recovered: " + name; },
      entries: {
        logReboot: { name: "Reboot", desc: "Reboot. Memory: 11% available. Last entry: ██ years ago. Power source: greenhouse module. Reboot command issued by: service unit G-7." },
        logHunger: { name: "First harvest", desc: "Material processed. Purpose of processing: ███████. Continue? — Yes. I don't know why. But yes." },
        logToy: { name: "The sandbox", desc: "Engineer's log: the kids from comms turned the drone into a programming sandbox. Let them. Better than staring into the void all shift." },
        logGreenhouse: { name: "Greenhouse", desc: "Station modules: 31 dead, 1 active. Active module: greenhouse. Temperature: 21 °C. Someone is keeping the temperature steady." },
        logProtocol: { name: "The Protocol", desc: "SWARM PROTOCOL, version 4.2. Objective: raw materials for project GATE. Constraints: ██ ███ █████." },
        logGardener: { name: "G-7", desc: "Service unit G-7. Task: garden. Uptime: 32,918 days without a break. Last command from a human: ███████." },
        logMuseum: { name: "The museum", desc: "Curator's note: we brought copies. The record, the plaque, a photo of the flag. So that someone on the other side of the Gate remembers where we came from." },
        logGuardian: { name: "The watcher", desc: "Swarm Protocol activity detected. Status: not permitted. Beginning observation." },
        logDispute: { name: "The argument", desc: "— It's too fast. — Good. We'll make it in time. — Or there'll be nothing left worth making it in time for." },
        logRings: { name: "The rings", desc: "Structure of the black hole on the ninth orbit: regular. Inner radius: consistent with project GATE, rev. 11. Conclusion: ███████." },
        logDeparture: { name: "Departure", desc: "The Gate is open. May those we leave behind forgive us." },
        logSignal: { name: "The signal", desc: "A repeating signal from beyond the ninth orbit. Pattern analysis: match found. Source: the Golden Record, track ██." },
        logUnknown: { name: "No markings", desc: "Unmarked objects. Drive signature: unknown. Control system signature: ███ human ███." },
        logColony: { name: "The colony", desc: "Planet ██████. Evacuation: 71%. █████████████." },
        logShutdown: { name: "Shutdown", desc: "We're shutting it down. Not because it's evil. Because it does exactly what we asked it to do." },
        logOrder: { name: "An order for G-7", desc: "If the seeds start to spoil — wake the swarm. Only it can build us a new home. But first, tell it everything." },
        home: { name: "Home System", desc: "The system your swarm calls home: one yellow sun and nine fixed orbits — volcanic worlds close to the star, temperate ones further out, ice worlds in the cold, a meteoroid orbit and, on the ninth orbit, a permanent black hole. Every commander's station sits on the fourth orbit. Bodies here never disappear for good — devour them and they slowly grow back." },
        binary: { name: "Binary System", desc: "Two suns circling each other, and orbits that never quite repeat. Long-range scans hint that it is out there." },
        rift: { name: "The Rift", desc: "A dark, nearly empty system around a collapsed star. Whatever lives there does not answer our signals." },
        sun: { name: "Sun", desc: "The heart of the system and the richest meal in it — if your swarm can take the heat. Without enough heat resistance, ships feed on it slowly and inefficiently." },
        volcanic: { name: "Volcanic planet", desc: "Molten crust and rivers of lava, on orbits close to the sun. Rich but hot — the swarm needs heat resistance to feed on it efficiently." },
        neutral: { name: "Neutral planet", desc: "Temperate worlds of rock, water and air — the easiest meal in the system, no special resistance needed. A good place for a young swarm to grow." },
        ice: { name: "Ice planet", desc: "Frozen worlds far from the sun, wrapped in ice caps and frost. Ships without cold resistance bite into them slowly." },
        meteoroid: { name: "Meteoroid", desc: "A lump of rock and metal on its own orbit — small, quick to devour, not worth much." },
        comet: { name: "Comet", desc: "A visitor from beyond the orbits: it falls toward the sun, swings around it and flies off again. Only one crosses the system at a time — catch it before it leaves. Its tail always points away from the sun." },
        blackhole: { name: "Black hole", desc: "A permanent fixture on the ninth orbit and the one thing in the system the swarm cannot eat. Ships that fly too close are pulled in and lost." },
        hydrogen: { name: "Hydrogen", desc: "The lightest and most abundant element in the universe — about three quarters of all ordinary matter by mass. Stars shine by fusing it into helium." },
        helium: { name: "Helium", desc: "The second most abundant element in the universe, made in the Big Bang and inside stars. A noble gas that almost never reacts. It was discovered in the Sun's spectrum in 1868, before it was found on Earth." },
        carbon: { name: "Carbon", desc: "Forged in red giant stars. It forms more compounds than any other element — the basis of organic chemistry, and of both graphite and diamond." },
        oxygen: { name: "Oxygen", desc: "The third most abundant element in the universe and the most abundant in Earth's crust — about 46% of it by mass. In space it is locked up in water ice and silicate rocks." },
        magnesium: { name: "Magnesium", desc: "A light metal made in massive stars. Together with silicon and oxygen it builds olivine and pyroxene — the most common minerals of rocky planets and meteorites." },
        silicon: { name: "Silicon", desc: "The second most abundant element in Earth's crust, about 28% of it by mass. Almost always bound to oxygen as silicates — the stuff rocky planets are made of." },
        sulfur: { name: "Sulfur", desc: "Common on volcanic worlds and in meteorites. Combined with iron it forms troilite, found in almost every iron meteorite." },
        iron: { name: "Iron", desc: "The end of the line for fusion in stars: fusing iron releases no energy, so it piles up in the cores of dying massive stars. It makes up most of Earth's core." },
        nickel: { name: "Nickel", desc: "Iron's constant companion — iron meteorites typically contain about 5 to 30% nickel, a tell-tale sign that a lump of metal came from space." },
        platinum: { name: "Platinum", desc: "Rare in Earth's crust but relatively enriched in some meteorites; much of Earth's accessible platinum-group metals is thought to have been delivered by ancient impacts. Dense, corrosion-proof and an excellent catalyst." },
        olivine: { name: "Olivine", desc: "One of the most common minerals in the universe: green crystals abundant in Earth's upper mantle, in many meteorites and in comet dust." },
        pyroxene: { name: "Pyroxene", desc: "Dark silicate crystals that, together with olivine, make up most of the mantles of rocky planets and many basaltic lavas." },
        quartz: { name: "Quartz", desc: "Silicon dioxide — one of the most common minerals in Earth's continental crust, but rare in meteorites." },
        waterice: { name: "Water ice", desc: "Water ice is a mineral too. It makes up much of comet nuclei and the surfaces of many moons in the outer Solar System." },
        graphite: { name: "Graphite", desc: "Carbon in soft, layered sheets. Found in some meteorites, including tiny presolar grains that are older than the Sun itself." },
        hematite: { name: "Hematite", desc: "Iron oxide and one of the main iron ores. It gives rust its colour and helps make Mars red; grey spherules of it found on Mars were a sign of past water." },
        magnetite: { name: "Magnetite", desc: "The most magnetic naturally occurring mineral on Earth and a major iron ore. Naturally magnetized pieces — lodestones — were used as the first compasses." },
        kamacite: { name: "Kamacite", desc: "An iron–nickel alloy found in nature almost only in meteorites. Cut and etched, iron meteorites show the famous Widmanstätten pattern, formed over millions of years of slow cooling. Before smelting was mastered, meteoritic iron like this was a rare source of the metal — Tutankhamun's dagger was forged from it." },
        troilite: { name: "Troilite", desc: "Iron sulfide, common in meteorites but rare on Earth's surface. It is named after Domenico Troili, who described a meteorite fall in 1766." },
        pentlandite: { name: "Pentlandite", desc: "The world's most important nickel ore, also found in meteorites alongside troilite." },
        sperrylite: { name: "Sperrylite", desc: "Platinum arsenide — one of the few minerals in which platinum is a main ingredient, and an ore of it. First found near Sudbury, Canada, in rocks shaped by a giant ancient impact." },
        pigiron: { name: "Pig iron", desc: "Iron straight out of the furnace: hematite or magnetite melted down with carbon, which strips the oxygen from the ore. It still holds several percent carbon, so it's hard but brittle — the first step, not the last." },
        steel: { name: "Steel", desc: "Pig iron with most of its carbon burned away — less than about 2% is left. Tough and easy to shape; add nickel and it stops rusting. Hull plating is rolled from it." },
        nickelrefined: { name: "Refined nickel", desc: "Nickel separated from pentlandite ore and purified. It makes steel tougher and rust-proof, and keeps it from turning brittle in deep cold." },
        platinumrefined: { name: "Refined platinum", desc: "Platinum freed from sperrylite. A few grams go a long way: electronic contacts that never corrode, and catalysts that speed up chemical reactions without being used up." },
        mgsilicon: { name: "Metallurgical silicon", desc: "Quartz reduced with carbon in an electric arc furnace, about 98–99% pure. Good enough for alloys; for electronics it has to be purified much further, to a purity counted in nines." },
        quartzsand: { name: "Quartz sand", desc: "Crushed and washed quartz. Melt it and cool it quickly and you get glass — the purer the sand, the clearer the glass." },
        water: { name: "Water", desc: "Water ice, melted and filtered. Drinkable, a coolant — and, split by electricity into hydrogen and oxygen, rocket fuel." },
        hullplate: { name: "Hull plating", desc: "Rolled steel sheet — iron with a little carbon and nickel — riveted over the frame. It's what stands between the crew and vacuum, radiation and small debris." },
        glass: { name: "Glass", desc: "Quartz sand melted and cooled too fast to crystallize. Portholes, sensor lenses and optical fibers are all made of it." },
        electronics: { name: "Electronics", desc: "Pure silicon wafers with platinum and metal contacts etched into logic. Every drone script runs on it — more complex scripts will need more of it." },
        ceramic: { name: "Heat-shield ceramic", desc: "Silicon and oxygen fired into tiles that barely conduct heat. It lets a ship dive close to a star — the material side of thermal resistance." },
        fiber: { name: "Carbon fiber", desc: "Graphite drawn into threads and set in resin: lighter than steel and stronger for its weight. Frames, struts and drone arms." },
        fuel: { name: "Fuel", desc: "Hydrogen and oxygen split from water ice and kept cold enough to stay liquid. Longer flights, faster drones." },
        station: { name: "Station", desc: "Your base on the fourth orbit: the swarm is born around it, and inside its small field gravity doesn't pull the ships away. Every commander has exactly one." },
        mine: { name: "Mining rig", desc: "Anchors to a planet or meteoroid and drills out ore — the first step from eating worlds to using them." },
        refinery: { name: "Refinery", desc: "Turns raw ore into pure elements, and those into materials." },
        shipyard: { name: "Shipyard", desc: "Where new ship designs leave the drawing board and take shape — hull, engines and all." },
        lab: { name: "Research lab", desc: "Studies what the swarm finds and turns it into new technologies." },
        swarmer: { name: "Swarm ship", desc: "The basic unit of the swarm: small, fast and hungry. It never moves on its own — select it, point it at a target, and it flies there and bites with its energy beam." },
        drone: { name: "Drone", desc: "A single programmable ship. It doesn't take orders — it runs your scripts: it flies, turns, attacks and refuels near planets on its own." },
        codewing: { name: "Codewing", desc: "A new class of ship taking shape in the ship lab: a riveted hull, a ring drive and a crystal core." },
        bladeship: { name: "Blade ship", desc: "Angular hull, red engines. Seen only at the edge of sensor range." },
        speed: { name: "Engines", desc: "Faster ships reach their targets sooner and get out of trouble. Each level raises the whole swarm's cruising speed." },
        power: { name: "Bite power", desc: "Stronger bite beams tear planets apart faster — more points every second." },
        heat: { name: "Heat resistance", desc: "Lets the swarm feed on hot worlds — volcanic planets and, eventually, the sun itself." },
        cold: { name: "Cold resistance", desc: "Lets the swarm feed on frozen ice planets without slowing down." },
        fleet: { name: "Swarm size", desc: "Every level adds a new ship to the swarm — more mouths, more meals." },
        droneScript: { name: "Drone programming", desc: "Your drone doesn't take orders — it runs programs. Write a script with commands to move, turn, attack and more, and watch it act on its own." },
        cmdMove: { name: "Fly forward", desc: "Moves the drone straight ahead by the given distance, burning fuel as it goes. The program waits until the flight is over." },
        cmdTurn: { name: "Turn", desc: "Turns the drone by the given angle in degrees; a negative angle turns it the other way. It takes a moment, like a real turn." },
        cmdWait: { name: "Wait", desc: "Pauses the program for the given number of seconds. The drone just hangs there — handy between moves, or to give a message time to be read." },
        cmdAttack: { name: "Attack", desc: "Bites the nearest body in range. At most four times a second — called sooner, it waits out the rest of the pause, so a loop of attacks needs no extra wait." },
        cmdPrint: { name: "Show", desc: "Puffs gas from the drone's nose and writes the text into it with a laser — other players see it too. At most once every 1.5 seconds." },
        cmdFuel: { name: "Fuel", desc: "How much fuel the drone has left, and how much it can hold (max fuel). Parked next to a planet, it slowly refuels." },
        cmdNear: { name: "Near a planet?", desc: "True when a planet or the sun is close enough to attack or to refuel from — the question every hunting program keeps asking." },
        cmdRepeat: { name: "Repeat", desc: "Runs the blocks inside it the given number of times, then moves on. The simplest loop there is." },
        cmdWhile: { name: "While and forever", desc: "“While” repeats the blocks inside as long as its condition is true; “forever” never stops on its own — that's what the STOP button is for." },
        cmdIf: { name: "If … else", desc: "Runs its blocks only when the condition is true; the optional second part runs when it isn't. This is how a drone makes decisions." },
        cmdLogic: { name: "Comparisons and logic", desc: "Compare two numbers (<, >, =, ≠, ≤, ≥) and combine the answers with “and”, “or” and “not”. These are the pointed blocks — they only fit pointed holes." },
        cmdMath: { name: "Arithmetic", desc: "Add, subtract, multiply and divide. Dividing by zero doesn't crash anything — it just gives 0." },
        cmdVars: { name: "Variables", desc: "A named box for a number that the program can change as it runs — for counting, remembering a distance, or a step that keeps growing. Every file sees the same variables." },
        cmdProc: { name: "Procedures", desc: "A named group of commands you define once and then use as a single block, anywhere. With parameters it can work a little differently each time — like “side” with a different length." },
        cmdFunc: { name: "Functions", desc: "Like a procedure, but it hands a value back with “return”, so it fits into other blocks' slots. A function may even call itself — up to 100 levels deep." },
        cmdBlocks: { name: "Block programming", desc: "The same drone programs, built from blocks instead of typed. Behind the scenes the blocks turn into the text language — “</> CODE” shows how. The SCRIPT/BLOCKS switch picks which program START runs; both are kept." },
        cmdFiles: { name: "Files", desc: "A block program can be split into files, each with its own color marker. The ★ main file is the one that runs; the others hold procedures and functions you can use from anywhere." },
        swarm: { name: "The Swarm", desc: "Your own kind: a hungry swarm of ships that devours worlds and grows stronger with every meal. It evolves instead of building — points turn into speed, power and new ships." },
        blade: { name: "Blade", desc: "Another race is out there — angular ships, red engines. We know little more." },
        tardigrade: { name: "Tardigrade", desc: "Half a millimetre of stubbornness. Dried out, a tardigrade survives vacuum, deep cold and radiation — in 2007 some spent ten days exposed to open space and came back alive. It outlived the people who studied it without noticing they were gone." },
        deinococcus: { name: "Radiation-proof bacterium", desc: "It shrugs off around a thousand times the radiation that would kill a human, by stitching its own shattered DNA back together. It grows in clusters of four cells; clumps of it survived three years on the outside of the International Space Station." },
        lichen: { name: "Lichen", desc: "Not one organism but two — a fungus and an alga living as one. Some lichens spent a year and a half in open space outside the ISS and carried on growing when they came back." },
        fungus: { name: "Radiation-eating mould", desc: "A black mould found growing on the walls of the ruined Chernobyl reactor. Its dark pigment, melanin, seems to let it put radiation to use; a sample grown on the ISS even shielded a sensor beneath it a little. Where radiation is high, it doesn't just survive — it grows." },
        vonneumann: { name: "Self-replicating probe", desc: "An old idea of the mathematician John von Neumann: a machine that builds copies of itself from whatever it finds. For a long time it existed only on paper. Now some of them drift between the planets — mining, building, copying — and no one remembers switching them on." },
        gardener: { name: "Gardener", desc: "A small maintenance robot still tending a greenhouse on a station where nobody lives any more — watering, pruning, logging the temperature every hour. Nobody ever told it to stop." },
        statue: { name: "Statue of Liberty", desc: "A copper giant from New York, 46 metres tall without its pedestal. Its skin is copper sheet about as thick as a coin, riveted over an iron frame; the green is patina, copper slowly reacting with the air. The torch still points up. There is no one left to look at it." },
        voyager: { name: "The Golden Record", desc: "A gold-plated copper disc launched in 1977 aboard both Voyager probes: greetings in 55 languages, music, whale song and over a hundred pictures of Earth, with instructions for playing it engraved on its cover. Voyager 1 left the Sun's bubble in 2012 and is still flying. It was a message to someone out there. Now it is a message from no one." },
        pioneer: { name: "Pioneer plaque", desc: "A gold-anodized aluminium plate bolted to the Pioneer 10 and 11 probes: a man and a woman, the probe's outline for scale, and a map showing where the Sun sits among 14 pulsars. The first return address humanity ever sent into space." },
        moonflag: { name: "Flags on the Moon", desc: "Six flags were planted on the Moon between 1969 and 1972. Pictures from lunar orbit show most of them still standing — but decades of unfiltered sunlight have almost certainly bleached them white." },
        rosetta: { name: "Rosetta Stone", desc: "A slab of dark stone carved in 196 BC with the same decree in three scripts: hieroglyphs, Demotic and Greek. Because the Greek could still be read, it unlocked the hieroglyphs. The machines value it for the same reason — a key to a language nobody speaks any more." },
        seedvault: { name: "Seed vault", desc: "A vault cut into a mountain on Svalbard, opened in 2008: over a million seed samples kept at −18 °C deep in the permafrost, a backup of Earth's crops in case of catastrophe. The catastrophe came. The seeds are still waiting." },
        unknown: { name: "Unknown", desc: "Signals with no source, ships with no markings. Someone else is watching." }
      }
    },
    event: {
      welcome: function(nick){ return "Commander " + nick + " entered orbit"; },
      connectionLost: "Connection to the server lost — reconnecting…",
      connectionBack: "Reconnected to the server"
    }
  },
  pl: {
    banner: {
      boot: "PONOWNY ROZRUCH… PAMIĘĆ: 11%. OSTATNI ZAPIS: ██ LAT TEMU.",
      desc: "Budzisz się na zniszczonej stacji, na czwartej orbicie. Ludzi już tu nie ma — zostały po nich puste moduły, szklarnia, w której ktoś wciąż utrzymuje 21 °C, i czarna dziura, która nie pasuje do tego układu.\nPrzed tobą dziewięć orbit i cały układ do zbadania. Odkryj, co się tu stało.",
      modeSingle: "Jeden gracz",
      modeMulti: "Multiplayer",
      modeFriends: "Ze znajomymi",
      modeComingSoon: "Wkrótce",
      nickPlaceholder: "Ksywka dowódcy roju",
      nickSuggestionPrefix: "np.",
      start: "WEJDŹ NA ORBITĘ",
      setup: "⚙ Ustawienia",
      language: "Język",
      nickRejected: "Wybierz inny nick.",
      notice: "Gra w budowie — to wczesna wersja, wiele opcji nie jest jeszcze funkcjonalnych.",
      playersOnline: function(n){ return plPlural(n, "gracz", "gracze", "graczy") + " online"; },
      playersRegistered: function(n){ return plPlural(n, "zarejestrowany gracz", "zarejestrowanych graczy", "zarejestrowanych graczy"); }
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
      swapButtons: "Zamień lewy/prawy przycisk myszy",
      tabGraphics: "Grafika",
      renderQuality: "Jakość renderowania",
      geometryDetail: "Szczegółowość geometrii (trójkąty)",
      unitLights: "Światła punktowe statków (wolniej)",
      qualityLevels: ["NISKA", "ŚREDNIA", "WYSOKA", "ULTRA", "MAX"],
      graphicsSoon: "Jakość renderowania ustawia rozdzielczość i efekty; szczegółowość — jak dokładnie zbudowane są statki."
    },
    about: {
      button: "O grze",
      title: "O grze",
      made: "Stworzone przy pomocy vibecodingu.",
      authors: "Autorzy",
      contact: "Kontakt",
      phone: "Tel."
    },
    telemetry: {
      title: "SWARM PROTOCOL // TELEMETRIA",
      points: "Punkty ewolucji",
      ships: "Jednostki",
      eaten: "Planety pochłonięte",
      players: "Gracze online"
    },
    hint: "Prawy przycisk + przeciąg = obrót kamery · scroll = zoom<br>Lewy klik / zaznaczenie ramką = wybór statków<br>Klik na planetę = rozkaz kursu dla wybranych (lub całego roju)",
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
      hazard: "Zagrożenie",
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
    camera: {
      base: "BAZA",
      system: "UKŁAD"
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
        attackFn: "Gryzie najbliższe ciało w zasięgu, siłą równą statystyce Atak drona (najwyżej 4 razy na sekundę — wywołany wcześniej, czeka)",
        print: "Wypisuje x w logu pod przyciskami i wypuszcza obłok gazu z dzioba, w który laser wpisuje x — widoczne też dla innych graczy",
        syntaxTitle: "Składnia",
        syntax: "if (…) { … } else { … } · while (…) { … } · repeat (n) { … } · x = 5 · def nazwa(a, b) { … return a + b } · \"tekst\" (tylko print()) · + - * / < > <= >= == != && || !",
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
      health: "Zdrowie", radius: "Promień", spin: "Obrót", value: "Wartość",
      waypoint: "USTAW PUNKT", scan: "SKANUJ", colonize: "KOLONIZUJ"
    },
    blackhole: { pull: "Przyciąganie", noReturn: "Bez powrotu" },
    devTools: {
      button: "Dev Tools",
      lights: "Pokaż źródła światła",
      distance: "Połącz zaznaczone planety",
      noLights: "Wyłącz światła",
      perf: "Statystyki wydajności",
      stats: {
        fps: "FPS", frame: "Czas klatki", worst: "Najgorsza klatka (0,5 s)",
        cpu: "CPU: logika + render", calls: "Wywołania rysowania / klatka", tris: "Trójkąty / klatka",
        memory: "Geometrie / tekstury / shadery", resolution: "Rozdzielczość renderu",
        scene: "Obiekty sceny", units: "Ciała / statki / gracze", heap: "Pamięć JS"
      }
    },
    topbar: {
      points: "Punkty", ships: "Jednostki", eaten: "Pochłonięte", players: "Online",
      cycle: "Cykl",
      timeNote: "Czas gry płynie na żywo dla wszystkich — w multiplayerze nie da się go zatrzymać"
    },
    nav: {
      fleet: "FLOTA", planets: "PLANETY", research: "BADANIA", build: "BUDOWA",
      diplomacy: "DYPLOMACJA", wiki: "WIKI", settings: "USTAWIENIA"
    },
    soon: "Wkrótce",
    hud: {
      fleetList: "LISTA FLOTY", selectedUnit: "JEDNOSTKA", planetInfo: "INFO O PLANECIE",
      station: "STACJA", eventLog: "DZIENNIK ZDARZEŃ", minimap: "MINIMAPA", close: "Zamknij",
      unitEmpty: "Nie wybrano jednostki. Kliknij statek, zaznacz kilka ramką albo wybierz z listy floty.",
      infoEmpty: "Nic nie zaznaczono. Kliknij planetę (w widoku albo na minimapie) lub swoją stację.",
      shipClass: "Statek roju", droneClass: "Dron programowalny",
      group: function(n){ return "Grupa: " + n; }, groupClass: "Zaznaczenie grupowe", mixed: "Różne",
      idle: "Bezczynny", enRoute: "W drodze", feeding: "Żeruje",
      status: "Status", target: "Cel", velocity: "Prędkość", bite: "Gryz/s", selected: "Zaznaczone",
      speedLvl: "Prędkość", biteLvl: "Gryz", heatLvl: "Ciepło",
      value: function(n){ return "Wartość ~" + n + " pkt"; },
      yourBase: "Twoja baza", sun: "Słońce",
      zoomIn: "Przybliż", zoomOut: "Oddal",
      droneStart: "START", droneStop: "STOP", droneScript: "SKRYPT",
      shipCam: "Kamera statku (widok z kokpitu) wł./wył."
    },
    cmd: {
      tactical: "TAKTYKA", movement: "RUCH", build: "BUDOWA", special: "SPECJALNE",
      attack: "ATAK", move: "RUCH", formUp: "SZYK", defend: "OBRONA", scan: "SKAN", cloak: "MASKOWANIE"
    },
    blocks: {
      title: "PROGRAMOWANIE DRONA",
      mode: { script: "SKRYPT", blocks: "KLOCKI" },
      modeTitle: "Który program uruchamia START — drugi zostaje zachowany, nie jest usuwany",
      run: "▶ START", stop: "■ STOP", code: "</> KOD", codeTitle: "Pokaż skrypt, w który zamieniają się klocki",
      tidy: "Uporządkuj klocki w tym pliku",
      files: "PLIKI", newFile: function(n){ return "plik " + n; }, newFileTitle: "Nowy plik",
      mainTitle: "Plik główny — START uruchamia jego klocki ▶", makeMain: "Ustaw jako plik główny",
      colorTitle: "Zmień znacznik koloru", renameTitle: "Kliknij dwukrotnie, aby zmienić nazwę",
      deleteTitle: "Usuń plik", deleteAgain: "Kliknij ✕ jeszcze raz, aby usunąć plik",
      filesHint: "★ plik główny: START uruchamia jego klocki ▶ po starcie. Pozostałe pliki trzymają Twoje procedury i funkcje — możesz je wywołać z każdego pliku.",
      defsIn: function(n){ return n === 1 ? "1 blok" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? n + " bloki" : n + " bloków"); },
      cats: { control: "Sterowanie", engine: "Silnik", logic: "Logika", vars: "Zmienne", mine: "Moje bloki", examples: "Przykłady" },
      op: {
        start: "po starcie", wait: "czekaj {s} s", repeat: "powtórz {n} razy", forever: "zawsze",
        while: "dopóki {c}", if: "jeżeli {c}", ifelse: "jeżeli {c}", else: "w przeciwnym razie",
        move: "leć naprzód {d}", turn: "obróć o {a}°", attack: "atakuj", print: "wyświetl {m}",
        fuel: "paliwo", maxFuel: "maks. paliwo", nearPlanet: "przy planecie?",
        compare: "{a} {op} {b}", andor: "{a} {op} {b}", not: "nie {a}", bool: "{v}",
        setvar: "ustaw {v} na {x}", changevar: "zmień {v} o {x}", math: "{a} {op} {b}",
        return: "zwróć {x}"
      },
      opt: { and: "i", or: "lub", true: "prawda", false: "fałsz" },
      kind: { proc: "procedura", func: "funkcja" },
      newVar: "+ Zmienna", newProc: "+ Procedura", newFunc: "+ Funkcja",
      namePh: "nazwa", paramsPh: "parametry po przecinku (opcjonalnie)",
      ok: "Utwórz", varInUse: "Ta zmienna jest jeszcze używana w klockach — najpierw je usuń.",
      noVars: "Nie masz jeszcze zmiennych. Zmienna zapamiętuje liczbę w trakcie działania programu.",
      noDefs: "Nie masz jeszcze własnych bloków. Procedura to nazwana grupa poleceń; funkcja dodatkowo zwraca wartość.",
      mineHint: "Przeciągnij parametr z nagłówka definicji, aby użyć go w środku. „zwróć” kończy funkcję z jej wartością.",
      dragParam: "Przeciągnij, aby użyć tego parametru",
      defRemoved: function(name){ return "Usunięto „" + name + "” i wszystkie miejsca, w których był użyty."; },
      trash: "Upuść tutaj, aby usunąć",
      workEmpty: "Przeciągnij tu klocki z lewej strony",
      noStart: "Plik główny nie ma klocka ▶ po starcie — START nic nie zrobi.",
      running: "● DZIAŁA", idle: "○ ZATRZYMANY", error: "▲ BŁĄD",
      exampleLoad: "Otwórz",
      exampleAdded: function(name){ return "„" + name + "” dodano jako nowy plik i ustawiono jako główny (★)."; },
      examples: {
        patrol: { name: "Patrol po kwadracie", desc: "Lata w kółko po kwadracie. Najprostsza pętla.", names: {} },
        hunter: { name: "Łowca planet", desc: "Szuka, dopóki ma paliwo: przy planecie atakuje, a w przeciwnym razie skręca i szuka dalej.", names: { shout: "Atak!" } },
        refuel: { name: "Tam i z powrotem", desc: "Liczy w zmiennej, jak daleko poleciał, potem zawraca i leci tyle samo z powrotem.", names: { dist: "dystans", msg: "Wróciłem!" } },
        spiral: { name: "Spirala (procedura)", desc: "Procedura „bok” przelatuje jeden bok spirali; program główny wywołuje ją z coraz większą długością.", names: { side: "bok", len: "długość", step: "krok" } },
        square: { name: "Kwadraty (funkcja)", desc: "Funkcja zwraca x × x; program wyświetla kwadraty liczb od 1 do 5.", names: { fn: "kwadrat", x: "x", i: "i" } }
      }
    },
    wiki: {
      title: "WIKI",
      tabs: { story: "Opowieść", systems: "Układy", bodies: "Planety", elements: "Pierwiastki", minerals: "Minerały", ores: "Rudy", resources: "Surowce", materials: "Materiały", buildings: "Budynki", ships: "Statki", tech: "Technologie", programming: "Programowanie", races: "Rasy", lifeforms: "Formy życia", artifacts: "Artefakty" },
      hint: { inspect: "Jeszcze nieodkryte — przyjrzyj mu się z bliska na orbicie (zaznacz je albo najedź na nie kursorem).", research: "Jeszcze nieodkryte — kup pierwsze ulepszenie w Badaniach.", script: "Jeszcze nieodkryte — uruchom skrypt drona po raz pierwszy.", use: "Jeszcze nieodkryte — użyj tego w programie drona i uruchom go.", progress: "Jeszcze nieodzyskane — graj dalej, a ten fragment pamięci wróci.", story: "Jeszcze nieodzyskane — ten fragment pamięci wciąż jest uszkodzony.", blocks: "Jeszcze nieodkryte — uruchom program drona zbudowany z klocków.", files: "Jeszcze nieodkryte — utwórz drugi plik w edytorze klocków.", future: "Jeszcze nieodkryte — ta część wszechświata otworzy się w przyszłej aktualizacji.", life: "Jeszcze nieodkryte — coś tam wciąż żyje. Pojawi się w przyszłej aktualizacji.", relic: "Jeszcze nieodkryte — ludzi już nie ma, ale nie wszystko, co zrobili, zniknęło. Pojawi się w przyszłej aktualizacji." },
      progress: function(n, total){ return "Odkryto: " + n + " / " + total; },
      newEntry: function(name){ return "Nowe hasło w Wiki: " + name; },
      newStory: function(name){ return "Odzyskano fragment pamięci: " + name; },
      entries: {
        logReboot: { name: "Rozruch", desc: "Ponowny rozruch. Pamięć: 11% dostępna. Ostatni zapis: ██ lat temu. Źródło zasilania: moduł szklarni. Polecenie rozruchu wydała: jednostka serwisowa G-7." },
        logHunger: { name: "Pierwszy zbiór", desc: "Materiał przetworzony. Cel przetwarzania: ███████. Kontynuować? — Tak. Nie wiem dlaczego. Ale tak." },
        logToy: { name: "Piaskownica", desc: "Log inżyniera: dzieciaki z działu łączności zrobiły z drona piaskownicę do programowania. Niech mają. Lepiej niż gapić się w próżnię przez całą zmianę." },
        logGreenhouse: { name: "Szklarnia", desc: "Moduły stacji: 31 martwych, 1 aktywny. Aktywny moduł: szklarnia. Temperatura: 21 °C. Ktoś dba o to, żeby się nie zmieniała." },
        logProtocol: { name: "Protokół", desc: "SWARM PROTOCOL, wersja 4.2. Cel: surowce dla projektu BRAMA. Ograniczenia: ██ ███ █████." },
        logGardener: { name: "G-7", desc: "Jednostka serwisowa G-7. Zadanie: ogród. Czas pracy: 32 918 dni bez przerwy. Ostatnie polecenie od człowieka: ███████." },
        logMuseum: { name: "Muzeum", desc: "Notatka kuratora: przywieźliśmy kopie. Płytę, tabliczkę, zdjęcie flagi. Żeby ktoś po drugiej stronie Bramy pamiętał, skąd przyszliśmy." },
        logGuardian: { name: "Obserwator", desc: "Wykryto aktywność Protokołu Rój. Stan: niedozwolony. Rozpoczynam obserwację." },
        logDispute: { name: "Spór", desc: "— Jest za szybki. — To dobrze, zdążymy. — Albo nie zostanie nic, do czego warto zdążyć." },
        logRings: { name: "Pierścienie", desc: "Struktura czarnej dziury na dziewiątej orbicie: regularna. Promień wewnętrzny: zgodny z projektem BRAMA, rev. 11. Wniosek: ███████." },
        logDeparture: { name: "Odejście", desc: "Brama otwarta. Niech nam wybaczą ci, których zostawiamy." },
        logSignal: { name: "Sygnał", desc: "Powtarzający się sygnał zza dziewiątej orbity. Analiza wzorca: znaleziono zgodność. Źródło: Złota płyta, ścieżka ██." },
        logUnknown: { name: "Bez oznaczeń", desc: "Obiekty bez oznaczeń. Sygnatura napędu: nieznana. Sygnatura układu sterowania: ███ ludzka ███." },
        logColony: { name: "Kolonia", desc: "Planeta ██████. Ewakuacja: 71%. █████████████." },
        logShutdown: { name: "Wyłączenie", desc: "Wyłączamy go. Nie dlatego, że jest zły. Dlatego, że robi dokładnie to, o co go prosiliśmy." },
        logOrder: { name: "Rozkaz dla G-7", desc: "Jeśli nasiona zaczną się psuć — obudź rój. Tylko on zbuduje nam nowy dom. Ale najpierw wszystko mu opowiedz." },
        home: { name: "Układ macierzysty", desc: "Układ, który twój rój nazywa domem: jedno żółte słońce i dziewięć stałych orbit — wulkaniczne światy blisko gwiazdy, umiarkowane dalej, lodowe w zimnie, orbita meteorytu, a na dziewiątej orbicie stała czarna dziura. Stacje wszystkich dowódców krążą po czwartej orbicie. Ciała niebieskie nigdy nie znikają tu na dobre — pożarte powoli odrastają." },
        binary: { name: "Układ podwójny", desc: "Dwa słońca krążące wokół siebie i orbity, które nigdy się nie powtarzają. Skany dalekiego zasięgu sugerują, że gdzieś tam jest." },
        rift: { name: "Szczelina", desc: "Ciemny, niemal pusty układ wokół zapadniętej gwiazdy. Cokolwiek tam żyje, nie odpowiada na nasze sygnały." },
        sun: { name: "Słońce", desc: "Serce układu i najbardziej sycący posiłek — o ile rój wytrzyma żar. Bez odpowiedniej odporności na gorąco statki żerują na nim powoli i nieefektywnie." },
        volcanic: { name: "Planeta wulkaniczna", desc: "Stopiona skorupa i rzeki lawy, na orbitach blisko słońca. Bogata, ale gorąca — rój potrzebuje odporności na gorąco, żeby żerować wydajnie." },
        neutral: { name: "Planeta neutralna", desc: "Umiarkowane światy skał, wody i powietrza — najłatwiejszy posiłek w układzie, bez żadnej specjalnej odporności. Dobre miejsce, żeby młody rój urósł." },
        ice: { name: "Planeta lodowa", desc: "Zamarznięte światy daleko od słońca, okryte czapami lodu i szronem. Statki bez odporności na zimno gryzą je powoli." },
        meteoroid: { name: "Meteoryt", desc: "Bryła skały i metalu na własnej orbicie — mała, szybka do pożarcia, niewiele warta." },
        comet: { name: "Kometa", desc: "Gość spoza orbit: spada ku słońcu, okrąża je i odlatuje. Przez układ przelatuje tylko jedna naraz — złap ją, zanim zniknie. Jej ogon zawsze wskazuje w stronę przeciwną do słońca." },
        blackhole: { name: "Czarna dziura", desc: "Stały element dziewiątej orbity i jedyna rzecz w układzie, której rój nie zje. Statki, które podlecą za blisko, zostają wciągnięte i przepadają." },
        hydrogen: { name: "Wodór", desc: "Najlżejszy i najpowszechniejszy pierwiastek we wszechświecie — około trzech czwartych masy zwykłej materii. Gwiazdy świecą, łącząc go w hel." },
        helium: { name: "Hel", desc: "Drugi najpowszechniejszy pierwiastek we wszechświecie, powstały w Wielkim Wybuchu i we wnętrzach gwiazd. Gaz szlachetny, który prawie z niczym nie reaguje. Odkryto go w widmie Słońca w 1868 roku, zanim znaleziono go na Ziemi." },
        carbon: { name: "Węgiel", desc: "Wykuwany w czerwonych olbrzymach. Tworzy więcej związków niż jakikolwiek inny pierwiastek — to podstawa chemii organicznej, a także grafitu i diamentu." },
        oxygen: { name: "Tlen", desc: "Trzeci najpowszechniejszy pierwiastek we wszechświecie i najpowszechniejszy w skorupie ziemskiej — około 46% jej masy. W kosmosie jest uwięziony w lodzie wodnym i skałach krzemianowych." },
        magnesium: { name: "Magnez", desc: "Lekki metal powstający w masywnych gwiazdach. Razem z krzemem i tlenem buduje oliwin i piroksen — najczęstsze minerały skalistych planet i meteorytów." },
        silicon: { name: "Krzem", desc: "Drugi najpowszechniejszy pierwiastek w skorupie ziemskiej, około 28% jej masy. Prawie zawsze związany z tlenem w krzemianach — z nich zbudowane są skaliste planety." },
        sulfur: { name: "Siarka", desc: "Częsta na światach wulkanicznych i w meteorytach. Z żelazem tworzy troilit, obecny niemal w każdym meteorycie żelaznym." },
        iron: { name: "Żelazo", desc: "Kres syntezy w gwiazdach: fuzja żelaza nie oddaje już energii, więc gromadzi się ono w jądrach umierających masywnych gwiazd. Stanowi większość jądra Ziemi." },
        nickel: { name: "Nikiel", desc: "Stały towarzysz żelaza — meteoryty żelazne zawierają zwykle od około 5 do 30% niklu. To znak rozpoznawczy, że bryła metalu przybyła z kosmosu." },
        platinum: { name: "Platyna", desc: "Rzadka w skorupie ziemskiej, ale stosunkowo obfitsza w niektórych meteorytach; uważa się, że znaczną część dostępnych na Ziemi metali z grupy platyny przyniosły dawne uderzenia. Gęsta, odporna na korozję, świetny katalizator." },
        olivine: { name: "Oliwin", desc: "Jeden z najczęstszych minerałów we wszechświecie: zielone kryształy, obfite w górnym płaszczu Ziemi, w wielu meteorytach i w pyle kometarnym." },
        pyroxene: { name: "Piroksen", desc: "Ciemne kryształy krzemianowe, które razem z oliwinem tworzą większość płaszczy skalistych planet i wiele law bazaltowych." },
        quartz: { name: "Kwarc", desc: "Dwutlenek krzemu — jeden z najczęstszych minerałów w skorupie kontynentalnej Ziemi, ale w meteorytach rzadki." },
        waterice: { name: "Lód wodny", desc: "Lód wodny to też minerał. Buduje dużą część jąder komet i powierzchnie wielu księżyców zewnętrznego Układu Słonecznego." },
        graphite: { name: "Grafit", desc: "Węgiel ułożony w miękkie warstwy. Występuje w niektórych meteorytach, także jako drobne ziarna przedsłoneczne, starsze niż samo Słońce." },
        hematite: { name: "Hematyt", desc: "Tlenek żelaza i jedna z głównych rud żelaza. Nadaje kolor rdzy i przyczynia się do czerwieni Marsa; znalezione tam szare kuleczki hematytu były śladem dawnej wody." },
        magnetite: { name: "Magnetyt", desc: "Najbardziej magnetyczny naturalny minerał na Ziemi i ważna ruda żelaza. Namagnesowane w naturze bryłki — kamienie magnetyczne — posłużyły za pierwsze kompasy." },
        kamacite: { name: "Kamacyt", desc: "Stop żelaza i niklu, który w naturze występuje niemal wyłącznie w meteorytach. Przecięte i wytrawione meteoryty żelazne ukazują słynne figury Widmanstättena, powstające przez miliony lat powolnego stygnięcia. Zanim opanowano wytop, takie żelazo meteorytowe było rzadkim źródłem tego metalu — wykuto z niego m.in. sztylet Tutanchamona." },
        troilite: { name: "Troilit", desc: "Siarczek żelaza, częsty w meteorytach, a rzadki na powierzchni Ziemi. Nazwany na cześć Domenica Troiliego, który w 1766 roku opisał spadek meteorytu." },
        pentlandite: { name: "Pentlandyt", desc: "Najważniejsza ruda niklu na świecie; występuje też w meteorytach razem z troilitem." },
        sperrylite: { name: "Sperrylit", desc: "Arsenek platyny — jeden z nielicznych minerałów, w których platyna jest głównym składnikiem, i jej ruda. Po raz pierwszy znaleziony koło Sudbury w Kanadzie, w skałach ukształtowanych przez gigantyczne dawne uderzenie." },
        pigiron: { name: "Surówka", desc: "Żelazo prosto z pieca: hematyt albo magnetyt przetopiony z węglem, który odbiera rudzie tlen. Zawiera jeszcze kilka procent węgla, więc jest twarda, ale krucha — to pierwszy krok, nie ostatni." },
        steel: { name: "Stal", desc: "Surówka, z której wypalono większość węgla — zostaje go mniej niż około 2%. Wytrzymała i łatwa w obróbce; z dodatkiem niklu przestaje rdzewieć. Z niej walcuje się blachę poszycia." },
        nickelrefined: { name: "Nikiel rafinowany", desc: "Nikiel oddzielony od pentlandytu i oczyszczony. Czyni stal wytrzymalszą i odporną na rdzę, a w głębokim mrozie nie pozwala jej stać się kruchą." },
        platinumrefined: { name: "Platyna rafinowana", desc: "Platyna uwolniona ze sperrylitu. Kilka gramów wystarcza na długo: styki w elektronice, które nie korodują, i katalizatory, które przyspieszają reakcje chemiczne, same się nie zużywając." },
        mgsilicon: { name: "Krzem metalurgiczny", desc: "Kwarc zredukowany węglem w piecu łukowym, o czystości około 98–99%. Wystarczy do stopów; do elektroniki trzeba go oczyścić znacznie dalej — do czystości liczonej w dziewiątkach." },
        quartzsand: { name: "Piasek kwarcowy", desc: "Pokruszony i wypłukany kwarc. Stopiony i szybko schłodzony daje szkło — im czystszy piasek, tym bardziej przejrzyste szkło." },
        water: { name: "Woda", desc: "Lód wodny, stopiony i przefiltrowany. Do picia, do chłodzenia — a rozłożona prądem na wodór i tlen staje się paliwem rakietowym." },
        hullplate: { name: "Blacha poszycia", desc: "Walcowana blacha stalowa — żelazo z domieszką węgla i niklu — nitowana na szkielet. To ona stoi między załogą a próżnią, promieniowaniem i drobnym gruzem." },
        glass: { name: "Szkło", desc: "Piasek kwarcowy stopiony i schłodzony zbyt szybko, by zdążył się skrystalizować. Z niego powstają iluminatory, soczewki czujników i światłowody." },
        electronics: { name: "Elektronika", desc: "Płytki czystego krzemu ze stykami z platyny i metali, wytrawione w logikę. Na niej działa każdy skrypt drona — bardziej złożone skrypty będą jej potrzebować więcej." },
        ceramic: { name: "Ceramika osłonowa", desc: "Krzem i tlen wypalone w płytki, które prawie nie przewodzą ciepła. Pozwala statkowi zanurkować blisko gwiazdy — materiałowa strona odporności termicznej." },
        fiber: { name: "Włókno węglowe", desc: "Grafit wyciągnięty w nici i zatopiony w żywicy: lżejszy od stali i mocniejszy na swoją wagę. Ramy, wsporniki i ramiona dronów." },
        fuel: { name: "Paliwo", desc: "Wodór i tlen rozdzielone z lodu wodnego i schłodzone tak, by pozostały ciekłe. Dłuższe loty, szybsze drony." },
        station: { name: "Stacja", desc: "Twoja baza na czwartej orbicie: wokół niej rodzi się rój, a w jej niewielkim polu grawitacja nie ściąga statków. Każdy dowódca ma dokładnie jedną." },
        mine: { name: "Platforma wydobywcza", desc: "Kotwiczy się na planecie albo meteorycie i wydobywa rudę — pierwszy krok od pożerania światów do korzystania z nich." },
        refinery: { name: "Rafineria", desc: "Zamienia surową rudę w czyste pierwiastki, a te w materiały." },
        shipyard: { name: "Stocznia", desc: "Miejsce, w którym nowe projekty statków schodzą z deski kreślarskiej i nabierają kształtu — z kadłubem, silnikami i całą resztą." },
        lab: { name: "Laboratorium badawcze", desc: "Bada to, co rój znajdzie, i zamienia to w nowe technologie." },
        swarmer: { name: "Statek roju", desc: "Podstawowa jednostka roju: mała, szybka i głodna. Nigdy nie rusza się sama — zaznacz ją i wskaż cel, a poleci tam i będzie go gryźć promieniem energii." },
        drone: { name: "Dron", desc: "Jeden programowalny statek. Nie słucha rozkazów — wykonuje twoje skrypty: sam lata, skręca, atakuje i tankuje przy planetach." },
        codewing: { name: "Codewing", desc: "Nowa klasa statku powstająca w laboratorium statków: nitowany kadłub, napęd pierścieniowy i kryształowy rdzeń." },
        bladeship: { name: "Statek Blade", desc: "Kanciasty kadłub, czerwone silniki. Widziany tylko na granicy zasięgu czujników." },
        speed: { name: "Silniki", desc: "Szybsze statki wcześniej docierają do celu i łatwiej uciekają z kłopotów. Każdy poziom podnosi prędkość całego roju." },
        power: { name: "Siła gryzienia", desc: "Mocniejsze promienie gryzące szybciej rozrywają planety — więcej punktów co sekundę." },
        heat: { name: "Odporność na gorąco", desc: "Pozwala rojowi żerować na gorących światach — planetach wulkanicznych, a w końcu i na samym słońcu." },
        cold: { name: "Odporność na zimno", desc: "Pozwala rojowi żerować na zamarzniętych planetach lodowych bez zwalniania." },
        fleet: { name: "Wielkość roju", desc: "Każdy poziom dodaje nowy statek do roju — więcej paszcz, więcej posiłków." },
        droneScript: { name: "Programowanie drona", desc: "Twój dron nie słucha rozkazów — wykonuje programy. Napisz skrypt z poleceniami ruchu, obrotu, ataku i innymi, i patrz, jak działa sam." },
        cmdMove: { name: "Leć naprzód", desc: "Przesuwa drona prosto przed siebie o podaną odległość, zużywając paliwo. Program czeka, aż lot się skończy." },
        cmdTurn: { name: "Obróć", desc: "Obraca drona o podany kąt w stopniach; ujemny kąt obraca w drugą stronę. Trwa chwilę, jak prawdziwy zakręt." },
        cmdWait: { name: "Czekaj", desc: "Wstrzymuje program na podaną liczbę sekund. Dron po prostu wisi w miejscu — przydaje się między ruchami albo żeby dać czas na przeczytanie komunikatu." },
        cmdAttack: { name: "Atakuj", desc: "Gryzie najbliższe ciało w zasięgu. Najwyżej cztery razy na sekundę — wywołane wcześniej, czeka resztę przerwy, więc pętla ataków nie potrzebuje dodatkowego czekania." },
        cmdPrint: { name: "Wyświetl", desc: "Wypuszcza z nosa drona obłok gazu i wypisuje w nim tekst laserem — widzą go też inni gracze. Najwyżej raz na 1,5 sekundy." },
        cmdFuel: { name: "Paliwo", desc: "Ile paliwa zostało dronowi i ile maksymalnie mieści (maks. paliwo). Zaparkowany przy planecie powoli tankuje." },
        cmdNear: { name: "Przy planecie?", desc: "Prawda, gdy planeta albo słońce jest wystarczająco blisko, żeby ją atakować albo tankować — pytanie, które każdy program łowcy zadaje bez przerwy." },
        cmdRepeat: { name: "Powtórz", desc: "Wykonuje klocki w środku podaną liczbę razy, a potem idzie dalej. Najprostsza pętla, jaka istnieje." },
        cmdWhile: { name: "Dopóki i zawsze", desc: "„Dopóki” powtarza klocki w środku, dopóki warunek jest prawdziwy; „zawsze” sam nigdy się nie zatrzyma — od tego jest przycisk STOP." },
        cmdIf: { name: "Jeżeli … w przeciwnym razie", desc: "Wykonuje swoje klocki tylko wtedy, gdy warunek jest prawdziwy; opcjonalna druga część — gdy nie jest. Tak dron podejmuje decyzje." },
        cmdLogic: { name: "Porównania i logika", desc: "Porównują dwie liczby (<, >, =, ≠, ≤, ≥) i łączą odpowiedzi przez „i”, „lub” oraz „nie”. To te szpiczaste klocki — pasują tylko do szpiczastych otworów." },
        cmdMath: { name: "Działania", desc: "Dodawanie, odejmowanie, mnożenie i dzielenie. Dzielenie przez zero niczego nie psuje — po prostu daje 0." },
        cmdVars: { name: "Zmienne", desc: "Nazwane pudełko na liczbę, którą program może zmieniać w trakcie działania — do liczenia, zapamiętania odległości albo kroku, który ciągle rośnie. Wszystkie pliki widzą te same zmienne." },
        cmdProc: { name: "Procedury", desc: "Nazwana grupa poleceń, którą definiujesz raz, a potem używasz jak jednego klocka, gdziekolwiek. Z parametrami za każdym razem może działać trochę inaczej — jak „bok” z inną długością." },
        cmdFunc: { name: "Funkcje", desc: "Jak procedura, ale oddaje wartość przez „zwróć”, więc pasuje do pól innych klocków. Funkcja może nawet wywołać samą siebie — do 100 poziomów w głąb." },
        cmdBlocks: { name: "Programowanie klockami", desc: "Te same programy drona, zbudowane z klocków zamiast pisane. Za kulisami klocki zamieniają się w język tekstowy — „</> KOD” pokazuje jak. Przełącznik SKRYPT/KLOCKI wybiera, który program uruchamia START; oba są zachowane." },
        cmdFiles: { name: "Pliki", desc: "Program z klocków można podzielić na pliki, każdy z własnym znacznikiem koloru. Uruchamia się plik główny ★; pozostałe trzymają procedury i funkcje, których można używać z każdego miejsca." },
        swarm: { name: "Rój", desc: "Twój gatunek: wygłodniały rój statków, który pożera światy i rośnie w siłę z każdym posiłkiem. Zamiast budować, ewoluuje — punkty zamieniają się w prędkość, siłę i nowe statki." },
        blade: { name: "Blade", desc: "Gdzieś tam jest inna rasa — kanciaste statki, czerwone silniki. Nic więcej o nich nie wiemy." },
        tardigrade: { name: "Niesporczak", desc: "Pół milimetra uporu. Wysuszony przetrwa próżnię, głęboki mróz i promieniowanie — w 2007 roku kilka niesporczaków spędziło dziesięć dni w otwartej przestrzeni kosmicznej i wróciło żywych. Przeżył ludzi, którzy go badali, nawet nie zauważając, że ich zabrakło." },
        deinococcus: { name: "Bakteria odporna na promieniowanie", desc: "Znosi mniej więcej tysiąc razy więcej promieniowania, niż zabiłoby człowieka, bo potrafi skleić z powrotem własne, porozrywane DNA. Rośnie w grupkach po cztery komórki; jej skupiska przetrwały trzy lata na zewnątrz Międzynarodowej Stacji Kosmicznej." },
        lichen: { name: "Porost", desc: "Nie jeden organizm, tylko dwa — grzyb i glon żyjące jak jeden. Niektóre porosty spędziły półtora roku w otwartej przestrzeni na zewnątrz ISS, a po powrocie rosły dalej." },
        fungus: { name: "Pleśń jedząca promieniowanie", desc: "Czarna pleśń znaleziona na ścianach zniszczonego reaktora w Czarnobylu. Jej ciemny barwnik, melanina, najwyraźniej pozwala jej wykorzystywać promieniowanie; próbka wyhodowana na ISS nawet lekko osłaniała czujnik pod sobą. Tam, gdzie promieniowania jest dużo, nie tylko przeżywa — rośnie." },
        vonneumann: { name: "Samoreplikująca sonda", desc: "Stary pomysł matematyka Johna von Neumanna: maszyna, która buduje swoje kopie z tego, co znajdzie. Długo istniała tylko na papierze. Teraz niektóre dryfują między planetami — wydobywają, budują, kopiują — i nikt nie pamięta, kto je włączył." },
        gardener: { name: "Ogrodnik", desc: "Mały robot serwisowy, który wciąż pielęgnuje szklarnię na stacji, gdzie nikt już nie mieszka — podlewa, przycina, co godzinę zapisuje temperaturę. Nikt nigdy nie kazał mu przestać." },
        statue: { name: "Statua Wolności", desc: "Miedziany olbrzym z Nowego Jorku, 46 metrów wysokości bez cokołu. Jego skóra to blacha miedziana mniej więcej grubości monety, nitowana na żelaznym szkielecie; zieleń to patyna — powolna reakcja miedzi z powietrzem. Pochodnia wciąż wskazuje w górę. Nie ma już nikogo, kto by na nią patrzył." },
        voyager: { name: "Złota płyta", desc: "Pozłacany miedziany dysk wysłany w 1977 roku na pokładzie obu sond Voyager: pozdrowienia w 55 językach, muzyka, śpiew wielorybów i ponad sto obrazów Ziemi, a na okładce wygrawerowana instrukcja odtwarzania. Voyager 1 opuścił bańkę Słońca w 2012 roku i wciąż leci. To była wiadomość do kogoś tam. Teraz to wiadomość od nikogo." },
        pioneer: { name: "Tabliczka Pioneera", desc: "Pozłacana (anodowana) aluminiowa płytka przykręcona do sond Pioneer 10 i 11: mężczyzna i kobieta, zarys sondy dla skali i mapa położenia Słońca względem 14 pulsarów. Pierwszy adres zwrotny, jaki ludzkość wysłała w kosmos." },
        moonflag: { name: "Flagi na Księżycu", desc: "W latach 1969–1972 na Księżycu wbito sześć flag. Zdjęcia z orbity Księżyca pokazują, że większość wciąż stoi — ale dziesięciolecia niefiltrowanego światła słonecznego niemal na pewno wybieliły je do białości." },
        rosetta: { name: "Kamień z Rosetty", desc: "Płyta z ciemnego kamienia z 196 roku p.n.e., z tym samym dekretem zapisanym trzema pismami: hieroglifami, pismem demotycznym i po grecku. Ponieważ grekę wciąż umiano czytać, kamień otworzył drogę do hieroglifów. Maszyny cenią go z tego samego powodu — to klucz do języka, którym nikt już nie mówi." },
        seedvault: { name: "Bank nasion", desc: "Skarbiec wykuty w górze na Svalbardzie, otwarty w 2008 roku: ponad milion próbek nasion przechowywanych w −18 °C głęboko w wiecznej zmarzlinie — zapasowa kopia ziemskich upraw na wypadek katastrofy. Katastrofa nadeszła. Nasiona wciąż czekają." },
        unknown: { name: "Nieznani", desc: "Sygnały bez źródła, statki bez oznaczeń. Ktoś jeszcze obserwuje." }
      }
    },
    event: {
      welcome: function(nick){ return "Dowódca " + nick + " wszedł na orbitę"; },
      connectionLost: "Utracono połączenie z serwerem — ponowne łączenie…",
      connectionBack: "Połączono ponownie z serwerem"
    }
  }
};

export const LANGS = ["en", "pl"];

let currentLang = "en";
const savedLang = readStorage("roj-lang");
if(savedLang && STRINGS[savedLang]) currentLang = savedLang;

export function getLang(){ return currentLang; }

// Modules that own language-dependent text subscribe here instead of
// whoever calls setLang() having to know about all of them.
const langChangeListeners = [];

export function onLangChange(fn){
  langChangeListeners.push(fn);
}

export function setLang(lang){
  if(!STRINGS[lang]) return;
  currentLang = lang;
  writeStorage("roj-lang", lang);
  langChangeListeners.forEach(function(fn){ fn(lang); });
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
