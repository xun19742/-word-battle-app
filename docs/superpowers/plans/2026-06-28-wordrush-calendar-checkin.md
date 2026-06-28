# WordRush Calendar Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the check-in list with a monthly calendar where a day lights only after both new-word and review targets are completed, while keeping local-first updates and syncing daily history to CloudBase.

**Architecture:** A pure calendar utility builds month cells, `checkin-service.js` owns local daily target snapshots and completion rules, `sync-learning` idempotently aggregates cloud `checkin_records`, and a read-only `checkins` cloud function returns monthly records. The page renders local data first, then merges confirmed cloud data.

**Tech Stack:** WeChat Mini Program, CloudBase `wx-server-sdk`, CommonJS, `node:test`, local storage and existing learning sync queue.

---

## File Structure

- Create `miniprogram/utils/calendar-grid.js`: local date formatting, month navigation and calendar cells.
- Create `tests/calendar-grid.test.js`: month boundaries, leap years and cell states.
- Modify `miniprogram/services/checkin-service.js`: goal snapshots, double-target completion and month records.
- Modify `tests/checkin-service.test.js`: new completion and streak rules.
- Modify `miniprogram/pages/summary/index.js`: pass current settings into check-in application.
- Modify `tests/summary-page.test.js`: verify settings are supplied.
- Modify `cloudfunctions/sync-learning/index.js`: aggregate idempotent cloud check-in records.
- Modify `cloudfunctions/sync-learning/learning-rules.js`: validate target snapshot fields.
- Modify `tests/sync-learning.test.js`: cloud check-in static and rule coverage.
- Create `cloudfunctions/checkins/index.js`: list month records and statistics for the current OpenID.
- Create `cloudfunctions/checkins/package.json`: cloud function manifest.
- Create `tests/checkins-cloud-function.test.js`: read-only cloud function coverage.
- Modify `miniprogram/services/checkin-service.js`: cloud month loading and local/cloud merge.
- Modify `miniprogram/pages/checkin/index.js`: month selection, local-first render and cloud refresh.
- Modify `miniprogram/pages/checkin/index.wxml`: monthly calendar and selected-day details.
- Modify `miniprogram/pages/checkin/index.wxss`: calendar states and detail card.
- Modify `tests/checkin-page.test.js`: calendar page structure.
- Modify `miniprogram/pages/home/index.wxml`: new/review progress in check-in card.
- Modify `README.md`: `checkin_records`, `checkins` deployment and acceptance checks.

## Task 1: Pure Calendar Grid

**Files:**
- Create: `miniprogram/utils/calendar-grid.js`
- Create: `tests/calendar-grid.test.js`

- [ ] **Step 1: Write failing calendar tests**

Create:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCalendarGrid,
  formatLocalDate,
  shiftMonth,
} = require('../miniprogram/utils/calendar-grid');

test('闰年二月生成二十九个当月日期', () => {
  const cells = buildCalendarGrid({
    year: 2028,
    month: 2,
    records: {},
    today: '2028-02-10',
    selectedDate: '2028-02-10',
  });
  assert.equal(cells.filter((cell) => cell.inMonth).length, 29);
  assert.equal(cells.length === 35 || cells.length === 42, true);
});

test('日期格标记今天、选中、打卡和未达标学习', () => {
  const cells = buildCalendarGrid({
    year: 2026,
    month: 6,
    today: '2026-06-28',
    selectedDate: '2026-06-27',
    records: {
      '2026-06-27': { checked: true, completed: 75 },
      '2026-06-28': { checked: false, completed: 20 },
    },
  });
  const checked = cells.find((cell) => cell.date === '2026-06-27');
  const today = cells.find((cell) => cell.date === '2026-06-28');

  assert.equal(checked.checked, true);
  assert.equal(checked.selected, true);
  assert.equal(today.isToday, true);
  assert.equal(today.hasStudy, true);
});

