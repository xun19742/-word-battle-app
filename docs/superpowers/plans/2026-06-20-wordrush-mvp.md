# WordRush MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可在微信开发者工具运行的 WordRush 原生小程序 MVP，支持内置四级词书、卡片背词、四选一、学习总结、设置、错词复习和 CloudBase 数据同步。

**Architecture:** 小程序页面只负责渲染与事件转发，纯 JavaScript 领域模块负责词书校验、学习轮次、计分和设置校验，因而可用 Node 内置测试运行器直接测试。CloudBase 云函数负责身份和幂等写入，本地待同步队列保证网络异常时不丢失本轮结果；排行榜和实时对战明确排除在本计划之外。

**Tech Stack:** 原生微信小程序（WXML、WXSS、JavaScript、JSON）、微信云开发 CloudBase、Node.js 内置 `node:test`、CommonJS。

---

## 文件结构

```text
.
├─ package.json                         # 本地测试命令
├─ project.config.json                  # 微信开发者工具项目配置
├─ README.md                            # 本地启动、云环境和验收说明
├─ miniprogram/
│  ├─ app.js                            # 云开发初始化和待同步重试
│  ├─ app.json                          # 页面注册与窗口配置
│  ├─ app.wxss                          # 全局视觉样式
│  ├─ sitemap.json                      # 小程序索引配置
│  ├─ data/cet4-core-100.js             # 内置四级核心词汇 100 词
│  ├─ services/cloud-api.js             # 云函数调用边界
│  ├─ services/learning-repository.js   # 学习数据本地缓存与云端接口
│  ├─ services/settings-service.js      # 设置读取、校验和保存
│  ├─ services/sync-queue.js            # 待同步队列
│  ├─ services/wordbook-service.js      # 词书读取与校验
│  ├─ utils/round-engine.js             # 轮次、计分和四选一选项生成
│  ├─ utils/round-storage.js            # 未完成轮次的恢复与清理
│  └─ pages/
│     ├─ home/index.{js,json,wxml,wxss}
│     ├─ flashcard/index.{js,json,wxml,wxss}
│     ├─ quiz/index.{js,json,wxml,wxss}
│     ├─ summary/index.{js,json,wxml,wxss}
│     ├─ settings/index.{js,json,wxml,wxss}
│     └─ wrong-words/index.{js,json,wxml,wxss}
├─ cloudfunctions/
│  ├─ login/{index.js,package.json}
│  ├─ sync-learning/{index.js,package.json}
│  └─ seed-wordbook/{index.js,package.json,data.js}
├─ scripts/prepare-cloud-wordbook.js    # 将唯一词书源复制到种子云函数
└─ tests/
   ├─ project-structure.test.js
   ├─ wordbook-service.test.js
   ├─ round-engine.test.js
   ├─ settings-service.test.js
   ├─ sync-queue.test.js
   └─ sync-learning.test.js
```

JSON 文件不支持注释；所有 JavaScript 业务模块必须使用中文注释解释业务规则，WXML 使用中文注释标明主要页面区块。

## Task 1: 建立可运行项目骨架和测试入口

**Files:**
- Create: `package.json`
- Create: `project.config.json`
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/sitemap.json`
- Create: `miniprogram/pages/home/index.js`
- Create: `miniprogram/pages/home/index.json`
- Create: `miniprogram/pages/home/index.wxml`
- Create: `miniprogram/pages/home/index.wxss`
- Test: `tests/project-structure.test.js`

- [ ] **Step 1: 写入失败的项目结构测试**

```js
// tests/project-structure.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('项目配置指向小程序与云函数目录', () => {
  const configPath = path.join(__dirname, '..', 'project.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.miniprogramRoot, 'miniprogram/');
  assert.equal(config.cloudfunctionRoot, 'cloudfunctions/');
});

