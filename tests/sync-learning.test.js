// 云端同步纯逻辑测试不依赖云数据库，便于本地快速回归。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeLearningRecord,
  validateSummary,
} = require('../cloudfunctions/sync-learning/learning-rules');

test('正确答案累加正确次数并清除错词状态', () => {
  const merged = mergeLearningRecord(
    { correctCount: 1, wrongCount: 2 },
    { isCorrect: true, mode: 'quiz' },
  );
  assert.equal(merged.correctCount, 2);
  assert.equal(merged.wrongCount, 2);
  assert.equal(merged.isWrongWord, false);
});

test('错误答案累加错误次数并进入错词', () => {
  const merged = mergeLearningRecord(
    {},
    { isCorrect: false, mode: 'flashcard' },
  );
  assert.equal(merged.wrongCount, 1);
  assert.equal(merged.isWrongWord, true);
});

test('拒绝缺少 roundId 或非法模式的同步数据', () => {
  assert.throws(() => validateSummary({ answers: [] }), /roundId/);
  assert.throws(
    () => validateSummary({
      roundId: 'r1',
      total: 1,
      score: 0,
      answers: [{ wordId: 'w1', isCorrect: false, mode: 'other' }],
    }),
    /学习模式无效/,
  );
});