test('月份切换支持跨年且本地日期不使用 UTC 截断', () => {
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.equal(formatLocalDate(new Date(2026, 5, 8, 23, 59)), '2026-06-08');
});
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test tests\calendar-grid.test.js
```

Expected: FAIL because `calendar-grid.js` is absent.

- [ ] **Step 3: Implement calendar helpers**

Create:

```js
function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftMonth(year, month, offset) {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function buildCalendarGrid({ year, month, records = {}, today, selectedDate }) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const visibleCount = firstWeekday + daysInMonth <= 35 ? 35 : 42;
  return Array.from({ length: visibleCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) {
      return { key: `empty-${index}`, inMonth: false };
    }
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const record = records[date] || null;
    return {
      key: date,
      date,
      day,
      inMonth: true,
      checked: Boolean(record && record.checked),
      hasStudy: Boolean(record && record.completed > 0),
      isToday: date === today,
      selected: date === selectedDate,
    };
  });
}

module.exports = {
  buildCalendarGrid,
  formatLocalDate,
  shiftMonth,
};
```

- [ ] **Step 4: Run tests and commit**

```powershell
node --test tests\calendar-grid.test.js
git add miniprogram/utils/calendar-grid.js tests/calendar-grid.test.js
git commit -m "feat: build checkin calendar grid"
```

Expected: PASS before commit.

## Task 2: Double-Target Local Check-In Rules

**Files:**
- Modify: `miniprogram/services/checkin-service.js`
- Modify: `tests/checkin-service.test.js`
- Modify: `miniprogram/pages/summary/index.js`
- Modify: `tests/summary-page.test.js`

- [ ] **Step 1: Add failing completion and target snapshot tests**

Replace the first check-in expectations and add:

```js
test('只有新词和复习目标都完成才打卡成功', () => {
  setupStorage();
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-28T10:00:00.000Z');
  const settings = { dailyNewWords: 10, reviewRatio: 1 };

  store.applyCheckinSummary({
    roundId: 'new-round',
    total: 10,
    score: 100,
    studyType: 'new',
  }, settings);
  assert.equal(store.loadCheckinStats('2026-06-28').checkedToday, false);

  store.applyCheckinSummary({
    roundId: 'review-round',
    total: 10,
    score: 80,
    studyType: 'review',
  }, { dailyNewWords: 50, reviewRatio: 3 });

  const day = store.getCheckinDay('2026-06-28');
  assert.equal(day.dailyNewTarget, 10);
  assert.equal(day.dailyReviewTarget, 10);
  assert.equal(day.checked, true);
});

test('连续天数只统计双目标完成日期', () => {
  setupStorage({
    'wordrush.checkins': {
      processedRoundIds: [],
      days: {
        '2026-06-26': { date: '2026-06-26', checked: true },
        '2026-06-27': { date: '2026-06-27', checked: false, completed: 20 },
        '2026-06-28': { date: '2026-06-28', checked: true },
      },
    },
  });
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore(() => '2026-06-28T12:00:00.000Z');

  assert.equal(store.loadCheckinStats('2026-06-28').streak, 1);
  assert.equal(store.loadCheckinStats('2026-06-28').totalDays, 2);
});
```

Append to `tests/summary-page.test.js`:

```js
test('总结页把学习设置传给打卡服务以锁定当日目标', () => {
  const source = readPage('summary', 'js');
  assert.match(source, /applyCheckinSummary\(summary, settings\)/);
});
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test tests\checkin-service.test.js tests\summary-page.test.js
```

Expected: FAIL because `checked`, target snapshots and `getCheckinDay` are absent.

- [ ] **Step 3: Extend normalized day records**

Update `emptyDay` and `normalizeDay`:

```js
function emptyDay(date = '') {
  return {
    date,
    checked: false,
    dailyNewTarget: 0,
    dailyReviewTarget: 0,
    completed: 0,
    newCompleted: 0,
    reviewCompleted: 0,
    score: 0,
    rounds: 0,
    lastCheckedAt: '',
  };
}
```

Normalize `checked` as Boolean and targets with `safeNumber`.

- [ ] **Step 4: Lock targets and compute checked**

Change signature to `applyCheckinSummary(summary = {}, settings = {})` and build:

```js
const dailyNewTarget = currentDay.dailyNewTarget
  || safeNumber(settings.dailyNewWords);
