# WordRush Checkin Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local learning checkin MVP so completed study rounds automatically create daily checkin records, with a home summary and a checkin history page.

**Architecture:** Add a focused `checkin-service` that owns local storage, idempotency, daily aggregation, and streak calculation. Summary page calls the service after a completed round, home page reads compact stats, and a new checkin page renders the recent record list. Cloud sync is intentionally out of scope for this MVP.

**Tech Stack:** Native WeChat Mini Program pages, local `wx` storage, existing `node:test` suite, no new third-party dependencies.

---

## File Structure

- Create: `miniprogram/services/checkin-service.js`  
  Owns `wordrush.checkins` local storage, summary application, record listing, and streak calculation.
- Modify: `miniprogram/pages/summary/index.js`  
  Calls the checkin service after `applySummary(summary)` so every completed round can update today's checkin.
- Modify: `miniprogram/pages/summary/index.wxml`  
  Shows a small success line when the round was recorded as today's checkin.
- Modify: `miniprogram/pages/summary/index.wxss`  
  Styles the checkin success line.
- Modify: `miniprogram/pages/home/index.js`  
  Loads checkin stats in `onShow()` and adds `openCheckins()`.
- Modify: `miniprogram/pages/home/index.wxml`  
  Adds a checkin card showing today's status, streak, and learned word count.
- Modify: `miniprogram/pages/home/index.wxss`  
  Styles the checkin card without affecting the existing study plan grid.
- Create: `miniprogram/pages/checkin/index.js`  
  Loads checkin stats and recent records for the history page.
- Create: `miniprogram/pages/checkin/index.json`  
  Sets navigation title to `打卡记录`.
- Create: `miniprogram/pages/checkin/index.wxml`  
  Renders summary stats, record list, and empty state.
- Create: `miniprogram/pages/checkin/index.wxss`  
  Styles the checkin history page.
- Modify: `miniprogram/app.json`  
  Registers `pages/checkin/index` after `pages/profile/index`.
- Create: `tests/checkin-service.test.js`  
  Covers first checkin, same-day aggregation, duplicate round protection, list order, and streak calculation.
- Create: `tests/summary-page.test.js`  
  Static test to ensure summary page imports and calls the checkin service.
- Modify: `tests/home-page.test.js`  
  Asserts home page exposes checkin stats and navigation.
- Modify: `tests/project-structure.test.js`  
  Asserts checkin page registration.
- Create: `tests/checkin-page.test.js`  
  Static test to ensure the checkin page loads stats and renders list/empty state.
- Modify: `README.md`  
  Documents the new checkin feature and release checklist item.

### Task 1: Checkin Service

**Files:**
- Create: `tests/checkin-service.test.js`
- Create: `miniprogram/services/checkin-service.js`

- [ ] **Step 1: Write failing checkin service tests**

Create `tests/checkin-service.test.js`:

```js
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
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\checkin-service.test.js
```

Expected: FAIL with `Cannot find module '../miniprogram/services/checkin-service'`.

- [ ] **Step 3: Implement checkin service**

Create `miniprogram/services/checkin-service.js`:

