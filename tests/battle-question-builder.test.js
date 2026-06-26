const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBattleQuestions } = require('../miniprogram/utils/battle-question-builder');

const words = Array.from({ length: 12 }, (_, index) => ({
  id: `word-${index}`,
  word: `word${index}`,
  meaning: `释义${index}`,
}));

function fixedRandom() {
  return 0.01;
}

test('生成十道对战题且每题包含四个不重复选项', () => {
  const questions = buildBattleQuestions(words, fixedRandom);

  assert.equal(questions.length, 10);
  questions.forEach((question) => {
    assert.equal(typeof question.wordId, 'string');
    assert.equal(typeof question.word, 'string');
    assert.equal(typeof question.meaning, 'string');
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options.includes(question.correctOption), true);
    assert.equal(question.correctOption, question.meaning);
  });
});

test('词书干扰项不足时拒绝生成对战题', () => {
  assert.throws(
    () => buildBattleQuestions(words.slice(0, 3), fixedRandom),
    /对战题目数量不足/,
  );
});