test('首页是应用的第一个页面', () => {
  const appPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  assert.equal(app.pages[0], 'pages/home/index');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，错误包含 `ENOENT` 和 `project.config.json`。

- [ ] **Step 3: 创建最小项目配置**

```json
// package.json
{
  "name": "wordrush-miniprogram",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test",
    "prepare:cloud": "node scripts/prepare-cloud-wordbook.js"
  }
}
```

`project.config.json` 使用可直接导入开发者工具的游客 AppID；接入 CloudBase 时在开发者工具中切换为项目实际 AppID：

```json
{
  "appid": "touristappid",
  "projectname": "WordRush",
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "compileType": "miniprogram",
  "setting": {
    "es6": true,
    "enhance": true,
    "minified": false,
    "postcss": true
  }
}
```

```js
// miniprogram/app.js
App({
  onLaunch() {
    // 游客 AppID 也能打开界面；真实 AppID 下才初始化云开发。
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
  },
});
```

```json
// miniprogram/app.json
{
  "pages": [
    "pages/home/index"
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

```css
/* miniprogram/app.wxss：全局设计令牌 */
page { background: #f6f8ff; color: #24305e; font-size: 30rpx; }
.page { min-height: 100vh; padding: 32rpx; box-sizing: border-box; }
.card { background: #fff; border-radius: 28rpx; padding: 32rpx; box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, .12); }
.primary-button { background: #5968e8; color: #fff; border-radius: 999rpx; }
.muted { color: #718096; }
```

```json
// miniprogram/sitemap.json
{
  "desc": "WordRush 页面索引配置",
  "rules": [{ "action": "allow", "page": "*" }]
}
```

```js
// miniprogram/pages/home/index.js
Page({
  data: { title: 'WordRush' },
});
```

```json
// miniprogram/pages/home/index.json
{ "navigationBarTitleText": "WordRush" }
```

```xml
<!-- miniprogram/pages/home/index.wxml：首页最小可运行内容 -->
<view class="page"><view class="card"><text class="title">{{title}}</text></view></view>
```

```css
/* miniprogram/pages/home/index.wxss：首页标题 */
.title { font-size: 52rpx; font-weight: 700; }
```

- [ ] **Step 4: 运行测试并在开发者工具打开首页**

Run: `npm test`

Expected: 2 tests PASS。

Manual: 微信开发者工具导入项目，模拟器显示 `WordRush` 首页，无编译错误。

- [ ] **Step 5: 提交项目骨架**

```bash
git add package.json project.config.json miniprogram tests/project-structure.test.js
git commit -m "feat: scaffold WordRush miniprogram"
```

## Task 2: 加入内置四级词书与校验服务

**Files:**
- Create: `miniprogram/data/cet4-core-100.js`
- Create: `miniprogram/services/wordbook-service.js`
- Test: `tests/wordbook-service.test.js`

- [ ] **Step 1: 写入失败的词书测试**

```js
// tests/wordbook-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getBuiltinWordbook, validateWordbook } = require('../miniprogram/services/wordbook-service');

test('内置四级词书包含 100 个唯一单词', () => {
  const book = getBuiltinWordbook();
  assert.equal(book.id, 'cet4-core-100');
  assert.equal(book.words.length, 100);
  assert.equal(new Set(book.words.map((item) => item.word)).size, 100);
});

test('每个单词都具备学习所需字段', () => {
  const errors = validateWordbook(getBuiltinWordbook());
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `node --test tests/wordbook-service.test.js`

Expected: FAIL，错误包含 `Cannot find module`。

- [ ] **Step 3: 创建词书服务**

```js
// miniprogram/services/wordbook-service.js
const wordbook = require('../data/cet4-core-100');

const REQUIRED_FIELDS = ['id', 'word', 'phonetic', 'meaning', 'example', 'exampleTranslation', 'difficulty', 'order'];

function getBuiltinWordbook() {
  // 返回副本，避免页面直接修改内置词书源数据。
  return { ...wordbook, words: wordbook.words.map((item) => ({ ...item })) };
}

function validateWordbook(book) {
  const errors = [];
  if (!book || !Array.isArray(book.words)) return ['词书格式错误'];
  if (book.words.length !== 100) errors.push('词书必须包含 100 个单词');
  const seen = new Set();
  book.words.forEach((item, index) => {
    REQUIRED_FIELDS.forEach((field) => {
      if (item[field] === undefined || item[field] === '') errors.push(`第 ${index + 1} 个单词缺少 ${field}`);
    });
    if (seen.has(item.word)) errors.push(`单词重复：${item.word}`);
    seen.add(item.word);
  });
  return errors;
}

module.exports = { getBuiltinWordbook, validateWordbook };
```

- [ ] **Step 4: 创建完整 100 词数据文件**

`miniprogram/data/cet4-core-100.js` 导出以下固定结构：

```js
// 词书是客户端离线可用的唯一源数据，云端种子由脚本复制生成。
module.exports = {
  id: 'cet4-core-100',
  name: '四级核心词汇',
  description: 'WordRush MVP 内置四级核心词汇',
  words: [
    {
      id: 'cet4-001', word: 'adventure', phonetic: '/ədˈventʃər/',
      meaning: 'n. 冒险；奇遇', example: 'Life is a great adventure.',
      exampleTranslation: '生活是一场伟大的冒险。', difficulty: 1, order: 1,
    },
    {
      id: 'cet4-002', word: 'ability', phonetic: '/əˈbɪləti/',
      meaning: 'n. 能力；才能', example: 'She has the ability to solve the problem.',
      exampleTranslation: '她有解决这个问题的能力。', difficulty: 1, order: 2,
    },
  ],
};
```

在同一数组中补齐以下 98 个确定词条，ID 和 `order` 从 `cet4-003`/`3` 连续到 `cet4-100`/`100`；每项必须填写真实音标、中文释义、完整英文例句、中文翻译和 `difficulty`（1 至 3）：

```text
achieve, advantage, affect, allow, ancient, approach, argue, arrange,
article, attend, average, avoid, balance, behavior, benefit, challenge,
change, choice, communicate, compare, complete, concern, consider, continue,
create, culture, decide, describe, develop, difference, difficult, discover,
education, effect, effort, encourage, environment, experience, explain,
familiar, feature, final, focus, foreign, improve, include, increase,
influence, information, instead, interest, knowledge, language, manage,
measure, method, necessary, notice, opportunity, organize, particular,
perform, possible, practice, prepare, prevent, probably, produce, protect,
provide, purpose, realize, receive, reduce, relationship, remember, require,
research, result, society, solution, suggest, support, technology, tradition,
understand, value, various, volunteer, whether, accept, account, available,
community, condition, confidence, creative, direction, responsible
```

- [ ] **Step 5: 运行词书测试**

Run: `node --test tests/wordbook-service.test.js`

Expected: 2 tests PASS；如果少于 100 词、字段为空或单词重复，测试必须 FAIL。

- [ ] **Step 6: 提交完整词书**

```bash
git add miniprogram/data/cet4-core-100.js miniprogram/services/wordbook-service.js tests/wordbook-service.test.js
git commit -m "feat: add built-in CET4 wordbook"
```

## Task 3: 实现可恢复的学习轮次引擎

**Files:**
- Create: `miniprogram/utils/round-engine.js`
- Create: `miniprogram/utils/round-storage.js`
- Test: `tests/round-engine.test.js`

- [ ] **Step 1: 写入轮次和选项生成测试**

```js
// tests/round-engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRound, createQuizOptions, answerCurrent, getSummary } = require('../miniprogram/utils/round-engine');

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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/round-engine.test.js`

Expected: FAIL，错误包含 `Cannot find module`。

- [ ] **Step 3: 实现纯函数轮次引擎**

```js
// miniprogram/utils/round-engine.js
function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function createRound(words, size, mode, random = Math.random) {
  if (!['flashcard', 'quiz'].includes(mode)) throw new Error('学习模式无效');
  // 普通设置只允许 10/20；错词复习允许 1 至 20 个实际错词。
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new Error('每轮单词数无效');
  if (words.length < size) throw new Error('可用单词数量不足');
  return {
    roundId: `round-${Date.now()}-${Math.floor(random() * 1000000)}`,
    mode,
    size,
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    answeredCurrent: false,
    completed: false,
    items: shuffle(words, random).slice(0, size),
    answers: [],
  };
}

function createQuizOptions(current, allWords, random = Math.random) {
  const distractors = [...new Set(allWords.filter((item) => item.id !== current.id).map((item) => item.meaning))];
  if (distractors.length < 3) throw new Error('四选一干扰项不足');
  return shuffle([current.meaning, ...shuffle(distractors, random).slice(0, 3)], random);
}

function answerCurrent(round, isCorrect) {
  // 锁定已作答题目，防止快速连点导致重复积分。
  if (round.completed || round.answeredCurrent) return round;
  const word = round.items[round.currentIndex];
  return {
    ...round,
    answeredCurrent: true,
    correctCount: round.correctCount + (isCorrect ? 1 : 0),
    wrongCount: round.wrongCount + (isCorrect ? 0 : 1),
    answers: [...round.answers, { wordId: word.id, isCorrect, mode: round.mode }],
  };
}

function nextQuestion(round) {
  if (!round.answeredCurrent) return round;
  const completed = round.currentIndex + 1 >= round.items.length;
  return {
    ...round,
    currentIndex: completed ? round.currentIndex : round.currentIndex + 1,
    answeredCurrent: false,
    completed,
  };
}

function getSummary(round) {
  const answered = round.correctCount + round.wrongCount;
  return {
    roundId: round.roundId,
    mode: round.mode,
    total: round.size,
    correctCount: round.correctCount,
    wrongCount: round.wrongCount,
    accuracy: answered ? Math.round((round.correctCount / answered) * 100) : 0,
    score: round.correctCount * 10,
    answers: round.answers,
  };
}

module.exports = { shuffle, createRound, createQuizOptions, answerCurrent, nextQuestion, getSummary };
```

- [ ] **Step 4: 实现微信存储适配器**

```js
// miniprogram/utils/round-storage.js
const ACTIVE_ROUND_KEY = 'wordrush.activeRound';

function saveRound(round) {
  // 每题后保存，异常退出时可以从当前题继续。
  wx.setStorageSync(ACTIVE_ROUND_KEY, round);
}

function loadRound() {
  return wx.getStorageSync(ACTIVE_ROUND_KEY) || null;
}

function clearRound() {
  wx.removeStorageSync(ACTIVE_ROUND_KEY);
}

module.exports = { saveRound, loadRound, clearRound };
```

- [ ] **Step 5: 运行全部测试**

Run: `npm test`

Expected: 词书、结构和 3 个轮次测试全部 PASS。

- [ ] **Step 6: 提交学习引擎**

```bash
git add miniprogram/utils/round-engine.js miniprogram/utils/round-storage.js tests/round-engine.test.js
git commit -m "feat: add learning round engine"
```

## Task 4: 完成首页与学习设置

**Files:**
- Create: `miniprogram/services/settings-service.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/home/index.{js,wxml,wxss}`
- Create: `miniprogram/pages/settings/index.{js,json,wxml,wxss}`
- Test: `tests/settings-service.test.js`

- [ ] **Step 1: 写入设置服务失败测试**

```js
// tests/settings-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSettings } = require('../miniprogram/services/settings-service');

test('空设置使用卡片模式和每轮 10 词', () => {
  assert.deepEqual(normalizeSettings({}), { defaultMode: 'flashcard', roundSize: 10 });
});

test('非法设置回落到默认值', () => {
  assert.deepEqual(normalizeSettings({ defaultMode: 'other', roundSize: 30 }), { defaultMode: 'flashcard', roundSize: 10 });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/settings-service.test.js`

Expected: FAIL，错误包含 `Cannot find module`。

- [ ] **Step 3: 实现设置服务**

```js
// miniprogram/services/settings-service.js
const SETTINGS_KEY = 'wordrush.settings';

function normalizeSettings(input = {}) {
  return {
    defaultMode: ['flashcard', 'quiz'].includes(input.defaultMode) ? input.defaultMode : 'flashcard',
    roundSize: [10, 20].includes(input.roundSize) ? input.roundSize : 10,
  };
}

function loadSettings() {
  return normalizeSettings(wx.getStorageSync(SETTINGS_KEY));
}

function saveSettings(input) {
  const settings = normalizeSettings(input);
  wx.setStorageSync(SETTINGS_KEY, settings);
  return settings;
}

module.exports = { normalizeSettings, loadSettings, saveSettings };
```

- [ ] **Step 4: 实现首页交互**

首页 `index.js` 必须读取词书、设置和本地学习汇总；点击开始时创建轮次并按模式跳转：

```js
// miniprogram/pages/home/index.js
const { getBuiltinWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { createRound } = require('../../utils/round-engine');
const { saveRound, loadRound } = require('../../utils/round-storage');

Page({
  data: { bookName: '', wordCount: 0, settings: {}, activeRound: null },
  onShow() {
    const book = getBuiltinWordbook();
    this.setData({ bookName: book.name, wordCount: book.words.length, settings: loadSettings(), activeRound: loadRound() });
  },
  startLearning() {
    const book = getBuiltinWordbook();
    const { defaultMode, roundSize } = this.data.settings;
    const round = createRound(book.words, roundSize, defaultMode);
    saveRound(round);
    wx.navigateTo({ url: defaultMode === 'flashcard' ? '/pages/flashcard/index' : '/pages/quiz/index' });
  },
  resumeLearning() {
    const round = loadRound();
    if (!round) return;
    wx.navigateTo({ url: round.mode === 'flashcard' ? '/pages/flashcard/index' : '/pages/quiz/index' });
  },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }); },
});
```

首页 WXML 必须包含词书名称、100 词、当前模式、开始按钮、未完成轮次恢复按钮、设置入口和不可点击的“对战模式后续开放”文案。

- [ ] **Step 5: 实现设置页面**

设置页使用两个单选组：`flashcard/quiz` 与 `10/20`，每次选择后调用 `saveSettings` 并显示“设置已保存”。WXML 中两个学习模式都要附带用途说明，避免只显示内部枚举值。

- [ ] **Step 6: 注册设置页并验证**

在 `app.json` 的 `pages` 数组加入：

```json
"pages/settings/index"
```

Run: `npm test`

Expected: 设置服务测试和全部既有测试 PASS。

Manual: 首页显示 100 词；设置切换为四选一后返回首页，当前模式同步变化。

- [ ] **Step 7: 提交首页与设置**

```bash
git add miniprogram/app.json miniprogram/pages/home miniprogram/pages/settings miniprogram/services/settings-service.js tests/settings-service.test.js
git commit -m "feat: add home and learning settings"
```

## Task 5: 实现单词卡片学习模式

**Files:**
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/flashcard/index.{js,json,wxml,wxss}`

- [ ] **Step 1: 先扩充轮次测试，约束卡片作答映射**

在 `tests/round-engine.test.js` 追加：

```js
test('卡片认识记为正确且不认识记为错误', () => {
  let knownRound = createRound(words, 10, 'flashcard', () => 0.5);
  knownRound = answerCurrent(knownRound, true);
  assert.equal(knownRound.correctCount, 1);

  let unknownRound = createRound(words, 10, 'flashcard', () => 0.5);
  unknownRound = answerCurrent(unknownRound, false);
  assert.equal(unknownRound.wrongCount, 1);
});
```

- [ ] **Step 2: 运行新增测试**

Run: `node --test tests/round-engine.test.js`

Expected: PASS，证明页面可直接复用已验证的领域规则。

- [ ] **Step 3: 实现卡片页状态机**

先在 `app.json` 的 `pages` 数组加入 `pages/flashcard/index`，再实现页面，保证注册和文件在同一提交出现。

页面数据包含 `round`、`currentWord`、`revealed`。`revealCard` 只翻面；`markKnown` 和 `markUnknown` 调用 `answerCurrent`；作答后保存轮次；`next` 调用 `nextQuestion`，完成时跳转 `/pages/summary/index`。

```js
// miniprogram/pages/flashcard/index.js
const { answerCurrent, nextQuestion } = require('../../utils/round-engine');
const { loadRound, saveRound } = require('../../utils/round-storage');

Page({
  data: { round: null, currentWord: null, revealed: false },
  onLoad() { this.refresh(loadRound()); },
  refresh(round) {
    if (!round) return wx.reLaunch({ url: '/pages/home/index' });
    this.setData({ round, currentWord: round.items[round.currentIndex], revealed: round.answeredCurrent });
  },
  revealCard() { this.setData({ revealed: true }); },
  markKnown() { this.record(true); },
  markUnknown() { this.record(false); },
  record(isCorrect) {
    const round = answerCurrent(this.data.round, isCorrect);
    saveRound(round);
    this.refresh(round);
  },
  next() {
    const round = nextQuestion(this.data.round);
    saveRound(round);
    if (round.completed) return wx.redirectTo({ url: '/pages/summary/index' });
    this.setData({ revealed: false });
    this.refresh(round);
  },
});
```

- [ ] **Step 4: 完成卡片页面视觉与手工验收**

WXML 正面显示单词、音标和“查看释义”；翻面后显示释义、例句、翻译、“不认识”“认识”。作答后隐藏判断按钮并显示“下一词”，避免重复计分。

Manual: 完成 10 词；快速连续点击“认识”只增加一次正确数；退出再进入可恢复当前题。

- [ ] **Step 5: 提交卡片模式**

```bash
git add miniprogram/app.json miniprogram/pages/flashcard tests/round-engine.test.js
git commit -m "feat: add flashcard learning mode"
```

## Task 6: 实现四选一学习模式

**Files:**
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/quiz/index.{js,json,wxml,wxss}`

- [ ] **Step 1: 追加确定性错误答案测试**

在 `tests/round-engine.test.js` 追加：

```js
test('选择错误释义会记录错词', () => {
  let round = createRound(words, 10, 'quiz', () => 0.5);
  round = answerCurrent(round, false);
  assert.deepEqual(round.answers[0], { wordId: round.items[0].id, isCorrect: false, mode: 'quiz' });
});
```

- [ ] **Step 2: 运行新增测试**

Run: `node --test tests/round-engine.test.js`

Expected: PASS。

- [ ] **Step 3: 实现四选一页**

先在 `app.json` 的 `pages` 数组加入 `pages/quiz/index`，再实现页面。

页面加载或进入下一题时，使用 `createQuizOptions(currentWord, round.items)` 生成四项；选择后比较选项与 `currentWord.meaning`，调用 `answerCurrent`，锁定选项并显示正确答案与例句。

```js
// miniprogram/pages/quiz/index.js
const { createQuizOptions, answerCurrent, nextQuestion } = require('../../utils/round-engine');
const { loadRound, saveRound } = require('../../utils/round-storage');

Page({
  data: { round: null, currentWord: null, options: [], selected: '', isCorrect: false },
  onLoad() { this.refresh(loadRound()); },
  refresh(round) {
    if (!round) return wx.reLaunch({ url: '/pages/home/index' });
    const currentWord = round.items[round.currentIndex];
    this.setData({ round, currentWord, options: createQuizOptions(currentWord, round.items), selected: '', isCorrect: false });
  },
  chooseOption(event) {
    if (this.data.round.answeredCurrent) return;
    const selected = event.currentTarget.dataset.value;
    const isCorrect = selected === this.data.currentWord.meaning;
    const round = answerCurrent(this.data.round, isCorrect);
    saveRound(round);
    this.setData({ round, selected, isCorrect });
  },
  next() {
    const round = nextQuestion(this.data.round);
    saveRound(round);
    if (round.completed) return wx.redirectTo({ url: '/pages/summary/index' });
    this.refresh(round);
  },
});
```

- [ ] **Step 4: 完成答题反馈视觉与手工验收**

WXML 为四个选项绑定唯一 `data-value`；答题后正确项显示绿色，所选错误项显示红色，同时显示例句、中文翻译和“下一题”。

Manual: 每题恰好四个不重复选项；答错和答对反馈正确；重复点击不改变得分；10 题后进入总结。

- [ ] **Step 5: 提交四选一模式**

```bash
git add miniprogram/app.json miniprogram/pages/quiz tests/round-engine.test.js
git commit -m "feat: add quiz learning mode"
```

## Task 7: 完成学习总结、错词和本地同步队列

**Files:**
- Modify: `miniprogram/app.json`
- Create: `miniprogram/services/learning-repository.js`
- Create: `miniprogram/services/sync-queue.js`
- Create: `miniprogram/pages/summary/index.{js,json,wxml,wxss}`
- Create: `miniprogram/pages/wrong-words/index.{js,json,wxml,wxss}`
- Test: `tests/sync-queue.test.js`

- [ ] **Step 1: 写入待同步队列失败测试**

```js
// tests/sync-queue.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueue } = require('../miniprogram/services/sync-queue');

test('相同 roundId 只入队一次', () => {
  const memory = [];
  const queue = createQueue(() => memory, (value) => { memory.splice(0, memory.length, ...value); });
  queue.enqueue({ roundId: 'r1' });
  queue.enqueue({ roundId: 'r1' });
  assert.equal(queue.list().length, 1);
});

test('同步成功后移除，失败时保留', async () => {
  const memory = [{ roundId: 'r1' }, { roundId: 'r2' }];
  const queue = createQueue(() => memory, (value) => { memory.splice(0, memory.length, ...value); });
  await queue.flush(async (item) => item.roundId === 'r1');
  assert.deepEqual(queue.list().map((item) => item.roundId), ['r2']);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/sync-queue.test.js`

Expected: FAIL，错误包含 `Cannot find module`。

- [ ] **Step 3: 实现队列和本地学习仓库**

```js
// miniprogram/services/sync-queue.js
const QUEUE_KEY = 'wordrush.syncQueue';

function createQueue(read, write) {
  return {
    list: () => [...read()],
    enqueue(item) {
      const current = read();
      if (!current.some((entry) => entry.roundId === item.roundId)) write([...current, item]);
    },
    async flush(send) {
      const remaining = [];
      for (const item of read()) {
        try {
          const success = await send(item);
          if (!success) remaining.push(item);
        } catch (error) {
          remaining.push(item);
        }
      }
      write(remaining);
      return remaining;
    },
  };
}

function createWxQueue() {
  return createQueue(
    () => wx.getStorageSync(QUEUE_KEY) || [],
    (value) => wx.setStorageSync(QUEUE_KEY, value),
  );
}

module.exports = { createQueue, createWxQueue };
```

`learning-repository.js` 使用 `wordrush.learningRecords` 保存按 `wordId` 聚合的 `correctCount`、`wrongCount`、`lastResult`、`isWrongWord` 和 `lastStudiedAt`。`applySummary(summary)` 必须以 `roundId` 去重，更新错词后将总结加入待同步队列。

- [ ] **Step 4: 实现总结页**

在 `app.json` 的 `pages` 数组加入 `pages/summary/index` 和 `pages/wrong-words/index`，并与两个页面文件一起提交。

总结页从活动轮次调用 `getSummary`，只调用一次 `learningRepository.applySummary`，展示正确数、错误数、正确率和得分；成功后调用 `clearRound`。按钮包括“再练一轮”“复习错词”“返回首页”。

- [ ] **Step 5: 实现错词页**

错词页读取 `isWrongWord === true` 的记录，再按 `wordId` 关联内置词书，展示单词、释义和错误次数。没有错词时显示明确空状态；复习轮次大小使用 `Math.min(10, wrongWords.length)`，错词数不少于 4 时可进入四选一，否则使用卡片模式。

- [ ] **Step 6: 测试与提交**

Run: `npm test`

Expected: 所有测试 PASS。

Manual: 答错 2 个词后总结显示 2 个错误；错词页显示相同单词；相同总结重复进入不重复累计。

```bash
git add miniprogram/app.json miniprogram/services/learning-repository.js miniprogram/services/sync-queue.js miniprogram/pages/summary miniprogram/pages/wrong-words tests/sync-queue.test.js
git commit -m "feat: add summary and wrong-word review"
```

## Task 8: 接入 CloudBase 登录和幂等学习同步

**Files:**
- Create: `miniprogram/services/cloud-api.js`
- Modify: `miniprogram/app.js`
- Create: `cloudfunctions/login/index.js`
- Create: `cloudfunctions/login/package.json`
- Create: `cloudfunctions/sync-learning/index.js`
- Create: `cloudfunctions/sync-learning/package.json`
- Test: `tests/sync-learning.test.js`

- [ ] **Step 1: 写入云端幂等聚合逻辑测试**

```js
// tests/sync-learning.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeLearningRecord } = require('../cloudfunctions/sync-learning/merge-learning-record');

test('正确答案累加正确次数并清除错词状态', () => {
  const merged = mergeLearningRecord({ correctCount: 1, wrongCount: 2 }, { isCorrect: true, mode: 'quiz' });
  assert.equal(merged.correctCount, 2);
  assert.equal(merged.wrongCount, 2);
  assert.equal(merged.isWrongWord, false);
});

test('错误答案累加错误次数并进入错词', () => {
  const merged = mergeLearningRecord({}, { isCorrect: false, mode: 'flashcard' });
  assert.equal(merged.wrongCount, 1);
  assert.equal(merged.isWrongWord, true);
});
```

- [ ] **Step 2: 实现可测试的记录合并函数**

```js
// cloudfunctions/sync-learning/merge-learning-record.js
function mergeLearningRecord(current = {}, answer) {
  return {
    correctCount: (current.correctCount || 0) + (answer.isCorrect ? 1 : 0),
    wrongCount: (current.wrongCount || 0) + (answer.isCorrect ? 0 : 1),
    lastResult: answer.isCorrect ? 'correct' : 'wrong',
    isWrongWord: !answer.isCorrect,
    lastMode: answer.mode,
  };
}

module.exports = { mergeLearningRecord };
```

- [ ] **Step 3: 实现登录云函数**

```js
// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  // OpenID 只在云函数中获取，客户端不接受自报身份。
  const { OPENID } = cloud.getWXContext();
  return { openid: OPENID };
};
```

```json
// cloudfunctions/login/package.json
{
  "name": "login",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "latest" }
}
```

- [ ] **Step 4: 实现同步云函数**

`sync-learning/index.js` 必须执行以下顺序：从云上下文读取 OpenID；校验 `roundId`、`answers` 和模式；先查询 `learning_rounds` 的 `${OPENID}_${roundId}`；存在则直接返回 `{ duplicate: true }`；不存在则在事务中写入轮次标记、逐个聚合 `learning_records`、累加 `users.totalScore`。任何一步失败都回滚，确保重复请求不重复积分。

云函数返回固定结构：

```js
{ success: true, duplicate: false, roundId: event.roundId }
```

- [ ] **Step 5: 实现客户端云边界和启动重试**

```js
// miniprogram/services/cloud-api.js
async function login() {
  if (!wx.cloud) return { cloudAvailable: false, openid: '' };
  const response = await wx.cloud.callFunction({ name: 'login' });
  return { cloudAvailable: true, openid: response.result.openid };
}

async function syncLearning(summary) {
  if (!wx.cloud) return false;
  const response = await wx.cloud.callFunction({ name: 'sync-learning', data: summary });
  return Boolean(response.result && response.result.success);
}

module.exports = { login, syncLearning };
```

在 `app.js` 的 `onLaunch` 初始化云开发后调用登录，并用 `createWxQueue().flush(syncLearning)` 重试。失败只记录状态和展示可重试提示，不清除队列。

- [ ] **Step 6: 运行测试并部署云函数**

Run: `npm test`

Expected: 云端合并测试和全部既有测试 PASS。

Manual: 在微信开发者工具右键 `login` 与 `sync-learning`，分别选择“上传并部署：云端安装依赖”。创建 `users`、`learning_records`、`learning_rounds` 集合。完成一轮后云数据库出现一次轮次和对应单词累计记录；重新提交同一轮不增加积分。

- [ ] **Step 7: 提交云同步**

```bash
git add miniprogram/app.js miniprogram/services/cloud-api.js cloudfunctions/login cloudfunctions/sync-learning tests/sync-learning.test.js
git commit -m "feat: sync learning progress with CloudBase"
```

## Task 9: 种入云端词书并完成最终验收

**Files:**
- Create: `scripts/prepare-cloud-wordbook.js`
- Create: `cloudfunctions/seed-wordbook/index.js`
- Create: `cloudfunctions/seed-wordbook/package.json`
- Generate: `cloudfunctions/seed-wordbook/data.js`
- Modify: `README.md`

- [ ] **Step 1: 创建唯一数据源复制脚本**

```js
// scripts/prepare-cloud-wordbook.js
const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'miniprogram', 'data', 'cet4-core-100.js');
const target = path.join(__dirname, '..', 'cloudfunctions', 'seed-wordbook', 'data.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('已生成云函数词书数据：cloudfunctions/seed-wordbook/data.js');
```

- [ ] **Step 2: 创建幂等种子云函数**

`seed-wordbook` 仅允许仓库维护者在开发者工具手动调用。函数按固定 `_id: cet4-core-100` 写入 `wordbooks`，单词按数据中的 `id` 作为 `_id` 写入 `words`；存在则更新，不存在则新增。返回 `{ wordbookId: 'cet4-core-100', wordCount: 100 }`，词书校验不是 100 条时直接抛错。

- [ ] **Step 3: 生成数据并运行完整自动测试**

Run: `npm run prepare:cloud`

Expected: 输出 `已生成云函数词书数据`。

Run: `npm test`

Expected: 所有 tests PASS，0 FAIL。

- [ ] **Step 4: 编写 README 启动说明**

README 必须明确列出：

1. 微信开发者工具导入根目录。
2. UI 演示可使用 `touristappid`；CloudBase 功能需要换成用户自己的小程序 AppID。
3. 创建云环境和五个集合：`users`、`wordbooks`、`words`、`learning_records`、`learning_rounds`。
4. 依次部署 `login`、`sync-learning`、`seed-wordbook`。
5. 调用一次 `seed-wordbook` 并确认返回 100。
6. 本地执行 `npm test` 的方法。
7. 当前不包含排行榜和联机对战。

- [ ] **Step 5: 在微信开发者工具完成回归验收**

Manual checklist:

```text
[ ] 首次启动能进入首页，未配置云环境时有明确提示而非白屏
[ ] 首页显示“四级核心词汇”和 100 词
[ ] 默认卡片模式可完成 10 词并得到正确总结
[ ] 设置切换四选一后，下一轮进入四选一
[ ] 四选一每题四个不重复选项，作答后锁定
[ ] 错词进入错词页，答对复习题后可移出错词
[ ] 中断一轮后重新进入可恢复
[ ] 断网提交进入本地队列，恢复网络后同步并清除
[ ] 相同 roundId 重试不会重复积分
[ ] 云端 wordbooks.wordCount 与 words 实际数量都是 100
```

- [ ] **Step 6: 检查仓库并提交最终 MVP**

Run: `git diff --check`

Expected: 无输出。

Run: `git status --short`

Expected: 只显示 Task 9 列出的文件。

```bash
git add README.md scripts/prepare-cloud-wordbook.js cloudfunctions/seed-wordbook
git commit -m "docs: add CloudBase setup and MVP verification"
```

- [ ] **Step 7: 最终全量验证**

Run: `npm test`

Expected: 全部自动测试 PASS。

Run: `git log --oneline -9`

Expected: 按顺序看到项目骨架、词书、学习引擎、首页设置、卡片、四选一、总结错词、云同步和最终说明的独立提交。

## 实施纪律

- 一次只执行一个 Task；当前 Task 的自动测试和手工验收通过后才能进入下一个。
- 只暂存当前 Task 的文件，不使用 `git add -A`。
- 业务 JavaScript 添加中文注释；JSON 不强行加入非法注释。
- 不在 MVP 中加入排行榜、实时对战、好友或运营后台。
- CloudBase 环境与真实 AppID 属于部署配置，不写入仓库；仓库保持 `touristappid`，确保 UI 可直接导入运行。
