// Hangul syllable composition from individual tray pieces.
//
// A block is an ordered list of pieces (compatibility jamo such as "ㅎ", "ㅏ",
// "ㄴ"). Each piece is one item taken from the inventory, so a block always
// knows exactly what to give back. The block's visible character is derived by
// replaying its pieces through the slot rules below; nothing else is stored.

export const CONSONANTS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export const VOWELS = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ",
  "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
export const LETTERS = [...CONSONANTS, ...VOWELS];

// Unicode order of the 19 initials, 21 medials and 27 finals (index 0 = none).
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNG = VOWELS;
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ",
  "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const DOUBLE_INITIAL = { "ㄱㄱ": "ㄲ", "ㄷㄷ": "ㄸ", "ㅂㅂ": "ㅃ", "ㅅㅅ": "ㅆ", "ㅈㅈ": "ㅉ" };
const COMPOUND_FINAL = {
  "ㄱㄱ": "ㄲ", "ㅅㅅ": "ㅆ", "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ",
  "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ",
};
// Vowel joins a keyboard allows. Every result is also in the tray directly.
const VOWEL_JOIN = {
  "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅘㅣ": "ㅙ",
  "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅝㅣ": "ㅞ", "ㅡㅣ": "ㅢ",
};

export const isConsonant = (p) => CONSONANTS.includes(p);
export const isVowel = (p) => VOWELS.includes(p);
export const isLetter = (p) => LETTERS.includes(p);

const EMPTY = Object.freeze({ cho: "", jung: "", jong: "", choN: 0, jungN: 0, jongN: 0 });

// Adds one piece to a slot state. Returns the new state, or null when the
// piece cannot join this block under Korean composition rules.
export function addPiece(state, piece) {
  const s = state || EMPTY;
  if (isConsonant(piece)) {
    if (!s.cho) return { ...s, cho: piece, choN: 1 };
    if (!s.jung) {
      const double = s.choN === 1 && DOUBLE_INITIAL[s.cho + piece];
      return double ? { ...s, cho: double, choN: 2 } : null;
    }
    if (!s.jong) return JONG.includes(piece) ? { ...s, jong: piece, jongN: 1 } : null;
    const compound = s.jongN === 1 && COMPOUND_FINAL[s.jong + piece];
    return compound ? { ...s, jong: compound, jongN: 2 } : null;
  }
  if (isVowel(piece)) {
    if (s.jong) return null;
    if (!s.jung) return { ...s, jung: piece, jungN: 1 };
    const joined = VOWEL_JOIN[s.jung + piece];
    return joined ? { ...s, jung: joined, jungN: s.jungN + 1 } : null;
  }
  return null;
}

// Replays pieces in order. Returns null if any piece is rejected.
export function compose(pieces) {
  let state = EMPTY;
  for (const piece of pieces) {
    state = addPiece(state, piece);
    if (!state) return null;
  }
  return state;
}

export function canAdd(pieces, piece) {
  const state = compose(pieces);
  return Boolean(state && addPiece(state, piece));
}

// The character a slot state shows: a full syllable when it has an initial and
// a medial, otherwise the lone jamo (so "ㅋ" or "ㅏ" can still be written).
export function glyph(state) {
  if (!state) return "";
  if (state.cho && state.jung) {
    const code = 0xac00 + (CHO.indexOf(state.cho) * 21 + JUNG.indexOf(state.jung)) * 28 + JONG.indexOf(state.jong);
    return String.fromCharCode(code);
  }
  return state.cho || state.jung || "";
}

export const blockText = (pieces) => glyph(compose(pieces));

// Whether text is something a block can display: a precomposed syllable or a
// single compatibility jamo (including doubled/compound ones).
export function isBlockGlyph(text) {
  if (typeof text !== "string" || [...text].length !== 1) return false;
  const code = text.charCodeAt(0);
  return (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3131 && code <= 0x3163);
}

// Undo the composition of a syllable into the pieces that build it. Used only
// by tests and the server's sanity check; drafts keep their real pieces.
export function decompose(text) {
  const code = text.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return [text];
  const cho = CHO[Math.floor(code / 588)];
  const jung = JUNG[Math.floor((code % 588) / 28)];
  const jong = JONG[code % 28];
  const split = (map, v) => Object.keys(map).find((k) => map[k] === v);
  const choParts = split(DOUBLE_INITIAL, cho) || cho;
  const jongParts = jong ? split(COMPOUND_FINAL, jong) || jong : "";
  return [...choParts, jung, ...jongParts];
}