```js
const CHECKIN_KEY = 'wordrush.checkins';

function emptyDay(date = '') {
  return {
    date,
    completed: 0,
    newCompleted: 0,
    reviewCompleted: 0,
    score: 0,
    rounds: 0,
    lastCheckedAt: '',
  };
}

function emptyState() {
  return {
    processedRoundIds: [],
    days: {},
  };
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeDay(date, value = {}) {
  return {
    ...emptyDay(date),
    ...value,
    date,
    completed: safeNumber(value.completed),
    newCompleted: safeNumber(value.newCompleted),
    reviewCompleted: safeNumber(value.reviewCompleted),
    score: safeNumber(value.score),
    rounds: safeNumber(value.rounds),
    lastCheckedAt: typeof value.lastCheckedAt === 'string'
      ? value.lastCheckedAt
      : '',
  };
}

function normalizeCheckinState(value) {
  if (!value || typeof value !== 'object') {
    return emptyState();
  }
  const days = {};
  if (value.days && typeof value.days === 'object') {
    Object.entries(value.days).forEach(([date, day]) => {
      days[date] = normalizeDay(date, day);
    });
  }
  return {
    processedRoundIds: Array.isArray(value.processedRoundIds)
      ? [...value.processedRoundIds]
      : [],
    days,
  };
}

function getDate(timestamp) {
  return String(timestamp || '').slice(0, 10);
}

function shiftDate(date, offset) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function calculateStreak(days, today) {
  let streak = 0;
  let cursor = today;
  while (days[cursor] && days[cursor].completed > 0) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function createCheckinStore(read, write, now = () => new Date().toISOString()) {
  function readState() {
    return normalizeCheckinState(read());
  }

  function writeState(state) {
    write(normalizeCheckinState(state));
  }

  return {
    applyCheckinSummary(summary = {}) {
      if (!summary.roundId || !summary.total) {
        return { applied: false };
      }
      const state = readState();
      if (state.processedRoundIds.includes(summary.roundId)) {
        return { applied: false };
      }

      const timestamp = now();
      const date = getDate(timestamp);
      const currentDay = state.days[date] || emptyDay(date);
      const total = safeNumber(summary.total);
      const score = safeNumber(summary.score);
      const studyType = summary.studyType === 'review' ? 'review' : 'new';
      const nextDay = {
        ...currentDay,
        completed: currentDay.completed + total,
        newCompleted: currentDay.newCompleted + (studyType === 'new' ? total : 0),
        reviewCompleted: currentDay.reviewCompleted + (studyType === 'review' ? total : 0),
        score: currentDay.score + score,
        rounds: currentDay.rounds + 1,
        lastCheckedAt: timestamp,
      };
      const nextState = {
        processedRoundIds: [...state.processedRoundIds, summary.roundId],
        days: {
          ...state.days,
          [date]: nextDay,
        },
      };
      writeState(nextState);
      return {
        applied: true,
        day: nextDay,
        stats: this.loadCheckinStats(date),
      };
    },

    loadCheckinStats(today = getDate(now())) {
      const state = readState();
      const todayDay = state.days[today] || emptyDay(today);
      return {
        checkedToday: todayDay.completed > 0,
        streak: calculateStreak(state.days, today),
        todayCompleted: todayDay.completed,
        todayScore: todayDay.score,
        totalDays: Object.values(state.days)
          .filter((day) => day.completed > 0)
          .length,
      };
    },

    listCheckinDays(limit = 30) {
      return Object.values(readState().days)
        .filter((day) => day.completed > 0)
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, limit);
    },
  };
}

function createWxCheckinStore(now) {
  return createCheckinStore(
    () => wx.getStorageSync(CHECKIN_KEY),
    (value) => wx.setStorageSync(CHECKIN_KEY, value),
    now,
  );
}

module.exports = {
  CHECKIN_KEY,
  createCheckinStore,
  createWxCheckinStore,
  normalizeCheckinState,
};
```

- [ ] **Step 4: Run service tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\checkin-service.test.js
```

Expected: all checkin service tests PASS.

### Task 2: Summary Page Auto Checkin

**Files:**
- Create: `tests/summary-page.test.js`
- Modify: `miniprogram/pages/summary/index.js`
- Modify: `miniprogram/pages/summary/index.wxml`
- Modify: `miniprogram/pages/summary/index.wxss`

- [ ] **Step 1: Write failing summary page test**

Create `tests/summary-page.test.js`:

```js
// 总结页结构测试保证完成学习后会自动写入打卡记录。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSummary(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'summary', `index.${extension}`),
    'utf8',
  );
}

test('总结页完成学习后调用打卡服务', () => {
  const js = readSummary('js');
  const wxml = readSummary('wxml');
  assert.match(js, /checkin-service/);
  assert.match(js, /createWxCheckinStore/);
  assert.match(js, /applyCheckinSummary\(summary\)/);
  assert.match(js, /checkinMessage/);
  assert.match(wxml, /checkinMessage/);
  assert.match(wxml, /今日打卡已记录/);
});
```

- [ ] **Step 2: Run summary page test and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\summary-page.test.js
```

