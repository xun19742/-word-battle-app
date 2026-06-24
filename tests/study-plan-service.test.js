// 学习计划测试保证新词、复习词和每日剩余目标选择正确。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStudyPlan,
  recordKey,
} = require('../miniprogram/services/study-plan-service');

const book = {
  id: 'cet4',
  words: Array.from({ length: 15 }, (_, index) => ({
    id: `w${index + 1}`,
    word: `word${index + 1}`,
  })),
};
const settings = { dailyNewWords: 25, reviewRatio: 2 };

test('新词排除已有记录并按每日剩余数量截取', () => {
  const records = {
    [recordKey('cet4', 'w1')]: { wordId: 'w1' },
    [recordKey('cet4', 'w2')]: { wordId: 'w2' },
  };
  const result = buildStudyPlan({
    book,
    records,
    today: { newCompleted: 20, reviewCompleted: 0 },
    settings,
    studyType: 'new',
  });
  assert.equal(result.reason, 'ready');
  assert.equal(result.remaining, 5);
  assert.deepEqual(result.words.map((word) => word.id), [
    'w3', 'w4', 'w5', 'w6', 'w7',
  ]);
});

test('复习词优先错词再选择最久未学习的单词', () => {
  const records = {
    [recordKey('cet4', 'w1')]: {
      wordId: 'w1', isWrongWord: false, lastStudiedAt: '2026-06-20T00:00:00.000Z',
    },
    [recordKey('cet4', 'w2')]: {
      wordId: 'w2', isWrongWord: true, lastStudiedAt: '2026-06-22T00:00:00.000Z',
    },
    [recordKey('cet4', 'w3')]: {
      wordId: 'w3', isWrongWord: true, lastStudiedAt: '2026-06-21T00:00:00.000Z',
    },
    [recordKey('cet4', 'w4')]: {
      wordId: 'w4', isWrongWord: false, lastStudiedAt: '2026-06-19T00:00:00.000Z',
    },
  };
  const result = buildStudyPlan({
    book,
    records,
    today: { newCompleted: 0, reviewCompleted: 47 },
    settings,
    studyType: 'review',
  });
  assert.equal(result.remaining, 3);
  assert.deepEqual(result.words.map((word) => word.id), ['w3', 'w2', 'w4']);
});

test('目标完成或没有候选词时返回明确原因', () => {
  assert.deepEqual(buildStudyPlan({
    book,
    records: {},
    today: { newCompleted: 25 },
    settings,
    studyType: 'new',
  }), { words: [], remaining: 0, reason: 'goal-complete' });

  const result = buildStudyPlan({
    book,
    records: {},
    today: { reviewCompleted: 0 },
    settings,
    studyType: 'review',
  });
  assert.equal(result.reason, 'no-words');
  assert.equal(result.remaining, 50);
});

test('单轮最多返回十个单词', () => {
  const result = buildStudyPlan({
    book,
    records: {},
    today: {},
    settings: { dailyNewWords: 500, reviewRatio: 3 },
    studyType: 'new',
  });
  assert.equal(result.words.length, 10);
});
