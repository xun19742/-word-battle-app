# WordRush Immersive Flashcard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单词卡片背词页改造成沉浸式深色界面，并支持点击页面主体显示词义，同时保持现有学习记录流程不变。

**Architecture:** 继续沿用当前原生微信小程序页面结构，不新增组件和依赖。页面 JavaScript 负责限制显示词义的合法状态，WXML 负责页面级点击和按钮事件隔离，WXSS 与页面 JSON 只改变单词卡片页的视觉呈现。

**Tech Stack:** 原生微信小程序（JavaScript、WXML、WXSS）、Node.js 内置测试运行器 `node:test`

---

## 文件结构

- Create: `tests/flashcard-page.test.js`：验证页面交互配置、事件隔离和视觉配置。
- Modify: `miniprogram/pages/flashcard/index.js`：保护 `revealCard`，只在有效回忆状态显示词义。
- Modify: `miniprogram/pages/flashcard/index.wxml`：把显示词义入口改为页面主体点击，并隔离答题按钮事件。
- Modify: `miniprogram/pages/flashcard/index.wxss`：实现仅用于背词页的深蓝渐变、半透明卡片和薄荷绿强调色。
- Modify: `miniprogram/pages/flashcard/index.json`：让背词页导航栏和下拉背景匹配深色主题。

### Task 1: 保护显示词义交互

**Files:**
- Create: `tests/flashcard-page.test.js`
- Modify: `miniprogram/pages/flashcard/index.js`

- [ ] **Step 1: 写入失败测试**

创建 `tests/flashcard-page.test.js`，先验证有效状态可以显示词义，无轮次、无当前词、已显示或已作答时不会再次更新页面：

```js
// 背词页测试直接加载页面配置，验证交互状态而不依赖微信运行时。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadPageConfig() {
  let pageConfig;
  global.Page = (config) => {
    pageConfig = config;
  };
  const pagePath = require.resolve('../miniprogram/pages/flashcard/index');
  delete require.cache[pagePath];
  require(pagePath);
  delete global.Page;
  return pageConfig;
}

test('有效回忆状态下点击页面显示词义', () => {
  const pageConfig = loadPageConfig();
  const updates = [];
  const context = {
    data: {
      round: { answeredCurrent: false },
      currentWord: { word: 'achieve' },
      revealed: false,
    },
    setData(value) {
      updates.push(value);
    },
  };

  pageConfig.revealCard.call(context);

  assert.deepEqual(updates, [{ revealed: true }]);
});

test('无效或已完成的回忆状态不会重复显示词义', () => {
  const pageConfig = loadPageConfig();
  const states = [
    { round: null, currentWord: null, revealed: false },
    { round: { answeredCurrent: false }, currentWord: null, revealed: false },
    { round: { answeredCurrent: false }, currentWord: { word: 'achieve' }, revealed: true },
    { round: { answeredCurrent: true }, currentWord: { word: 'achieve' }, revealed: true },
  ];

  states.forEach((data) => {
    let updateCount = 0;
    pageConfig.revealCard.call({
      data,
      setData() {
        updateCount += 1;
      },
    });
    assert.equal(updateCount, 0);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
$node = 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --test tests\flashcard-page.test.js
```

Expected: 第二个测试 FAIL，因为当前 `revealCard` 在所有状态都会调用 `setData`。

- [ ] **Step 3: 编写最小实现**

将 `miniprogram/pages/flashcard/index.js` 中的 `revealCard` 替换为：

```js
  revealCard() {
    const {
      round,
      currentWord,
      revealed,
    } = this.data;
    // 只允许有效且尚未作答的当前词进入释义状态。
    if (!round || !currentWord || revealed || round.answeredCurrent) {
      return;
    }
    this.setData({ revealed: true });
  },
```

- [ ] **Step 4: 运行测试并确认通过**

Run:

```powershell
& $node --test tests\flashcard-page.test.js
```

Expected: 2 tests PASS，0 tests FAIL。

- [ ] **Step 5: 提交交互保护**

```powershell
git add tests/flashcard-page.test.js miniprogram/pages/flashcard/index.js
git commit -m "feat: guard flashcard reveal interaction"
```

### Task 2: 改为点击页面显示词义

**Files:**
- Modify: `tests/flashcard-page.test.js`
- Modify: `miniprogram/pages/flashcard/index.wxml`

- [ ] **Step 1: 增加失败的页面结构测试**

在 `tests/flashcard-page.test.js` 末尾增加：

```js
test('页面主体点击显示词义并隔离答题按钮事件', () => {
  const wxmlPath = path.join(
    __dirname,
    '..',
    'miniprogram',
    'pages',
    'flashcard',
    'index.wxml',
  );
  const wxml = fs.readFileSync(wxmlPath, 'utf8');

  assert.match(wxml, /class="page flashcard-page"[^>]*bindtap="revealCard"/);
  assert.match(wxml, /点击屏幕查看词义/);
  assert.doesNotMatch(wxml, />查看释义<\/button>/);
  assert.match(wxml, /catchtap="markUnknown"/);
  assert.match(wxml, /catchtap="markKnown"/);
  assert.match(wxml, /catchtap="next"/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
& $node --test tests\flashcard-page.test.js
```