Expected: FAIL because summary page does not import or call `checkin-service`.

- [ ] **Step 3: Update summary page JS**

Modify `miniprogram/pages/summary/index.js`:

```js
const { getSummary, createRound } = require('../../utils/round-engine');
const { loadRound, saveRound, clearRound } = require('../../utils/round-storage');
const { getWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { buildStudyPlan } = require('../../services/study-plan-service');
const { createWxLearningRepository } = require('../../services/learning-repository');
const { createWxCheckinStore } = require('../../services/checkin-service');

Page({
  data: {
    summary: null,
    checkinMessage: '',
  },

  onLoad() {
    const round = loadRound();
    if (!round || !round.completed) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    const summary = getSummary(round);
    createWxLearningRepository().applySummary(summary);
    const checkin = createWxCheckinStore().applyCheckinSummary(summary);
    clearRound();
    this.setData({
      summary,
      checkinMessage: checkin.applied ? '今日打卡已记录' : '',
    });
  },

  restart() {
    const summary = this.data.summary || {};
    this.startPlannedRound(summary.studyType || 'new');
  },

  startPlannedRound(studyType) {
    const summary = this.data.summary || {};
    const settings = loadSettings();
    const book = getWordbook(summary.wordbookId || settings.selectedWordbookId);
    const repository = createWxLearningRepository();
    const plan = buildStudyPlan({
      book,
      records: repository.listRecords(book.id),
      today: repository.getTodaySummary(),
      settings,
      studyType,
    });
    if (plan.reason !== 'ready') {
      wx.showToast({
        title: plan.reason === 'goal-complete' ? '今日目标已完成' : '暂无可学习单词',
        icon: 'none',
      });
      setTimeout(() => wx.reLaunch({ url: '/pages/home/index' }), 700);
      return;
    }
    const mode = settings.defaultMode === 'quiz' && plan.words.length < 4
      ? 'flashcard'
      : settings.defaultMode;
    const round = createRound(plan.words, plan.words.length, mode, Math.random, {
      wordbookId: book.id,
      studyType,
    });
    saveRound(round);
    this.openRound(round);
  },

  reviewWrongWords() {
    const summary = this.data.summary || {};
    const settings = loadSettings();
    const book = getWordbook(summary.wordbookId || settings.selectedWordbookId);
    const repository = createWxLearningRepository();
    const ids = new Set(repository.listWrongWordIds(book.id));
    const words = book.words.filter((word) => ids.has(word.id));
    if (!words.length) {
      wx.showToast({ title: '暂时没有错词', icon: 'none' });
      return;
    }
    const mode = words.length >= 4 ? 'quiz' : 'flashcard';
    const round = createRound(words, Math.min(10, words.length), mode, Math.random, {
      wordbookId: book.id,
      studyType: 'review',
    });
    saveRound(round);
    this.openRound(round);
  },

  openRound(round) {
    const url = round.mode === 'quiz' ? '/pages/quiz/index' : '/pages/flashcard/index';
    wx.redirectTo({ url });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
```

- [ ] **Step 4: Update summary page WXML**

Modify `miniprogram/pages/summary/index.wxml`:

```xml
<!-- 总结页展示本轮结果并提供下一步学习入口。 -->
<view class="page summary-page" wx:if="{{summary}}">
  <text class="complete-label">本轮完成</text>
  <text class="score">{{summary.score}}</text>
  <text class="score-label">本轮得分</text>
  <text wx:if="{{checkinMessage}}" class="checkin-message">{{checkinMessage}}</text>

  <view class="stats-card">
    <view class="stat"><text class="stat-value correct">{{summary.correctCount}}</text><text>已掌握</text></view>
    <view class="stat"><text class="stat-value wrong">{{summary.wrongCount}}</text><text>需复习</text></view>
    <view class="stat"><text class="stat-value">{{summary.accuracy}}%</text><text>正确率</text></view>
  </view>

  <button class="primary-button" bindtap="restart">再练一轮</button>
  <button class="secondary-button" bindtap="reviewWrongWords">复习错词</button>
  <button class="text-button" bindtap="goHome">返回首页</button>
</view>
```