const dailyReviewTarget = currentDay.dailyReviewTarget
  || dailyNewTarget * ([1, 2, 3].includes(settings.reviewRatio)
    ? settings.reviewRatio
    : 2);
const newCompleted = currentDay.newCompleted + (studyType === 'new' ? total : 0);
const reviewCompleted = currentDay.reviewCompleted + (studyType === 'review' ? total : 0);
const nextDay = {
  ...currentDay,
  dailyNewTarget,
  dailyReviewTarget,
  completed: currentDay.completed + total,
  newCompleted,
  reviewCompleted,
  checked: (
    dailyNewTarget > 0
    && dailyReviewTarget > 0
    && newCompleted >= dailyNewTarget
    && reviewCompleted >= dailyReviewTarget
  ),
  score: currentDay.score + score,
  rounds: currentDay.rounds + 1,
  lastCheckedAt: timestamp,
};
```

Make `calculateStreak`, `checkedToday` and `totalDays` use `day.checked`.

- [ ] **Step 5: Add day and month reads**

Return methods:

```js
getCheckinDay(date) {
  return readState().days[date] || emptyDay(date);
},

listMonthDays(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return Object.fromEntries(
    Object.entries(readState().days)
      .filter(([date]) => date.startsWith(prefix)),
  );
},
```

- [ ] **Step 6: Pass settings from summary page**

In `pages/summary/index.js`, load settings before applying:

```js
const settings = loadSettings();
const checkin = createWxCheckinStore().applyCheckinSummary(summary, settings);
```

- [ ] **Step 7: Run tests and commit**

```powershell
node --test tests\checkin-service.test.js tests\summary-page.test.js
git add miniprogram/services/checkin-service.js miniprogram/pages/summary/index.js tests/checkin-service.test.js tests/summary-page.test.js
git commit -m "feat: require both daily goals for checkin"
```

Expected: PASS before commit.

## Task 3: Cloud Check-In Aggregation

**Files:**
- Modify: `cloudfunctions/sync-learning/learning-rules.js`
- Modify: `cloudfunctions/sync-learning/index.js`
- Modify: `miniprogram/services/learning-repository.js`
- Modify: `tests/sync-learning.test.js`
- Modify: `tests/learning-repository.test.js`

- [ ] **Step 1: Add failing target and collection tests**

Add rule assertions:

```js
test('同步数据接受合法日目标快照并拒绝非法目标', () => {
  const valid = validateSummary({
    ...validSummary,
    dailyNewTarget: 25,
    dailyReviewTarget: 50,
  });
  assert.equal(valid.dailyNewTarget, 25);
  assert.equal(valid.dailyReviewTarget, 50);
  assert.throws(
    () => validateSummary({ ...validSummary, dailyNewTarget: 0, dailyReviewTarget: 50 }),
    /每日目标无效/,
  );
});
```

Add static source assertions:

```js
assert.match(source, /collection\('checkin_records'\)/);
assert.match(source, /dailyNewTarget/);
assert.match(source, /dailyReviewTarget/);
assert.match(source, /checked/);
```

Add repository test:

```js
assert.equal(queued[0].dailyNewTarget, 25);
assert.equal(queued[0].dailyReviewTarget, 50);
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test tests\sync-learning.test.js tests\learning-repository.test.js
```

Expected: FAIL because target fields are not validated or queued.

- [ ] **Step 3: Include target snapshots in queued summaries**

Extend `createLearningRepository` to accept `loadSettings`, or pass targets through `applySummary(summary)` from the summary page. Queue:

```js
queue.enqueue({
  ...summary,
  wordbookId,
  studyType,
  dailyNewTarget: summary.dailyNewTarget,
  dailyReviewTarget: summary.dailyReviewTarget,
  completedAt: timestamp,
});
```

In the summary page, enrich before applying:

```js
const summaryWithTargets = {
  ...summary,
  dailyNewTarget: settings.dailyNewWords,
  dailyReviewTarget: settings.dailyNewWords * settings.reviewRatio,
};
```

Use `summaryWithTargets` for learning repository, check-in store and queue.

- [ ] **Step 4: Validate target fields in cloud rules**

In `validateSummary`:

```js
if (
  !Number.isInteger(summary.dailyNewTarget)
  || summary.dailyNewTarget < 5
  || summary.dailyNewTarget > 500
  || !Number.isInteger(summary.dailyReviewTarget)
  || summary.dailyReviewTarget < summary.dailyNewTarget
  || summary.dailyReviewTarget > summary.dailyNewTarget * 3
) {
  throw new Error('每日目标无效');
}
```

Return both fields.

- [ ] **Step 5: Aggregate checkin_records inside the existing transaction**

After confirming the round is new, read:

```js
const date = String(summary.completedAt || new Date().toISOString()).slice(0, 10);
const checkinId = safeDocumentId(`${OPENID}_${date}`);
const existingCheckin = await transaction
  .collection('checkin_records')
  .where({ _id: checkinId })
  .limit(1)
  .get();
