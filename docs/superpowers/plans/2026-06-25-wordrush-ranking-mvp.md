# WordRush Ranking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runnable ranking MVP with a CloudBase ranking function, client ranking service, ranking page, and home entry.

**Architecture:** Ranking data comes from public aggregate fields in the `users` collection. The cloud function owns sorting and public-field filtering, the client service owns cloud degradation and response normalization, and the page owns tab switching plus list/error/empty rendering. Friend battle rooms and battle settlement remain out of scope.

**Tech Stack:** Native WeChat Mini Program pages, CloudBase cloud functions, local `node:test`, no new third-party dependencies beyond `wx-server-sdk` inside the cloud function.

---

## File Structure

- Create: `cloudfunctions/ranking/ranking-rules.js`  
  Pure ranking helpers: type validation, sort field selection, safe number conversion, public item normalization, list ranking.
- Create: `cloudfunctions/ranking/index.js`  
  CloudBase entrypoint that queries `users`, sorts by the requested ranking type, and returns public ranking rows.
- Create: `cloudfunctions/ranking/package.json`  
  Cloud function package manifest with `wx-server-sdk`.
- Create: `tests/ranking-rules.test.js`  
  Tests ranking sorting, public-field filtering, default values, and invalid ranking type rejection.
- Create: `miniprogram/services/ranking-service.js`  
  Client service that calls the `ranking` cloud function, normalizes rows, and safely degrades without cloud.
- Create: `tests/ranking-service.test.js`  
  Tests no-cloud fallback, successful cloud calls, cloud failure response, and thrown exception handling.
- Create: `miniprogram/pages/ranking/index.js`  
  Ranking page data and tab switching logic.
- Create: `miniprogram/pages/ranking/index.json`  
  Navigation title.
- Create: `miniprogram/pages/ranking/index.wxml`  
  Ranking page layout with tabs, loading/error/empty states, and ranked list.
- Create: `miniprogram/pages/ranking/index.wxss`  
  Ranking page styles.
- Create: `tests/ranking-page.test.js`  
  Static page structure test.
- Modify: `miniprogram/app.json`  
  Register `pages/ranking/index`.
- Modify: `miniprogram/pages/home/index.js`  
  Add `openRanking()`.
- Modify: `miniprogram/pages/home/index.wxml`  
  Add ranking entry.
- Modify: `miniprogram/pages/home/index.wxss`  
  Style ranking entry.
- Modify: `tests/project-structure.test.js`  
  Assert ranking page registration.
- Modify: `tests/home-page.test.js`  
  Assert home ranking entry.
- Modify: `README.md`  
  Document ranking MVP and cloud deployment step.

### Task 1: Cloud Ranking Rules

**Files:**
- Create: `tests/ranking-rules.test.js`
- Create: `cloudfunctions/ranking/ranking-rules.js`

- [ ] **Step 1: Write failing ranking rule tests**

Create `tests/ranking-rules.test.js`:

```js
// 排行榜纯规则测试保证云函数只返回公开字段，并按指定榜单稳定排序。
const test = require('node:test');
const assert = require('node:assert/strict');

function loadRules() {
  const rulesPath = require.resolve('../cloudfunctions/ranking/ranking-rules');
  delete require.cache[rulesPath];
  return require(rulesPath);
}

const sampleUsers = [
  {
    _openid: 'hidden-1',
    nickname: '低分用户',
    avatarUrl: 'a.png',
    battleScore: 10,
    battleWins: 5,
    battlePlayed: 6,
    selectedWordbookId: 'cet4',
  },
  {
    _openid: 'hidden-2',
    nickname: '高分用户',
    avatarUrl: '',
    battleScore: 30,
    battleWins: 2,
    battlePlayed: 3,
  },
  {
    _openid: 'hidden-3',
    nickname: '',
    battleScore: '20',
    battleWins: '9',
    battlePlayed: 'bad',
  },
];

test('积分榜按 battleScore 降序并只返回公开字段', () => {
  const { buildRankingList } = loadRules();
  const list = buildRankingList(sampleUsers, 'battleScore');

  assert.deepEqual(list.map((item) => item.nickname), ['高分用户', 'WordRush 用户', '低分用户']);
  assert.deepEqual(list.map((item) => item.rank), [1, 2, 3]);
  assert.equal(list[0].battleScore, 30);
  assert.equal(list[1].battleScore, 20);
  assert.equal(list[1].battlePlayed, 0);
  assert.equal(Object.hasOwn(list[0], '_openid'), false);
  assert.equal(Object.hasOwn(list[0], 'selectedWordbookId'), false);
});

test('胜场榜按 battleWins 降序', () => {
  const { buildRankingList } = loadRules();
  const list = buildRankingList(sampleUsers, 'battleWins');

  assert.deepEqual(list.map((item) => item.nickname), ['WordRush 用户', '低分用户', '高分用户']);
  assert.deepEqual(list.map((item) => item.battleWins), [9, 5, 2]);
});

test('榜单类型和排序字段可校验', () => {
  const { getRankingSortField, isValidRankingType } = loadRules();

  assert.equal(isValidRankingType('battleScore'), true);
  assert.equal(isValidRankingType('battleWins'), true);
  assert.equal(isValidRankingType('other'), false);
  assert.equal(getRankingSortField('battleScore'), 'battleScore');
  assert.equal(getRankingSortField('battleWins'), 'battleWins');
  assert.throws(() => getRankingSortField('other'), /排行榜类型无效/);
});

test('限制最多返回五十条排行记录', () => {
  const { buildRankingList } = loadRules();
  const users = Array.from({ length: 60 }, (_, index) => ({
    nickname: `用户${index}`,
    battleScore: index,
    battleWins: index,
    battlePlayed: index,
  }));
  const list = buildRankingList(users, 'battleScore');

  assert.equal(list.length, 50);
  assert.equal(list[0].nickname, '用户59');
  assert.equal(list[49].nickname, '用户10');
});
```

- [ ] **Step 2: Run ranking rule tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\ranking-rules.test.js
```

Expected: FAIL with `Cannot find module '../cloudfunctions/ranking/ranking-rules'`.

- [ ] **Step 3: Implement ranking rules**

Create `cloudfunctions/ranking/ranking-rules.js`:

```js
const DEFAULT_PROFILE = {
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battlePlayed: 0,
};

const RANKING_SORT_FIELDS = {
  battleScore: 'battleScore',
  battleWins: 'battleWins',
};

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isValidRankingType(type) {
  return Object.hasOwn(RANKING_SORT_FIELDS, type);
}

function getRankingSortField(type) {
  if (!isValidRankingType(type)) {
    throw new Error('排行榜类型无效');
  }
  return RANKING_SORT_FIELDS[type];
}

function normalizeRankingItem(user = {}, index = 0) {
  return {
    rank: index + 1,
    nickname: user.nickname || DEFAULT_PROFILE.nickname,
    avatarUrl: user.avatarUrl || DEFAULT_PROFILE.avatarUrl,
    battleScore: safeNumber(user.battleScore),
    battleWins: safeNumber(user.battleWins),
    battlePlayed: safeNumber(user.battlePlayed),
  };
}

function buildRankingList(users = [], type = 'battleScore') {
  const sortField = getRankingSortField(type);
  return [...users]
    .sort((left, right) => safeNumber(right[sortField]) - safeNumber(left[sortField]))
    .slice(0, 50)
    .map(normalizeRankingItem);
}

module.exports = {
  buildRankingList,
  getRankingSortField,
  isValidRankingType,
  normalizeRankingItem,
};
```

- [ ] **Step 4: Run ranking rule tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\ranking-rules.test.js
```

Expected: all ranking rule tests PASS.

### Task 2: Ranking Cloud Function Entrypoint

**Files:**
- Modify: `tests/ranking-rules.test.js`
- Create: `cloudfunctions/ranking/index.js`
- Create: `cloudfunctions/ranking/package.json`

- [ ] **Step 1: Add failing static test for cloud function**

Append this test to `tests/ranking-rules.test.js`:

```js
test('排行榜云函数读取 users 集合并按榜单字段排序', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'ranking', 'index.js'),
    'utf8',
  );

  assert.match(source, /collection\('users'\)/);
  assert.match(source, /getRankingSortField\(type\)/);
  assert.match(source, /orderBy\(sortField,\s*'desc'\)/);
  assert.match(source, /limit\(50\)/);
  assert.match(source, /buildRankingList\(snapshot\.data,\s*type\)/);
  assert.match(source, /排行榜类型无效/);
});
```

- [ ] **Step 2: Run ranking rule tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\ranking-rules.test.js
```

Expected: FAIL because `cloudfunctions/ranking/index.js` does not exist.

- [ ] **Step 3: Implement ranking cloud function**

Create `cloudfunctions/ranking/index.js`:

```js
const cloud = require('wx-server-sdk');
const {
  buildRankingList,
  getRankingSortField,
  isValidRankingType,
} = require('./ranking-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const type = event.action || 'battleScore';
  if (!isValidRankingType(type)) {
    return {
      success: false,
      message: '排行榜类型无效',
      list: [],
    };
  }

  const sortField = getRankingSortField(type);
  const snapshot = await db
    .collection('users')
    .orderBy(sortField, 'desc')
    .limit(50)
    .get();

  return {
    success: true,
    list: buildRankingList(snapshot.data, type),
  };
};
```

Create `cloudfunctions/ranking/package.json`:

```json
{
  "name": "ranking",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

- [ ] **Step 4: Run ranking rule tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\ranking-rules.test.js
```

Expected: all ranking rule tests PASS.

### Task 3: Client Ranking Service

**Files:**
- Create: `tests/ranking-service.test.js`
- Create: `miniprogram/services/ranking-service.js`

- [ ] **Step 1: Write failing ranking service tests**

Create `tests/ranking-service.test.js`:

```js
// 排行榜客户端服务测试保证云端不可用或异常时不会影响小程序其它功能。
const test = require('node:test');
const assert = require('node:assert/strict');

function loadService() {
  const servicePath = require.resolve('../miniprogram/services/ranking-service');
  delete require.cache[servicePath];
  return require(servicePath);
}

test('没有云能力时排行榜安全降级', async () => {
  global.wx = {};
  const { loadRanking } = loadService();

  assert.deepEqual(await loadRanking('battleScore'), {
    success: false,
    list: [],
    message: '排行榜需要云服务',
  });
  delete global.wx;
});

test('云函数成功时返回清洗后的排行榜', async () => {
  const calls = [];
  global.wx = {
    cloud: {
      callFunction: async (options) => {
        calls.push(options);
        return {
          result: {
            success: true,
            list: [
              {
                nickname: '小词王',
                avatarUrl: '',
                battleScore: '30',
                battleWins: '5',
                battlePlayed: '8',
                secret: 'hidden',
              },
            ],
          },
        };
      },
    },
  };
  const { loadRanking } = loadService();
  const result = await loadRanking('battleWins');

  assert.equal(calls[0].name, 'ranking');
  assert.deepEqual(calls[0].data, { action: 'battleWins' });
  assert.deepEqual(result, {
    success: true,
    list: [
      {
        rank: 1,
        nickname: '小词王',
        avatarUrl: '',
        battleScore: 30,
        battleWins: 5,
        battlePlayed: 8,
      },
    ],
    message: '',
  });
  delete global.wx;
});

test('云函数返回失败时透传错误消息', async () => {
  global.wx = {
    cloud: {
      callFunction: async () => ({
        result: {
          success: false,
          message: '排行榜类型无效',
          list: [{ nickname: '不应展示' }],
        },
      }),
    },
  };
  const { loadRanking } = loadService();

  assert.deepEqual(await loadRanking('other'), {
    success: false,
    list: [],
    message: '排行榜类型无效',
  });
  delete global.wx;
});

test('云函数异常时返回加载失败', async () => {
  global.wx = {
    cloud: {
      callFunction: async () => {
        throw new Error('network');
      },
    },
  };
  const { loadRanking } = loadService();

  assert.deepEqual(await loadRanking('battleScore'), {
    success: false,
    list: [],
    message: '排行榜加载失败',
  });
  delete global.wx;
});
```

- [ ] **Step 2: Run ranking service tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\ranking-service.test.js
```

Expected: FAIL with `Cannot find module '../miniprogram/services/ranking-service'`.

- [ ] **Step 3: Implement ranking service**

Create `miniprogram/services/ranking-service.js`:

```js
function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeRankingItem(item = {}, index = 0) {
  return {
    rank: safeNumber(item.rank) || index + 1,
    nickname: item.nickname || 'WordRush 用户',
    avatarUrl: item.avatarUrl || '',
    battleScore: safeNumber(item.battleScore),
    battleWins: safeNumber(item.battleWins),
    battlePlayed: safeNumber(item.battlePlayed),
  };
}

async function loadRanking(type = 'battleScore') {
  if (!wx.cloud) {
    return {
      success: false,
      list: [],
      message: '排行榜需要云服务',
    };
  }

  try {
    const response = await wx.cloud.callFunction({
      name: 'ranking',
      data: { action: type },
    });
    const result = response.result || {};
    if (!result.success) {
      return {
        success: false,
        list: [],
        message: result.message || '排行榜加载失败',
      };
    }
    return {
      success: true,
      list: (result.list || []).map(normalizeRankingItem),
      message: '',
    };
  } catch (error) {
    return {
      success: false,
      list: [],
      message: '排行榜加载失败',
    };
  }
}

module.exports = {
  loadRanking,
  normalizeRankingItem,
};
```

- [ ] **Step 4: Run ranking service tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\ranking-service.test.js
```

Expected: all ranking service tests PASS.

### Task 4: Ranking Page

**Files:**
- Create: `tests/ranking-page.test.js`
- Modify: `tests/project-structure.test.js`
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/ranking/index.js`
- Create: `miniprogram/pages/ranking/index.json`
- Create: `miniprogram/pages/ranking/index.wxml`
- Create: `miniprogram/pages/ranking/index.wxss`

- [ ] **Step 1: Add failing page tests**

Append this test to `tests/project-structure.test.js`:

```js
test('应用注册排行榜页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/ranking/index'), true);
});
```

Create `tests/ranking-page.test.js`:

```js
// 排行榜页面结构测试保证榜单切换、状态提示和列表字段不会遗漏。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRanking(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'ranking', `index.${extension}`),
    'utf8',
  );
}

test('排行榜页提供积分榜和胜场榜切换', () => {
  const js = readRanking('js');
  const wxml = readRanking('wxml');
  const wxss = readRanking('wxss');

  assert.match(js, /ranking-service/);
  assert.match(js, /loadRanking/);
  assert.match(js, /switchRanking/);
  assert.match(js, /battleScore/);
  assert.match(js, /battleWins/);
  assert.match(wxml, /积分榜/);
  assert.match(wxml, /胜场榜/);
  assert.match(wxml, /排行榜需要云服务/);
  assert.match(wxml, /还没有排行榜数据/);
  assert.match(wxml, /wx:for="{{list}}"/);
  assert.match(wxml, /battleScore/);
  assert.match(wxml, /battleWins/);
  assert.match(wxml, /battlePlayed/);
  assert.match(wxss, /\.ranking-card/);
});
```

- [ ] **Step 2: Run ranking page tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\project-structure.test.js tests\ranking-page.test.js
```

Expected: FAIL because ranking page is not registered and page files do not exist.

- [ ] **Step 3: Register ranking page**

Modify `miniprogram/app.json`:

```json
{
  "pages": [
    "pages/home/index",
    "pages/profile/index",
    "pages/checkin/index",
    "pages/ranking/index",
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

- [ ] **Step 4: Create ranking page JS**

Create `miniprogram/pages/ranking/index.js`:

```js
const { loadRanking } = require('../../services/ranking-service');

const TABS = [
  { type: 'battleScore', label: '积分榜' },
  { type: 'battleWins', label: '胜场榜' },
];

Page({
  data: {
    tabs: TABS,
    activeType: 'battleScore',
    list: [],
    loading: false,
    message: '',
  },

  onShow() {
    this.loadCurrentRanking();
  },

  switchRanking(event) {
    const type = event.currentTarget.dataset.type;
    if (!type || type === this.data.activeType) return;
    this.setData({ activeType: type });
    this.loadCurrentRanking();
  },

  async loadCurrentRanking() {
    this.setData({ loading: true, message: '' });
    const result = await loadRanking(this.data.activeType);
    this.setData({
      loading: false,
      list: result.list,
      message: result.success ? '' : result.message,
    });
  },
});
```

- [ ] **Step 5: Create ranking page JSON**

Create `miniprogram/pages/ranking/index.json`:

```json
{
  "navigationBarTitleText": "排行榜"
}
```

- [ ] **Step 6: Create ranking page WXML**

Create `miniprogram/pages/ranking/index.wxml`:

```xml
<!-- 排行榜页读取云端公开战绩字段，未开通云开发时显示安全降级提示。 -->
<view class="page">
  <text class="page-title">排行榜</text>
  <text class="page-description">好友对战开放后，这里会展示积分和胜场排名。</text>

  <view class="tab-row">
    <button
      wx:for="{{tabs}}"
      wx:key="type"
      class="tab-button {{activeType === item.type ? 'tab-button-active' : ''}}"
      data-type="{{item.type}}"
      bindtap="switchRanking"
    >{{item.label}}</button>
  </view>

  <view wx:if="{{loading}}" class="state-card">加载排行榜中...</view>
  <view wx:elif="{{message}}" class="state-card">{{message || '排行榜需要云服务'}}</view>
  <view wx:elif="{{!list.length}}" class="state-card">还没有排行榜数据</view>

  <view wx:else class="ranking-list">
    <view wx:for="{{list}}" wx:key="rank" class="ranking-card">
      <text class="rank-number">{{item.rank}}</text>
      <view class="avatar">
        <image wx:if="{{item.avatarUrl}}" class="avatar-image" src="{{item.avatarUrl}}" mode="aspectFill" />
        <text wx:else>W</text>
      </view>
      <view class="player-info">
        <text class="player-name">{{item.nickname}}</text>
        <text class="player-meta">积分 {{item.battleScore}} · 胜场 {{item.battleWins}} · {{item.battlePlayed}} 局</text>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 7: Create ranking page WXSS**

Create `miniprogram/pages/ranking/index.wxss`:

```css
/* 排行榜页使用卡片列表展示公开战绩，空态和降级态都保持轻量。 */
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

.tab-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
  margin-bottom: 24rpx;
}

.tab-button {
  height: 74rpx;
  color: #5968e8;
  background: #eef0ff;
  border-radius: 999rpx;
  font-size: 26rpx;
  line-height: 74rpx;
}

.tab-button-active {
  color: #fff;
  background: #5968e8;
}

.tab-button::after {
  border: 0;
}

.state-card {
  padding: 54rpx 24rpx;
  color: #718096;
  text-align: center;
  background: #fff;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, 0.08);
}

.ranking-card {
  display: flex;
  align-items: center;
  padding: 26rpx;
  margin-bottom: 18rpx;
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 30rpx rgba(72, 88, 160, 0.08);
}

.rank-number {
  width: 54rpx;
  color: #5968e8;
  font-size: 32rpx;
  font-weight: 700;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  margin-right: 20rpx;
  color: #fff;
  overflow: hidden;
  background: #5968e8;
  border-radius: 50%;
  font-weight: 700;
}

.avatar-image {
  width: 72rpx;
  height: 72rpx;
}

.player-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.player-name {
  font-size: 30rpx;
  font-weight: 700;
}

.player-meta {
  margin-top: 8rpx;
  color: #718096;
  font-size: 24rpx;
}
```

- [ ] **Step 8: Run ranking page tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\project-structure.test.js tests\ranking-page.test.js
```

Expected: tests PASS.

### Task 5: Home Ranking Entry

**Files:**
- Modify: `tests/home-page.test.js`
- Modify: `miniprogram/pages/home/index.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`

- [ ] **Step 1: Add failing home ranking entry test**

Append this test to `tests/home-page.test.js`:

```js
test('首页提供排行榜入口', () => {
  const js = readPage('home', 'js');
  const wxml = readPage('home', 'wxml');
  const wxss = readPage('home', 'wxss');

  assert.match(js, /openRanking\(\)/);
  assert.match(wxml, /bindtap="openRanking"/);
  assert.match(wxml, />排行榜</);
  assert.match(wxss, /\.ranking-button/);
});
```

- [ ] **Step 2: Run home page test and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\home-page.test.js
```

Expected: FAIL because home page has no `openRanking()` or ranking button.

- [ ] **Step 3: Add home page JS navigation**

Modify `miniprogram/pages/home/index.js` by adding this method after `openCheckins()`:

```js
  openRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },
```

- [ ] **Step 4: Add home page WXML entry**

Modify `miniprogram/pages/home/index.wxml` inside `.header-actions`:

```xml
    <view class="header-actions">
      <button class="ranking-button" bindtap="openRanking">排行榜</button>
      <button class="profile-button" bindtap="openProfile">我的</button>
      <button class="settings-button" bindtap="openSettings" aria-label="打开设置">⚙</button>
    </view>
```

- [ ] **Step 5: Add home page WXSS style**

Append this rule near `.profile-button` in `miniprogram/pages/home/index.wxss`:

```css
.ranking-button { width: 116rpx; height: 64rpx; padding: 0; color: #176c52; background: #e5f8f1; border-radius: 999rpx; font-size: 24rpx; line-height: 64rpx; }
.ranking-button::after { border: 0; }
```

- [ ] **Step 6: Run home page test and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\home-page.test.js
```

Expected: tests PASS.

### Task 6: Documentation and Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Modify the opening paragraph in `README.md` to include `排行榜基础页`:

```markdown
WordRush 是一个原生微信小程序 MVP。当前版本先完成单人背词闭环，支持内置考试词书、单词卡片、四选一练习、每日新词计划、每日复习计划、学习打卡记录、排行榜基础页、学习总结、错词复习、我的资料页、设置页和 CloudBase 学习进度同步。
```

Add these bullets under `## 功能` after the profile bullets:

```markdown
- 排行榜基础页：展示对战积分榜和胜场榜。
- 未开通云开发时排行榜会显示降级提示，不影响背词功能。
```

In `## 配置 CloudBase`, update the deployment steps to include ranking:

```markdown
5. 右键 `cloudfunctions/ranking`，选择相同部署方式。
```

Under `## 数据策略`, add:

```markdown
- `cloudfunctions/ranking` 只读取 `users` 集合的公开战绩字段，不返回 OpenID 和学习设置。
- `miniprogram/services/ranking-service.js` 管理排行榜云调用和无云环境降级。
```

Under `## 发布前验收`, add:

```text
[ ] 排行榜页可以在无云环境显示“排行榜需要云服务”
[ ] 排行榜页可以切换积分榜和胜场榜
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

Expected: only ranking feature files and README are changed, plus existing WeChat DevTools local config files remain unstaged.

- [ ] **Step 5: Commit ranking MVP**

Stage only intended files:

```powershell
git add -- README.md cloudfunctions/ranking miniprogram/app.json miniprogram/pages/home/index.js miniprogram/pages/home/index.wxml miniprogram/pages/home/index.wxss miniprogram/pages/ranking miniprogram/services/ranking-service.js tests/ranking-rules.test.js tests/ranking-service.test.js tests/ranking-page.test.js tests/home-page.test.js tests/project-structure.test.js
```

Commit:

```powershell
git commit -m "feat: add ranking mvp"
```

Expected: commit succeeds.

- [ ] **Step 6: Push branch**

Run:

```powershell
git push
```

Expected: branch `codex/multi-wordbooks` pushes successfully to GitHub.