- [ ] **Step 5: Update summary page WXSS**

Append to `miniprogram/pages/summary/index.wxss`:

```css
.checkin-message {
  display: block;
  padding: 14rpx 22rpx;
  margin: 18rpx auto 0;
  color: #176c52;
  background: #e5f8f1;
  border-radius: 999rpx;
  font-size: 24rpx;
}
```

- [ ] **Step 6: Run summary page test and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\summary-page.test.js tests\checkin-service.test.js
```

Expected: tests PASS.

### Task 3: Home Checkin Card

**Files:**
- Modify: `tests/home-page.test.js`
- Modify: `miniprogram/pages/home/index.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`

- [ ] **Step 1: Add failing home page checkin test**

Append this test to `tests/home-page.test.js`:

```js
test('首页展示打卡状态并提供打卡记录入口', () => {
  const js = readPage('home', 'js');
  const wxml = readPage('home', 'wxml');
  const wxss = readPage('home', 'wxss');
  assert.match(js, /checkin-service/);
  assert.match(js, /loadCheckinStats/);
  assert.match(js, /openCheckins\(\)/);
  assert.match(wxml, /checkinStats/);
  assert.match(wxml, /今日已打卡/);
  assert.match(wxml, /今日未打卡/);
  assert.match(wxml, /bindtap="openCheckins"/);
  assert.match(wxss, /\.checkin-card/);
});
```

- [ ] **Step 2: Run home page test and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\home-page.test.js
```

Expected: FAIL because home page has no checkin service usage or checkin card.

- [ ] **Step 3: Update home page JS**

Modify `miniprogram/pages/home/index.js`:

```js
const {
  getWordbook,
} = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { buildStudyPlan } = require('../../services/study-plan-service');
const { createRound } = require('../../utils/round-engine');
const { saveRound, loadRound } = require('../../utils/round-storage');
const {
  createWxLearningRepository,
} = require('../../services/learning-repository');
const { createWxCheckinStore } = require('../../services/checkin-service');

Page({
  data: {
    bookName: '',
    wordCount: 0,
    settings: {},
    modeLabel: '',
    activeRound: null,
    activeBookName: '',
    todayCompleted: 0,
    todayScore: 0,
    newCompleted: 0,
    reviewCompleted: 0,
    reviewTarget: 0,
    newProgressPercent: 0,
    reviewProgressPercent: 0,
    checkinStats: {
      checkedToday: false,
      streak: 0,
      todayCompleted: 0,
      todayScore: 0,
      totalDays: 0,
    },
    cloudMessage: '',
    syncPending: false,
  },

  onShow() {
    const settings = loadSettings();
    const book = getWordbook(settings.selectedWordbookId);
    const today = createWxLearningRepository().getTodaySummary();
    const activeRound = loadRound();
    const app = getApp();
    const reviewTarget = settings.dailyNewWords * settings.reviewRatio;
    const checkinStats = createWxCheckinStore().loadCheckinStats();
    this.setData({
      bookName: book.name,
      wordCount: book.words.length,
      settings,
      modeLabel: settings.defaultMode === 'flashcard'
        ? '单词卡片'
        : '四选一练习',
      activeRound,
      activeBookName: activeRound
        ? getWordbook(activeRound.wordbookId).name
        : '',
      todayCompleted: today.completed,
      todayScore: today.score,
      newCompleted: today.newCompleted,
      reviewCompleted: today.reviewCompleted,
      reviewTarget,
      newProgressPercent: Math.min(
        100,
        Math.round((today.newCompleted / settings.dailyNewWords) * 100),
      ),
      reviewProgressPercent: Math.min(
        100,
        Math.round((today.reviewCompleted / reviewTarget) * 100),
      ),
      checkinStats,
      cloudMessage: app.globalData.cloudMessage,
      syncPending: app.globalData.syncPending,
    });
  },

  startNewWords() {
    this.startStudyType('new');
  },

  startReview() {
    this.startStudyType('review');
  },

  startLearning() {
    // 兼容旧入口名称，默认继续学习新词。
    this.startNewWords();
  },

  startStudyType(studyType) {
    const settings = this.data.settings;
    const book = getWordbook(settings.selectedWordbookId);
    const repository = createWxLearningRepository();
    const plan = buildStudyPlan({
      book,
      records: repository.listRecords(book.id),
      today: repository.getTodaySummary(),
      settings,
      studyType,
    });
    if (plan.reason !== 'ready') {
      wx.showToast({
        title: plan.reason === 'goal-complete'
          ? '今日目标已完成'
          : '暂无可学习单词',
        icon: 'none',
      });
      return;
    }
    const mode = settings.defaultMode === 'quiz' && plan.words.length < 4
      ? 'flashcard'
      : settings.defaultMode;
    const round = createRound(
      plan.words,
      plan.words.length,
      mode,
      Math.random,
      { wordbookId: book.id, studyType },
    );
    saveRound(round);
    this.openRound(round);
  },

  resumeLearning() {
    const round = loadRound();
    if (round) {
      this.openRound(round);
    }
  },

  openRound(round) {
    // 两种模式各自拥有页面，但共享同一个轮次结构。
    const url = round.mode === 'flashcard'
      ? '/pages/flashcard/index'
      : '/pages/quiz/index';
    wx.navigateTo({ url });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  openProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  openCheckins() {
    wx.navigateTo({ url: '/pages/checkin/index' });
  },

  openWordbooks() {
    wx.navigateTo({ url: '/pages/wordbooks/index' });
  },

  openWrongWords() {
    wx.navigateTo({ url: '/pages/wrong-words/index' });
  },
});
```

- [ ] **Step 4: Update home page WXML**

Insert this block after the cloud banner and before `book-picker` in `miniprogram/pages/home/index.wxml`:

```xml
  <view class="checkin-card" bindtap="openCheckins">
    <view>
      <text class="eyebrow">{{checkinStats.checkedToday ? '今日已打卡' : '今日未打卡'}}</text>
      <text class="checkin-title">连续 {{checkinStats.streak}} 天</text>
      <text class="muted">今日学习 {{checkinStats.todayCompleted}} 词 · 累计 {{checkinStats.totalDays}} 天</text>
    </view>
    <text class="change-book">记录 ›</text>
  </view>
```

- [ ] **Step 5: Update home page WXSS**

Append to `miniprogram/pages/home/index.wxss`:

```css
.checkin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  background: #fff;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, 0.1);
}

.checkin-title {
  display: block;
  margin: 8rpx 0 4rpx;
  font-size: 34rpx;
  font-weight: 700;
}
```

- [ ] **Step 6: Run home page test and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\home-page.test.js tests\checkin-service.test.js
```

Expected: tests PASS.

### Task 4: Checkin Records Page

**Files:**
- Modify: `tests/project-structure.test.js`
- Create: `tests/checkin-page.test.js`
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/checkin/index.js`
- Create: `miniprogram/pages/checkin/index.json`
- Create: `miniprogram/pages/checkin/index.wxml`
- Create: `miniprogram/pages/checkin/index.wxss`

- [ ] **Step 1: Add failing page registration test**

Append this test to `tests/project-structure.test.js`:

```js
test('应用注册打卡记录页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/checkin/index'), true);
});
```

- [ ] **Step 2: Add failing checkin page structure test**

Create `tests/checkin-page.test.js`:

