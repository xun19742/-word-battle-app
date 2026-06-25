// 打卡服务测试保证完成学习后能稳定记录每日打卡、连续天数和重复轮次保护。
const test = require('node:test');
const assert = require('node:assert/strict');

function setupStorage(initial = {}) {
  const storage = { ...initial };
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => {
      storage[key] = value;
    },
  };
  return storage;
}

function loadService() {
  const servicePath = require.resolve('../miniprogram/services/checkin-service');
  delete require.cache[servicePath];
  return require(servicePath);
}

test('首次完成学习会生成当天打卡记录', () => {
  const storage = setupStorage();
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-25T09:00:00.000Z');

  const result = store.applyCheckinSummary({
    roundId: 'round-1',
    total: 10,
    score: 80,
    studyType: 'new',
  });

  assert.equal(result.applied, true);
  assert.deepEqual(storage['wordrush.checkins'].days['2026-06-25'], {
    date: '2026-06-25',
    completed: 10,
    newCompleted: 10,
    reviewCompleted: 0,
    score: 80,
    rounds: 1,
    lastCheckedAt: '2026-06-25T09:00:00.000Z',
  });
  assert.deepEqual(store.loadCheckinStats('2026-06-25'), {
    checkedToday: true,
    streak: 1,
    todayCompleted: 10,
    todayScore: 80,
    totalDays: 1,
  });
  delete global.wx;
});

test('同一天多轮学习会累加新词、复习和分数', () => {
  setupStorage();
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-25T10:00:00.000Z');

  store.applyCheckinSummary({
    roundId: 'round-1',
    total: 10,
    score: 90,
    studyType: 'new',
  });
  store.applyCheckinSummary({
    roundId: 'round-2',
    total: 5,
    score: 30,
    studyType: 'review',
  });

  const [day] = store.listCheckinDays();
  assert.equal(day.completed, 15);
  assert.equal(day.newCompleted, 10);
  assert.equal(day.reviewCompleted, 5);
  assert.equal(day.score, 120);
  assert.equal(day.rounds, 2);
  delete global.wx;
});

test('相同 roundId 不会重复打卡', () => {
  setupStorage();
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-25T11:00:00.000Z');
  const summary = {
    roundId: 'round-1',
    total: 10,
    score: 100,
    studyType: 'new',
  };

  assert.equal(store.applyCheckinSummary(summary).applied, true);
  assert.equal(store.applyCheckinSummary(summary).applied, false);
  assert.equal(store.listCheckinDays()[0].completed, 10);
  assert.equal(store.listCheckinDays()[0].rounds, 1);
  delete global.wx;
});

test('打卡列表按日期倒序并支持数量限制', () => {
  setupStorage({
    'wordrush.checkins': {
      processedRoundIds: ['a', 'b', 'c'],
      days: {
        '2026-06-23': { date: '2026-06-23', completed: 3, score: 30 },
        '2026-06-25': { date: '2026-06-25', completed: 5, score: 50 },
        '2026-06-24': { date: '2026-06-24', completed: 4, score: 40 },
      },
    },
  });
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-25T12:00:00.000Z');

  assert.deepEqual(
    store.listCheckinDays(2).map((day) => day.date),
    ['2026-06-25', '2026-06-24'],
  );
  delete global.wx;
});

test('连续打卡天数遇到断档会停止计数', () => {
  setupStorage({
    'wordrush.checkins': {
      processedRoundIds: [],
      days: {
        '2026-06-21': { date: '2026-06-21', completed: 2 },
        '2026-06-23': { date: '2026-06-23', completed: 3 },
        '2026-06-24': { date: '2026-06-24', completed: 4 },
        '2026-06-25': { date: '2026-06-25', completed: 5 },
      },
    },
  });
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-25T12:00:00.000Z');

  assert.equal(store.loadCheckinStats('2026-06-25').streak, 3);
  assert.equal(store.loadCheckinStats('2026-06-26').checkedToday, false);
  assert.equal(store.loadCheckinStats('2026-06-26').streak, 0);
  delete global.wx;
});

test('异常缓存和异常 summary 会安全降级', () => {
  setupStorage({ 'wordrush.checkins': 'broken' });
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-25T12:00:00.000Z');

  assert.equal(store.applyCheckinSummary({ total: 10 }).applied, false);
  assert.deepEqual(store.listCheckinDays(), []);
  assert.equal(store.loadCheckinStats('2026-06-25').checkedToday, false);
  delete global.wx;
});