const currentCheckin = existingCheckin.data[0] || {};
const dailyNewTarget = currentCheckin.dailyNewTarget || summary.dailyNewTarget;
const dailyReviewTarget = currentCheckin.dailyReviewTarget || summary.dailyReviewTarget;
const newCompleted = (currentCheckin.newCompleted || 0)
  + (summary.studyType === 'new' ? summary.total : 0);
const reviewCompleted = (currentCheckin.reviewCompleted || 0)
  + (summary.studyType === 'review' ? summary.total : 0);
await transaction.collection('checkin_records').doc(checkinId).set({
  data: {
    _openid: OPENID,
    date,
    dailyNewTarget,
    dailyReviewTarget,
    newCompleted,
    reviewCompleted,
    completed: newCompleted + reviewCompleted,
    rounds: (currentCheckin.rounds || 0) + 1,
    score: (currentCheckin.score || 0) + summary.score,
    checked: newCompleted >= dailyNewTarget && reviewCompleted >= dailyReviewTarget,
    createdAt: currentCheckin.createdAt || timestamp,
    updatedAt: timestamp,
  },
});
```

The existing `learning_rounds` duplicate check remains the idempotency gate.

- [ ] **Step 6: Run tests and commit**

```powershell
node --test tests\sync-learning.test.js tests\learning-repository.test.js tests\summary-page.test.js
git add cloudfunctions/sync-learning miniprogram/services/learning-repository.js miniprogram/pages/summary/index.js tests/sync-learning.test.js tests/learning-repository.test.js tests/summary-page.test.js
git commit -m "feat: sync daily checkin records"
```

Expected: PASS before commit.

## Task 4: Read-Only Checkins Cloud Function

**Files:**
- Create: `cloudfunctions/checkins/index.js`
- Create: `cloudfunctions/checkins/package.json`
- Create: `tests/checkins-cloud-function.test.js`

- [ ] **Step 1: Write failing static tests**

Create:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = () => fs.readFileSync(
  path.join(__dirname, '..', 'cloudfunctions', 'checkins', 'index.js'),
  'utf8',
);

test('打卡云函数按可信 OpenID 读取指定月份', () => {
  const code = source();
  assert.match(code, /cloud\.getWXContext\(\)/);
  assert.match(code, /collection\('checkin_records'\)/);
  assert.match(code, /action === 'listMonth'/);
  assert.match(code, /_openid: OPENID/);
  assert.match(code, /date: db\.RegExp/);
});
```

- [ ] **Step 2: Run test and confirm RED**

```powershell
node --test tests\checkins-cloud-function.test.js
```

Expected: FAIL because the cloud function is absent.

- [ ] **Step 3: Implement package and read function**

