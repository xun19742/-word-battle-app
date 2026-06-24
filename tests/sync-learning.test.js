// 云端同步纯逻辑测试不依赖云数据库，便于本地快速回归。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('同步数据标准化词书和学习类型并兼容旧轮次', () => {
  const normalized = validateSummary({
    roundId: 'r1',
    wordbookId: 'ielts',
    studyType: 'review',
    total: 1,
    score: 10,
    answers: [{ wordId: 'w1', isCorrect: true, mode: 'quiz' }],
  });
  assert.equal(normalized.wordbookId, 'ielts');
  assert.equal(normalized.studyType, 'review');

  const legacy = validateSummary({
    roundId: 'legacy-1',
    total: 1,
    score: 0,
    answers: [{ wordId: 'w1', isCorrect: false, mode: 'flashcard' }],
  });
  assert.equal(legacy.wordbookId, 'cet4-core-100');
  assert.equal(legacy.studyType, 'new');
});

test('同步数据拒绝非法词书和学习类型', () => {
  const base = {
    roundId: 'r1',
    total: 1,
    score: 0,
    answers: [{ wordId: 'w1', isCorrect: false, mode: 'flashcard' }],
  };
  assert.throws(
    () => validateSummary({ ...base, wordbookId: 'missing' }),
    /词书无效/,
  );
  assert.throws(
    () => validateSummary({ ...base, studyType: 'wrong' }),
    /学习类型无效/,
  );
});

test('云同步记录按词书隔离并写入学习类型', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'sync-learning', 'index.js'),
    'utf8',
  );
  assert.match(source, /\$\{OPENID\}_\$\{summary\.wordbookId\}_\$\{answer\.wordId\}/);
  assert.match(source, /wordbookId:\s*summary\.wordbookId/);
  assert.match(source, /studyType:\s*summary\.studyType/);
  assert.doesNotMatch(source, /wordbookId:\s*'cet4-core-100'/);
});
