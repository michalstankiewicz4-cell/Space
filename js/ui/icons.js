// Line/fill icons for the HUD (24x24 viewBox), drawn with the shared
// gradients in index.html's #uiDefs (gBlueIcon, gGoldIcon, gRedIcon,
// gTealIcon, gSun). Static markup only — never interpolate untrusted data
// into these.
const ICONS = {
  target: (c) => `
    <circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="1.6"/>
    <path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="1.8" fill="${c}"/>`,
  move: () => `
    <path d="M12 2 L21 11 H15.5 V21 H8.5 V11 H3 Z" fill="url(#gBlueIcon)"/>
    <path d="M15.5 17 L20 21 H15.5 Z" fill="#dfe5ff" opacity=".9"/>`,
  formup: (c) => `
    <path d="M4.5 18 L12 6 L19.5 18" fill="none" stroke="${c}" stroke-width="1.8"/>
    <circle cx="12" cy="6" r="3" fill="${c}"/><circle cx="4.5" cy="18" r="3" fill="${c}"/><circle cx="19.5" cy="18" r="3" fill="${c}"/>`,
  shield: (c) => `
    <path d="M12 2 L20 5 V11 C20 16.5 16.5 20 12 22 C7.5 20 4 16.5 4 11 V5 Z" fill="none" stroke="${c}" stroke-width="1.7"/>
    <path d="M12 5 L17 7 V11 C17 14.8 14.8 17.3 12 18.8 Z" fill="${c}"/>`,
  scan: (c) => `
    <circle cx="12" cy="12" r="9" fill="none" stroke="${c}" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="5.5" fill="none" stroke="${c}" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="2" fill="${c}"/>
    <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`,
  scan2: (c) => `
    <circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="1.5"/>
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="2" fill="${c}"/>`,
  cloak: (c) => `
    <circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="1.4"/>
    <path d="M12 6.5 L17.5 12 L12 17.5 L6.5 12 Z" fill="${c}" opacity=".85"/>
    <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="1.6" fill="#000"/>`,
  // Top bar readouts
  points: () => `
    <path d="M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.2 L18.5 21.6 L12 17.6 L5.5 21.6 L7.3 14.2 L1.5 9.2 L9.1 8.6 Z" fill="url(#gGoldIcon)"/>`,
  units: () => `
    <path d="M12 2 L17 16 L12 13.2 L7 16 Z" fill="url(#gBlueIcon)"/>
    <path d="M5 13 L8 21 L5 19.4 L2 21 Z M19 13 L22 21 L19 19.4 L16 21 Z" fill="url(#gBlueIcon)" opacity=".75"/>`,
  planet: () => `
    <circle cx="12" cy="12" r="6.5" fill="url(#gTealIcon)"/>
    <ellipse cx="12" cy="12" rx="11" ry="3.6" fill="none" stroke="url(#gGoldIcon)" stroke-width="1.5" transform="rotate(-18 12 12)"/>`,
  players: () => `
    <circle cx="9" cy="7.5" r="3.6" fill="url(#gBlueIcon)"/>
    <path d="M2 21 C2 15.5 5 13 9 13 C13 13 16 15.5 16 21 Z" fill="url(#gBlueIcon)"/>
    <circle cx="17" cy="8.5" r="2.8" fill="url(#gBlueIcon)" opacity=".7"/>
    <path d="M14.5 14 C18.5 13.5 22 15.5 22 20 H17.5" fill="url(#gBlueIcon)" opacity=".7"/>`,
  // Fleet list cards
  ship: () => `
    <path d="M2 12 L15 7.5 L22 12 L15 16.5 Z" fill="url(#gTealIcon)"/>
    <path d="M6 12 L2.5 8 L9 10.3 Z M6 12 L2.5 16 L9 13.7 Z" fill="#58b8f0" opacity=".8"/>
    <circle cx="16.5" cy="12" r="1.4" fill="#e9fbff"/>`,
  drone: () => `
    <path d="M12 2 L20 12 L12 22 L4 12 Z" fill="url(#gGoldIcon)"/>
    <path d="M12 2 L12 22 M4 12 L20 12" stroke="#7a4a12" stroke-width="1" opacity=".6"/>`,
  camera: () => `
    <path d="M2.5 7.5 H15.5 V17.5 H2.5 Z" fill="none" stroke="url(#gBlueIcon)" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M15.5 10.5 L21.5 7 V18 L15.5 14.5 Z" fill="url(#gGoldIcon)"/>
    <circle cx="9" cy="12.5" r="2.4" fill="url(#gBlueIcon)"/>`,
  // Drone script controls, dev tools
  play: () => `<path d="M6 3 L21 12 L6 21 Z" fill="url(#gGoldIcon)"/>`,
  stop: () => `<rect x="5" y="5" width="14" height="14" rx="2" fill="url(#gRedIcon)"/>`,
  script: () => `
    <path d="M6 2.5 H15 L19 6.5 V21.5 H6 Z" fill="none" stroke="url(#gBlueIcon)" stroke-width="1.7"/>
    <path d="M9 10h7M9 13.5h7M9 17h5" stroke="url(#gBlueIcon)" stroke-width="1.6" stroke-linecap="round"/>`,
  wrench: () => `
    <path d="M14.5 3 A5.5 5.5 0 0 0 9.8 10.6 L3.5 16.9 A2.1 2.1 0 0 0 6.5 19.9 L12.8 13.6 A5.5 5.5 0 0 0 20.4 8.9 L17.2 12.1 L13.6 11.2 L12.7 7.6 L15.9 4.4 A5.5 5.5 0 0 0 14.5 3 Z" fill="url(#gBlueIcon)"/>`,
  // Event log
  evArrive: () => `<path d="M12 1 L22 11 H16 V21 H8 V11 H2 Z" fill="url(#gTealIcon)"/>`,
  evInfo: () => `
    <circle cx="12" cy="12" r="10" fill="#3aa4e8"/>
    <path d="M12 4.5 L13.6 10.4 L19.5 12 L13.6 13.6 L12 19.5 L10.4 13.6 L4.5 12 L10.4 10.4 Z" fill="#031026"/>`,
  evAlert: () => `
    <path d="M12 23 C7 18 3.5 14 3.5 9.5 C3.5 4.8 7.3 1.5 12 1.5 C16.7 1.5 20.5 4.8 20.5 9.5 C20.5 14 17 18 12 23 Z" fill="#e2434d"/>
    <path d="M12 4.5 L13.4 9.6 L17 11 L13.4 12.4 L12 17.5 L10.6 12.4 L7 11 L10.6 9.6 Z" fill="#2a0508"/>`
};

export function svgIcon(name, color){
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name](color || "") + "</svg>";
}

// Fills every `[data-icon]` element under `root` with its icon, once.
// `colors` maps icon name -> stroke/fill for the icons that take one.
export function fillIcons(root, colors, where){
  root.querySelectorAll("[data-icon]").forEach(function(el){
    const name = el.dataset.icon;
    el.insertAdjacentHTML(where || "afterbegin", svgIcon(name, colors && colors[name]));
  });
}