Create `package.json` with `wx-server-sdk: latest`.

Create `index.js`:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (event.action !== 'listMonth' || !validMonth(event.month)) {
    return { success: false, message: '月份参数无效', list: [] };
  }
  const snapshot = await db.collection('checkin_records').where({
    _openid: OPENID,
    date: db.RegExp({ regexp: `^${event.month}-`, options: '' }),
  }).orderBy('date', 'asc').get();
  return {
    success: true,
    list: snapshot.data.map((record) => ({
      date: record.date,
      checked: Boolean(record.checked),
      dailyNewTarget: record.dailyNewTarget || 0,
      dailyReviewTarget: record.dailyReviewTarget || 0,
      newCompleted: record.newCompleted || 0,
      reviewCompleted: record.reviewCompleted || 0,
      completed: record.completed || 0,
      rounds: record.rounds || 0,
      score: record.score || 0,
    })),
  };
};
```

- [ ] **Step 4: Run test and commit**

```powershell
node --test tests\checkins-cloud-function.test.js
git add cloudfunctions/checkins tests/checkins-cloud-function.test.js
git commit -m "feat: add checkin history cloud function"
```

Expected: PASS before commit.

## Task 5: Local-First Cloud Merge Service

**Files:**
- Modify: `miniprogram/services/checkin-service.js`
- Modify: `tests/checkin-service.test.js`

- [ ] **Step 1: Add failing cloud month tests**

Add:

```js
test('云端月份记录与本地记录按日期合并', async () => {
  const storage = setupStorage({
    'wordrush.checkins': {
      processedRoundIds: [],
      days: {
        '2026-06-28': {
          date: '2026-06-28',
          checked: false,
          newCompleted: 10,
          reviewCompleted: 0,
          completed: 10,
        },
      },
    },
  });
  global.wx.cloud = {
    callFunction: async () => ({
      result: {
        success: true,
        list: [{
          date: '2026-06-27',
          checked: true,
          newCompleted: 25,
          reviewCompleted: 50,
          completed: 75,
        }],
      },
    }),
  };
  const { createWxCheckinStore } = loadService();
  const store = createWxCheckinStore();
  const result = await store.syncMonth(2026, 6);

  assert.equal(result['2026-06-27'].checked, true);
  assert.equal(result['2026-06-28'].completed, 10);
  assert.equal(storage['wordrush.checkins'].days['2026-06-27'].checked, true);
});
```

- [ ] **Step 2: Run test and confirm RED**

```powershell
node --test tests\checkin-service.test.js
```

Expected: FAIL because `syncMonth` is absent.

- [ ] **Step 3: Add cloud month loader and merge**

Inside `createWxCheckinStore`, provide the store created by `createCheckinStore`, then attach:

```js
store.syncMonth = async (year, month) => {
  const local = store.listMonthDays(year, month);
  if (!wx.cloud) return local;
  try {
    const response = await wx.cloud.callFunction({
      name: 'checkins',
      data: {
        action: 'listMonth',
        month: `${year}-${String(month).padStart(2, '0')}`,
      },
    });
    const result = response.result || {};
    if (!result.success) return local;
    const cloudDays = Object.fromEntries(
      (result.list || []).map((day) => [day.date, normalizeDay(day.date, day)]),
    );
    const state = normalizeCheckinState(wx.getStorageSync(CHECKIN_KEY));
    const days = { ...state.days, ...cloudDays, ...local };
    wx.setStorageSync(CHECKIN_KEY, { ...state, days });
    return Object.fromEntries(
      Object.entries(days).filter(([date]) => (
        date.startsWith(`${year}-${String(month).padStart(2, '0')}-`)
      )),
    );
  } catch (error) {
    return local;
  }
};
```

Cloud-confirmed dates missing locally are added; local data remains visible while pending synchronization.

- [ ] **Step 4: Run tests and commit**

```powershell
node --test tests\checkin-service.test.js
git add miniprogram/services/checkin-service.js tests/checkin-service.test.js
git commit -m "feat: merge cloud checkin history"
```

Expected: PASS before commit.

## Task 6: Calendar Check-In Page and Home Status

**Files:**
- Modify: `miniprogram/pages/checkin/index.js`
- Modify: `miniprogram/pages/checkin/index.wxml`
- Modify: `miniprogram/pages/checkin/index.wxss`
- Modify: `tests/checkin-page.test.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `tests/home-page.test.js`

