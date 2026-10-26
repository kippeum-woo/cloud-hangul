import assert from "node:assert/strict";
import test from "node:test";
import { blockText, canAdd, compose, CONSONANTS, decompose, LETTERS, VOWELS } from "../src/hangul.js";

test("the tray has 14 consonants and all 21 vowels", () => {
  assert.equal(CONSONANTS.length, 14);
  assert.equal(VOWELS.length, 21);
  assert.equal(new Set(LETTERS).size, 35);
  for (const v of ["ㅔ", "ㅖ", "ㅘ", "ㅢ", "ㅙ", "ㅞ"]) assert.ok(VOWELS.includes(v), v);
});

test("ㅎ + ㅏ + ㄴ forms 한", () => {
  assert.equal(blockText(["ㅎ", "ㅏ", "ㄴ"]), "한");
});

test("syllables with ㅔ, ㅖ, ㅘ, ㅢ and other compound vowels compose", () => {
  assert.equal(blockText(["ㄱ", "ㅔ"]), "게");
  assert.equal(blockText(["ㅇ", "ㅖ"]), "예");
  assert.equal(blockText(["ㅇ", "ㅙ"]), "왜");
  assert.equal(blockText(["ㅇ", "ㅢ"]), "의");
  assert.equal(blockText(["ㄱ", "ㅘ"]), "과");
  assert.equal(blockText(["ㅎ", "ㅚ"]), "회");
  assert.equal(blockText(["ㄱ", "ㅞ", "ㄹ"]), "궬");
  assert.equal(blockText(["ㅅ", "ㅒ"]), "섀");
});

test("vowel pieces join into compound vowels", () => {
  assert.equal(blockText(["ㄱ", "ㅗ", "ㅏ"]), "과");
  assert.equal(blockText(["ㅁ", "ㅜ", "ㅓ"]), "뭐");
  assert.equal(blockText(["ㅇ", "ㅡ", "ㅣ"]), "의");
  assert.equal(blockText(["ㅇ", "ㅗ", "ㅐ"]), "왜");
  assert.equal(blockText(["ㅇ", "ㅗ", "ㅏ", "ㅣ"]), "왜");
  assert.equal(blockText(["ㄱ", "ㅜ", "ㅔ"]), "궤");
  assert.equal(blockText(["ㅅ", "ㅜ", "ㅣ"]), "쉬");
  assert.equal(compose(["ㄱ", "ㅏ", "ㅏ"]), null);
  assert.equal(compose(["ㄱ", "ㅗ", "ㅓ"]), null);
});

test("double initials and compound finals", () => {
  assert.equal(blockText(["ㄱ", "ㄱ", "ㅏ"]), "까");
  assert.equal(blockText(["ㅅ", "ㅅ", "ㅏ", "ㄹ"]), "쌀");
  assert.equal(blockText(["ㅂ", "ㅂ", "ㅏ", "ㅇ"]), "빵");
  assert.equal(blockText(["ㄷ", "ㄷ", "ㅏ", "ㄹ", "ㄱ"]), "딹");
  assert.equal(blockText(["ㅇ", "ㅓ", "ㅂ", "ㅅ"]), "없");
  assert.equal(blockText(["ㅇ", "ㅏ", "ㄴ", "ㅎ"]), "않");
  assert.equal(blockText(["ㄷ", "ㅏ", "ㄹ", "ㄱ"]), "닭");
  assert.equal(blockText(["ㅇ", "ㅣ", "ㅅ", "ㅅ"]), "있");
  assert.equal(blockText(["ㅂ", "ㅏ", "ㄱ", "ㄱ"]), "밖");
});

test("invalid combinations are rejected", () => {
  assert.equal(canAdd(["ㄴ"], "ㄴ"), false, "ㄴㄴ is not a double initial");
  assert.equal(canAdd(["ㅎ", "ㅏ", "ㄴ"], "ㅏ"), false, "no vowel after a final");
  assert.equal(canAdd(["ㅎ", "ㅏ", "ㄴ"], "ㄱ"), false, "ㄴㄱ is not a compound final");
  assert.equal(canAdd(["ㄱ", "ㄱ"], "ㄱ"), false);
  assert.equal(canAdd(["ㄱ", "ㅏ", "ㄹ", "ㄱ"], "ㅅ"), false, "at most two final pieces");
  assert.equal(canAdd(["ㄷ", "ㄷ"], "ㅏ"), true);
});

test("a vowel block accepts an initial consonant dropped onto it", () => {
  assert.equal(blockText(["ㅏ", "ㅎ"]), "하");
  assert.equal(blockText(["ㅏ", "ㅎ", "ㄴ"]), "한");
  assert.equal(blockText(["ㅋ"]), "ㅋ");
  assert.equal(blockText(["ㅢ"]), "ㅢ");
});

test("every precomposed syllable is reachable from tray pieces", () => {
  for (let code = 0xac00; code <= 0xd7a3; code++) {
    const ch = String.fromCharCode(code);
    assert.equal(blockText(decompose(ch)), ch, ch);
  }
});
