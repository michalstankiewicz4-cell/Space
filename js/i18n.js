import { readStorage, writeStorage } from "./core/utils.js";
import { en } from "./i18n/en.js";
import { pl } from "./i18n/pl.js";

// Minimal i18n: English is the default, Polish is a toggle (Setup ->
// Language). The text itself is one file per language (js/i18n/). t("a.b.c")
// looks up a dotted path in the current language, falling back to English if
// missing. For strings with a variable, the value is a function the caller
// invokes with the argument(s), e.g. t("toast.eaten")(gained).
const STRINGS = { en: en, pl: pl };

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