Expected: 新增测试 FAIL，因为根节点没有 `bindtap="revealCard"`，页面仍存在“查看释义”按钮。

- [ ] **Step 3: 替换背词页结构**

将 `miniprogram/pages/flashcard/index.wxml` 完整替换为：

```xml
<!-- 背词页通过整页点击显示词义，并让答题按钮阻止事件冒泡。 -->
<view class="page flashcard-page" wx:if="{{round}}" bindtap="revealCard">
  <view class="progress-header">
    <text>第 {{round.currentIndex + 1}} / {{round.size}} 词</text>
    <text>已掌握 {{round.correctCount}}</text>
  </view>
  <view class="progress-track">
    <view class="progress-value" style="width: {{((round.currentIndex + 1) / round.size) * 100}}%;"></view>
  </view>

  <view class="word-card {{revealed ? 'word-card-revealed' : ''}}">
    <text class="word">{{currentWord.word}}</text>
    <text class="phonetic">{{currentWord.phonetic}}</text>

    <view wx:if="{{revealed}}" class="meaning-block">
      <text class="meaning">{{currentWord.meaning}}</text>
      <text class="example">{{currentWord.example}}</text>
      <text class="translation">{{currentWord.exampleTranslation}}</text>
    </view>
    <view wx:else class="recall-block">
      <text class="recall-tip">点击屏幕查看词义</text>
      <text class="recall-subtitle">先在心里回忆它的含义</text>
    </view>
  </view>

  <view wx:if="{{revealed && !round.answeredCurrent}}" class="answer-actions">
    <button class="unknown-button" catchtap="markUnknown">不认识</button>
    <button class="known-button" catchtap="markKnown">认识</button>
  </view>

  <view wx:elif="{{revealed && round.answeredCurrent}}" class="feedback">
    <text>{{resultLabel}}</text>
    <button class="next-button" catchtap="next">下一词</button>
  </view>
</view>
```

- [ ] **Step 4: 运行测试并确认通过**

Run:

```powershell
& $node --test tests\flashcard-page.test.js
```

Expected: 3 tests PASS，0 tests FAIL。

- [ ] **Step 5: 提交页面交互结构**

```powershell
git add tests/flashcard-page.test.js miniprogram/pages/flashcard/index.wxml
git commit -m "feat: reveal flashcard meaning on page tap"
```

### Task 3: 应用沉浸式深色视觉

**Files:**
- Modify: `tests/flashcard-page.test.js`
- Modify: `miniprogram/pages/flashcard/index.wxss`
- Modify: `miniprogram/pages/flashcard/index.json`

- [ ] **Step 1: 增加失败的主题测试**

在 `tests/flashcard-page.test.js` 末尾增加：

```js
test('背词页使用独立深色主题和薄荷绿强调色', () => {
  const pageDir = path.join(
    __dirname,
    '..',
    'miniprogram',
    'pages',
    'flashcard',
  );
  const wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
  const pageConfig = JSON.parse(
    fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8'),
  );

  assert.match(wxss, /linear-gradient\(160deg, #171d3c, #343b77\)/);
  assert.match(wxss, /#a9f0d1/);
  assert.match(wxss, /animation: meaning-fade-in 200ms ease-out/);
  assert.equal(pageConfig.navigationBarBackgroundColor, '#171D3C');
  assert.equal(pageConfig.backgroundColor, '#171D3C');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
& $node --test tests\flashcard-page.test.js
```

Expected: 新增测试 FAIL，因为当前页面仍使用浅色背景与紫色强调色。

- [ ] **Step 3: 替换背词页样式**

将 `miniprogram/pages/flashcard/index.wxss` 完整替换为：

