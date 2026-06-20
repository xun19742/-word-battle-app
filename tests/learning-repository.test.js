// 学习仓库测试覆盖错词、汇总和重复轮次保护。
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLearningRepository } = require('../miniprogram/services/learning-repository');

function buildRepository() {
  let state = null;
  const queued = [];
  const queue = { enqueue: (summary) => queued.push(summary) };
  return {
    repository: createLearningRepository(
      () => state,
      (value) => { state = value; },
      queue,
      () => '2026-06-20T10:00:00.000Z',
    ),
    getState: () => state,
    queued,
  };
}

test('一轮结果聚合正确数、错词和今日进度', () => {
  const { repository, queued } = buildRepository();
  const result = repository.applySummary({
    roundId: 'r1', score: 10, total: 2,
    answers: [
      { wordId: 'w1', isCorrect: true, mode: 'quiz' },
      { wordId: 'w2', isCorrect: false, mode: 'quiz' },
    ],
  });
  assert.equal(result.applied, true);
  assert.equal(repository.getRecord('w1').correctCount, 1);
  assert.equal(repository.getRecord('w2').isWrongWord, true);
  assert.deepEqual(repository.listWrongWordIds(), ['w2']);
  assert.deepEqual(repository.getTodaySummary(), { completed: 2, score: 10 });
  assert.equal(queued.length, 1);
});

test('相同 roundId 重复应用不会重复计分或入队', () => {
  const { repository, queued } = buildRepository();
  const summary = {
    roundId: 'r1', score: 10, total: 1,
    answers: [{ wordId: 'w1', isCorrect: true, mode: 'flashcard' }],
  };
  repository.applySummary(summary);
  const repeated = repository.applySummary(summary);
  assert.equal(repeated.applied, false);
  assert.equal(repository.getRecord('w1').correctCount, 1);
  assert.equal(queued.length, 1);
});

test('错词答对后移出错词列表', () => {
  const { repository } = buildRepository();
  repository.applySummary({
    roundId: 'r1', score: 0, total: 1,
    answers: [{ wordId: 'w1', isCorrect: false, mode: 'quiz' }],
  });
  repository.applySummary({
    roundId: 'r2', score: 10, total: 1,
    answers: [{ wordId: 'w1', isCorrect: true, mode: 'flashcard' }],
  });
  assert.deepEqual(repository.listWrongWordIds(), []);
});
