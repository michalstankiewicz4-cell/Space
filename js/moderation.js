// Lightweight nickname profanity filter. Two call sites use it (see
// net/identity.js and net/shipsBroadcast.js): rejecting the player's own
// nick at confirm time is just a courtesy (an edited/malicious client can
// always broadcast a raw nick straight over the WebSocket, bypassing this
// entirely — see the "Broadcast has no server-side validation" note in
// shipsBroadcast.js), so remote nicks are ALSO re-checked and masked before
// display. That's the real defense; the input-side check just saves honest
// players from an avoidable rejection surprise.
//
// Substring matching on a normalized (lowercased, leetspeak-folded,
// non-letters-stripped) string is deliberately simple, not moderation-grade
// — it will have false positives on some innocent words that happen to
// contain a blocked substring, which is an acceptable tradeoff for a game
// nickname field. Covers common English and Polish profanity/slurs.
const BLOCKLIST = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "piss",
  "slut", "whore", "nigger", "nigga", "faggot", "fag", "retard", "rape",
  "kurwa", "chuj", "jebac", "jebać", "pierdol", "spierdal", "pizda",
  "suka", "cipa", "dziwka", "skurwysyn", "huj", "kutas", "pojeb"
];

function normalize(text){
  return String(text || "")
    .toLowerCase()
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
    .replace(/@/g, "a").replace(/\$/g, "s")
    .replace(/[^a-ząćęłńóśźż]/g, "");
}

export function containsProfanity(text){
  const norm = normalize(text);
  return BLOCKLIST.some(function(word){ return norm.indexOf(word) !== -1; });
}