```css
/* 背词页使用独立深色主题，其他页面继续沿用全局浅色设计。 */
page {
  color: #f4f6ff;
  background: #171d3c;
}

.flashcard-page {
  display: flex;
  min-height: 100vh;
  padding-bottom: 48rpx;
  flex-direction: column;
  background: linear-gradient(160deg, #171d3c, #343b77);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  color: #c7cdef;
  font-size: 25rpx;
}

.progress-track {
  height: 12rpx;
  margin: 18rpx 0 40rpx;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 999rpx;
}

.progress-value {
  height: 100%;
  background: #a9f0d1;
  border-radius: 999rpx;
}

.word-card {
  display: flex;
  min-height: 650rpx;
  padding: 56rpx 48rpx;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 2rpx solid rgba(255, 255, 255, 0.18);
  border-radius: 36rpx;
  box-shadow: 0 24rpx 70rpx rgba(7, 11, 35, 0.28);
}

.word-card-revealed {
  justify-content: flex-start;
  padding-top: 76rpx;
}

.word {
  color: #ffffff;
  font-size: 72rpx;
  font-weight: 750;
  letter-spacing: 1rpx;
}

.phonetic {
  margin-top: 14rpx;
  color: #c7cdef;
}

.recall-block {
  display: flex;
  margin-top: 72rpx;
  flex-direction: column;
  align-items: center;
}

.recall-tip {
  color: #a9f0d1;
  font-size: 28rpx;
  font-weight: 700;
}

.recall-subtitle {
  margin-top: 14rpx;
  color: #aeb7db;
  font-size: 24rpx;
}

.meaning-block {
  display: flex;
  width: 100%;
  margin-top: 60rpx;
  flex-direction: column;
  text-align: left;
  animation: meaning-fade-in 200ms ease-out;
}

.meaning {
  color: #ffffff;
  font-size: 35rpx;
  font-weight: 700;
}

.example {
  margin-top: 38rpx;
  color: #eef1ff;
  line-height: 1.65;
}

.translation {
  margin-top: 14rpx;
  color: #b9c1e3;
  font-size: 26rpx;
  line-height: 1.55;
}

.answer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
  margin-top: 34rpx;
}

.unknown-button,
.known-button,
.next-button {
  border-radius: 999rpx;
  font-weight: 700;
}

.unknown-button {
  color: #ffd7dc;
  background: rgba(217, 86, 86, 0.22);
  border: 2rpx solid rgba(255, 174, 185, 0.42);
}

.known-button,
.next-button {
  color: #1c2942;
  background: #a9f0d1;
}

.unknown-button::after,
.known-button::after,
.next-button::after {
  border: 0;
}

.feedback {
  margin-top: 30rpx;
  color: #a9f0d1;
  text-align: center;
  font-weight: 700;
}

.next-button {
  margin-top: 22rpx;
}

@keyframes meaning-fade-in {
  from {
    opacity: 0;
    transform: translateY(16rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 4: 更新页面级导航栏配置**

将 `miniprogram/pages/flashcard/index.json` 完整替换为：

```json
{
  "navigationBarTitleText": "单词卡片",
  "navigationBarBackgroundColor": "#171D3C",
  "navigationBarTextStyle": "white",
  "backgroundColor": "#171D3C"
}
```

- [ ] **Step 5: 运行测试并确认通过**

Run:

```powershell
& $node --test tests\flashcard-page.test.js
```

Expected: 4 tests PASS，0 tests FAIL。

- [ ] **Step 6: 提交视觉主题**

```powershell
git add tests/flashcard-page.test.js miniprogram/pages/flashcard/index.wxss miniprogram/pages/flashcard/index.json
git commit -m "feat: style immersive flashcard page"
```

### Task 4: 全量验证与微信开发者工具验收

**Files:**
- Verify: `miniprogram/pages/flashcard/index.js`
- Verify: `miniprogram/pages/flashcard/index.wxml`
- Verify: `miniprogram/pages/flashcard/index.wxss`
- Verify: `miniprogram/pages/flashcard/index.json`
- Verify: `tests/flashcard-page.test.js`

- [ ] **Step 1: 运行全部自动化测试**

Run:

```powershell
& $node --test
```

Expected: 39 tests PASS，0 tests FAIL。

- [ ] **Step 2: 检查全部 JavaScript 语法**

Run:

```powershell
Get-ChildItem miniprogram,cloudfunctions,scripts,tests -Recurse -Filter *.js | ForEach-Object {
  & $node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "JavaScript 语法检查失败：$($_.FullName)" }
}
```

Expected: 命令退出码为 0，没有语法错误。

- [ ] **Step 3: 检查全部 JSON 文件**

Run:

```powershell
Get-ChildItem miniprogram,cloudfunctions -Recurse -Filter *.json | ForEach-Object {
  Get-Content -Encoding UTF8 -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
```

Expected: 命令退出码为 0，没有 JSON 解析错误。

- [ ] **Step 4: 在微信开发者工具中手工验收**

1. 点击“编译”，确认控制台没有红色错误。
2. 从首页进入“单词卡片”背词页，确认首页仍是浅色，背词页切换为深蓝渐变。
3. 确认单词、音标、进度条和“点击屏幕查看词义”正常显示。
4. 点击页面主体，确认释义与例句淡入，且只出现一次。
5. 点击“不认识”和“认识”，确认各自只记录一次，不会因为页面点击重复触发。
6. 点击“下一词”，确认进入下一词；完成最后一词后确认进入总结页。
7. 在较窄模拟器尺寸下检查长例句，确认内容不被卡片裁切。

- [ ] **Step 5: 检查提交范围**

Run:

```powershell
git status --short
git diff --check HEAD~3..HEAD
```

Expected: 仅保留微信开发者工具生成的本机配置变更；功能提交中没有空白错误。

不提交 `project.config.json` 和 `project.private.config.json`，它们属于用户本机的微信开发者工具配置。