```js
// 打卡记录页结构测试保证页面可以读取统计、展示列表和空状态。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readCheckin(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'checkin', `index.${extension}`),
    'utf8',
  );
}

test('打卡记录页读取打卡统计和最近记录', () => {
  const js = readCheckin('js');
  const wxml = readCheckin('wxml');
  assert.match(js, /checkin-service/);
  assert.match(js, /loadCheckinStats/);
  assert.match(js, /listCheckinDays\(30\)/);
  assert.match(wxml, /wx:for="{{days}}"/);
  assert.match(wxml, /连续打卡/);
  assert.match(wxml, /今日学习/);
  assert.match(wxml, /完成一轮学习后/);
});
```

- [ ] **Step 3: Run page tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\project-structure.test.js tests\checkin-page.test.js
```

Expected: FAIL because `pages/checkin/index` is not registered and page files do not exist.

- [ ] **Step 4: Register checkin page**

Modify `miniprogram/app.json`:

```json
{
  "pages": [
    "pages/home/index",
    "pages/profile/index",
    "pages/checkin/index",
    "pages/settings/index",
    "pages/wordbooks/index",
    "pages/flashcard/index",
    "pages/quiz/index",
    "pages/summary/index",
    "pages/wrong-words/index"
  ],
  "window": {
    "navigationBarTitleText": "WordRush",
    "navigationBarBackgroundColor": "#5968E8",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F8FF"
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

- [ ] **Step 5: Create checkin page JS**

Create `miniprogram/pages/checkin/index.js`:

```js
const { createWxCheckinStore } = require('../../services/checkin-service');

Page({
  data: {
    stats: {
      checkedToday: false,
      streak: 0,
      todayCompleted: 0,
      todayScore: 0,
      totalDays: 0,
    },
    days: [],
  },

  onShow() {
    const store = createWxCheckinStore();
    this.setData({
      stats: store.loadCheckinStats(),
      days: store.listCheckinDays(30),
    });
  },
});
```

- [ ] **Step 6: Create checkin page JSON**

Create `miniprogram/pages/checkin/index.json`:

```json
{
  "navigationBarTitleText": "打卡记录"
}
```

- [ ] **Step 7: Create checkin page WXML**

Create `miniprogram/pages/checkin/index.wxml`:

```xml
<!-- 打卡记录页展示本地学习打卡，后续云端同步时可复用同一数据结构。 -->
<view class="page">
  <text class="page-title">打卡记录</text>
  <text class="page-description">完成一轮学习后会自动打卡。</text>

  <view class="stats-card">
    <view class="stat-item">
      <text class="stat-value">{{stats.streak}}</text>
      <text class="stat-label">连续打卡</text>
    </view>
    <view class="stat-item">
      <text class="stat-value">{{stats.todayCompleted}}</text>
      <text class="stat-label">今日学习</text>
    </view>
    <view class="stat-item">
      <text class="stat-value">{{stats.totalDays}}</text>
      <text class="stat-label">累计天数</text>
    </view>
  </view>

  <view wx:if="{{days.length}}" class="record-list">
    <view wx:for="{{days}}" wx:key="date" class="record-card">
      <view>
        <text class="record-date">{{item.date}}</text>
        <text class="record-detail">新词 {{item.newCompleted}} · 复习 {{item.reviewCompleted}} · {{item.rounds}} 轮</text>
      </view>
      <view class="record-score">
        <text class="score-value">{{item.score}}</text>
        <text class="score-label">分</text>
      </view>
    </view>
  </view>

  <view wx:else class="empty-state">
    <text class="empty-title">还没有打卡记录</text>
    <text class="muted">完成一轮学习后，这里会出现你的打卡记录。</text>
  </view>
</view>
```

- [ ] **Step 8: Create checkin page WXSS**

Create `miniprogram/pages/checkin/index.wxss`:

```css
/* 打卡记录页保持轻量列表，让用户快速看到连续天数和每日学习量。 */
.page-title {
  display: block;
  margin-top: 16rpx;
  font-size: 42rpx;
  font-weight: 700;
}

.page-description {
  display: block;
  margin: 10rpx 0 28rpx;
  color: #718096;
  font-size: 25rpx;
}

.stats-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18rpx;
  padding: 28rpx;
  background: #fff;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, 0.1);
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  color: #202853;
  font-size: 38rpx;
  font-weight: 700;
}

.stat-label {
  display: block;
  margin-top: 8rpx;
  color: #718096;
  font-size: 23rpx;
}

.record-list {
  margin-top: 24rpx;
}

.record-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx;
  margin-bottom: 18rpx;
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 30rpx rgba(72, 88, 160, 0.08);
}

.record-date {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
}

.record-detail {
  display: block;
  margin-top: 8rpx;
  color: #718096;
  font-size: 24rpx;
}

.record-score {
  min-width: 88rpx;
  text-align: right;
}

.score-value {
  color: #5968e8;
  font-size: 34rpx;
  font-weight: 700;
}

.score-label {
  margin-left: 4rpx;
  color: #718096;
  font-size: 22rpx;
}

.empty-state {
  padding: 70rpx 30rpx;
  margin-top: 24rpx;
  text-align: center;
  background: #fff;
  border-radius: 28rpx;
}

.empty-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 32rpx;
  font-weight: 700;
}
```

- [ ] **Step 9: Run page tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\project-structure.test.js tests\checkin-page.test.js tests\home-page.test.js
```

Expected: tests PASS.

### Task 5: README and Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README feature list**

Modify the opening paragraph in `README.md` to include `学习打卡记录`:

```markdown
WordRush 是一个原生微信小程序 MVP。当前版本先完成单人背词闭环，支持内置考试词书、单词卡片、四选一练习、每日新词计划、每日复习计划、学习打卡记录、学习总结、错词复习、我的资料页、设置页和 CloudBase 学习进度同步。
```

Add these bullets under `## 功能` after the review ratio bullets:

```markdown
- 完成任意一轮学习后自动生成当天打卡。
- 首页展示今日打卡状态、连续打卡天数和今日学习词数。
- 打卡记录页按日期倒序展示每日新词、复习、轮次和得分。
```

Add this bullet under `## 数据策略`:

```markdown
- `miniprogram/services/checkin-service.js` 管理本地打卡记录，完成学习后自动累计每日词数、得分和连续天数。
```

Add this release checklist item under `## 发布前验收`:

```text
[ ] 完成一轮学习后首页显示今日已打卡
[ ] 打卡记录页显示当天学习词数和得分
```

- [ ] **Step 2: Run full test suite**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected: all tests PASS.

- [ ] **Step 3: Run JS syntax and JSON checks**

Run:

```powershell
$node = 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem miniprogram,cloudfunctions,scripts,tests -Recurse -Filter *.js | ForEach-Object {
  & $node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "JavaScript 语法检查失败：$($_.FullName)" }
}
Get-ChildItem miniprogram,cloudfunctions -Recurse -Filter *.json | ForEach-Object {
  Get-Content -Encoding UTF8 -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
```

Expected: command exits 0.

- [ ] **Step 4: Check diff scope**

Run:

```powershell
git diff --check
git status --short
```

Expected: only checkin feature files and README are changed, plus existing WeChat DevTools local config files remain unstaged.

- [ ] **Step 5: Commit checkin feature**

Stage only intended files:

```powershell
git add -- README.md miniprogram/app.json miniprogram/pages/home/index.js miniprogram/pages/home/index.wxml miniprogram/pages/home/index.wxss miniprogram/pages/summary/index.js miniprogram/pages/summary/index.wxml miniprogram/pages/summary/index.wxss miniprogram/pages/checkin miniprogram/services/checkin-service.js tests/checkin-service.test.js tests/summary-page.test.js tests/home-page.test.js tests/project-structure.test.js tests/checkin-page.test.js
```

Commit:

```powershell
git commit -m "feat: add learning checkin records"
```

Expected: commit succeeds.

- [ ] **Step 6: Push branch**

Run:

```powershell
git push
```

Expected: branch `codex/multi-wordbooks` pushes successfully to GitHub.
