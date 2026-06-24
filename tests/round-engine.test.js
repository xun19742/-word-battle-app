// 轮次引擎测试覆盖抽题、选项、计分、翻页和总结。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRound,
  createQuizOptions,
  answerCurrent,
  nextQuestion,
  getSummary,
} = require('../miniprogram/utils/round-engine');

const words = Array.from({ length: 10 }, (_, index) => ({
  id: `w${index + 1}`,
  word: `word${index + 1}`,
  meaning: `释义${index + 1}`,
}));

test('创建固定数量且无重复的学习轮次', () => {
  const round = createRound(words, 10, 'quiz', () => 0.5);
  assert.equal(round.items.length, 10);
  assert.equal(new Set(round.items.map((item) => item.id)).size, 10);
  assert.equal(round.mode, 'quiz');
});

test('四选一包含唯一正确答案和四个不重复选项', () => {
  const options = createQuizOptions(words[0], words, () => 0.5);
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.equal(options.filter((item) => item === words[0].meaning).length, 1);
});

test('同一道题只能计分一次', () => {
  let round = createRound(words, 10, 'flashcard', () => 0.5);
  round = answerCurrent(round, true);
  const repeated = answerCurrent(round, true);
  assert.equal(repeated.correctCount, 1);
  assert.equal(getSummary(repeated).score, 10);
});

test('最后一题完成后生成准确总结', () => {
  let round = createRound(words, 1, 'flashcard', () => 0.5);
  round = answerCurrent(round, false);
  round = nextQuestion(round);
  const summary = getSummary(round);
  assert.equal(round.completed, true);
  assert.equal(summary.wrongCount, 1);
  assert.equal(summary.accuracy, 0);
});

test('干扰项不足时拒绝生成重复选项', () => {
  assert.throws(
    () => createQuizOptions(words[0], words.slice(0, 3), () => 0.5),
    /四选一干扰项不足/,
  );
});

test('轮次和总结携带词书与学习类型', () => {
  const round = createRound(words, 10, 'flashcard', () => 0.5, {
    wordbookId: 'ielts',
    studyType: 'review',
  });
  const summary = getSummary(round);
  assert.equal(round.wordbookId, 'ielts');
  assert.equal(round.studyType, 'review');
  assert.equal(summary.wordbookId, 'ielts');
  assert.equal(summary.studyType, 'review');
});

test('旧调用回落到兼容词书和新词类型', () => {
  const round = createRound(words, 1, 'flashcard', () => 0.5);
  assert.equal(round.wordbookId, 'cet4-core-100');
  assert.equal(round.studyType, 'new');
  assert.throws(
    () => createRound([...words, { id: 'w11' }], 11, 'flashcard'),
    /每轮单词数无效/,
  );
});