- [ ] **Step 1: Add failing page tests**

Update `tests/checkin-page.test.js`:

```js
test('打卡页展示月份导航、月历和日期详情', () => {
  const js = readCheckin('js');
  const wxml = readCheckin('wxml');
  const wxss = readCheckin('wxss');

  assert.match(js, /buildCalendarGrid/);
  assert.match(js, /previousMonth/);
  assert.match(js, /nextMonth/);
  assert.match(js, /selectDate/);
  assert.match(js, /syncMonth/);
  assert.match(wxml, /连续打卡/);
  assert.match(wxml, /累计打卡/);
  assert.match(wxml, /本月打卡/);
  assert.match(wxml, /wx:for="{{calendarCells}}"/);
  assert.match(wxml, /新词/);
  assert.match(wxml, /复习/);
  assert.match(wxss, /\.calendar-grid/);
  assert.match(wxss, /\.day-checked/);
});
```

Add to `tests/home-page.test.js`:

```js
assert.match(wxml, /checkinStats\.todayNewCompleted/);
assert.match(wxml, /checkinStats\.todayReviewCompleted/);
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test tests\checkin-page.test.js tests\home-page.test.js
```

Expected: FAIL because the page is still a list.

- [ ] **Step 3: Implement calendar page state**

Use:

```js
const { createWxCheckinStore } = require('../../services/checkin-service');
const {
  buildCalendarGrid,
  formatLocalDate,
  shiftMonth,
} = require('../../utils/calendar-grid');

Page({
  data: {
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    year: 0,
    month: 0,
    monthLabel: '',
    calendarCells: [],
    selectedDate: '',
    selectedDay: null,
    stats: {},
    monthChecked: 0,
  },

  onShow() {
    const today = new Date();
    this.today = formatLocalDate(today);
    this.store = createWxCheckinStore();
    this.setData({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      selectedDate: this.today,
    });
    this.refreshMonth();
  },

  async refreshMonth() {
    const { year, month, selectedDate } = this.data;
    const local = this.store.listMonthDays(year, month);
    this.renderMonth(local, selectedDate);
    const merged = await this.store.syncMonth(year, month);
    this.renderMonth(merged, selectedDate);
  },
});
```

Add `renderMonth`, `previousMonth`, `nextMonth`, and `selectDate` methods using `buildCalendarGrid` and `shiftMonth`. Do not allow `nextMonth` beyond the current month.

- [ ] **Step 4: Replace WXML with calendar layout**

Required structure:

```xml
<view class="stats-row">
  <view><text>{{stats.streak}}</text><text>连续打卡</text></view>
  <view><text>{{stats.totalDays}}</text><text>累计打卡</text></view>
  <view><text>{{monthChecked}}</text><text>本月打卡</text></view>
</view>
<view class="month-nav">
  <button bindtap="previousMonth">‹</button>
  <text>{{monthLabel}}</text>
  <button bindtap="nextMonth">›</button>
</view>
<view class="weekday-row">
  <text wx:for="{{weekdays}}" wx:key="*this">{{item}}</text>
</view>
<view class="calendar-grid">
  <view
    wx:for="{{calendarCells}}"
    wx:key="key"
    class="day-cell {{item.checked ? 'day-checked' : ''}} {{item.isToday ? 'day-today' : ''}}"
    data-date="{{item.date}}"
    bindtap="selectDate"
  >{{item.inMonth ? item.day : ''}}</view>
</view>
<view class="detail-card" wx:if="{{selectedDay}}">
  <text>{{selectedDay.checked ? '已完成打卡' : '未完成打卡'}}</text>
  <text>新词 {{selectedDay.newCompleted}} / {{selectedDay.dailyNewTarget}}</text>
  <text>复习 {{selectedDay.reviewCompleted}} / {{selectedDay.dailyReviewTarget}}</text>
  <text>学习 {{selectedDay.rounds}} 轮 · 得分 {{selectedDay.score}}</text>
</view>
```

- [ ] **Step 5: Add calendar styles and home progress**

Add seven-column grids and state classes:

```css
.calendar-grid, .weekday-row { display: grid; grid-template-columns: repeat(7, 1fr); }
.day-cell { display: flex; align-items: center; justify-content: center; height: 76rpx; border-radius: 50%; }
.day-checked { color: #176c52; background: #e5f8f1; }
.day-today { box-shadow: inset 0 0 0 3rpx #5968e8; }
.detail-card { padding: 28rpx; margin-top: 24rpx; background: #fff; border-radius: 24rpx; }
```

On home, display:

```xml
<text class="muted">
  新词 {{checkinStats.todayNewCompleted}} / {{settings.dailyNewWords}}
  · 复习 {{checkinStats.todayReviewCompleted}} / {{reviewTarget}}
</text>
```

Extend `loadCheckinStats` with `todayNewCompleted` and `todayReviewCompleted`.

- [ ] **Step 6: Run tests and commit**

```powershell
node --test tests\checkin-page.test.js tests\checkin-service.test.js tests\home-page.test.js
git add miniprogram/pages/checkin miniprogram/pages/home/index.wxml miniprogram/services/checkin-service.js tests/checkin-page.test.js tests/checkin-service.test.js tests/home-page.test.js
git commit -m "feat: add calendar checkin page"
```

Expected: PASS before commit.

## Task 7: Documentation, Verification and Cloud Deployment

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add:

```text
checkin_records
```

Add deployment:

```text
右键 cloudfunctions/checkins，选择“创建并部署：云端安装依赖（不上传 node_modules）”。
修改打卡聚合后重新部署 cloudfunctions/sync-learning。
```

Add acceptance checks:

```text
[ ] 只有新词和复习目标同时完成时日历日期点亮
[ ] 月历支持上月、下月和跨年切换
[ ] 点击日期显示新词、复习、轮次和得分
[ ] 断网学习后本地日历立即更新
[ ] 联网后云端记录可以恢复到日历
```

- [ ] **Step 2: Run full tests**

```powershell
node --test
```

Expected: 0 failures.

- [ ] **Step 3: Run syntax, JSON and diff checks**

```powershell
$node = 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem miniprogram,cloudfunctions,scripts,tests -Recurse -Filter *.js | ForEach-Object {
  & $node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "JavaScript 语法检查失败：$($_.FullName)" }
}
Get-ChildItem miniprogram,cloudfunctions -Recurse -Filter *.json | ForEach-Object {
  Get-Content -Encoding UTF8 -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
git diff --check
```

Expected: exit code 0.

- [ ] **Step 4: Commit and push**

```powershell
git add README.md
git commit -m "docs: describe calendar checkins"
git push
```

- [ ] **Step 5: Manual CloudBase setup**

```text
1. Create checkin_records with 仅创建者可读写.
2. Deploy cloudfunctions/sync-learning with cloud dependency installation.
3. Deploy cloudfunctions/checkins with cloud dependency installation.
4. Recompile the Mini Program.
5. Complete both daily targets and verify the current date lights green.
```

## Self-Review Notes

- Spec coverage: double-target success, target snapshots, local-first rendering, cloud aggregation, month reads, merging, streaks, calendar states and deployment are assigned to tasks.
- Scope: no makeup check-ins, social sharing, badges or friend check-in ranking.
- Naming: `dailyNewTarget`, `dailyReviewTarget`, `checked`, `checkin_records`, `listMonthDays`, `syncMonth` and `calendarCells` are consistent across local service, cloud function and page.
