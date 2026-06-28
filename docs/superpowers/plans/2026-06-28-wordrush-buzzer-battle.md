# WordRush Buzzer Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace independent parallel battle answering with a 10-second shared-question buzzer mode where correct answers score, wrong answers deduct points and lock only that player, and CloudBase transactions determine the winner of concurrent submissions.

**Architecture:** Pure functions in `battle-rules.js` own shared question state and scoring. The `battle` cloud function executes answer and timeout transitions inside database transactions, while `battle-service.js` and the battle room page display the watched room state and a server-based countdown.

**Tech Stack:** WeChat Mini Program, CloudBase `wx-server-sdk`, CommonJS, `node:test`, CloudBase transactions and document watch.

---

## File Structure

- Modify `cloudfunctions/battle/battle-rules.js`: shared question state, score changes, locks, timeout and settlement.
- Modify `tests/battle-rules.test.js`: buzzer rule regression tests.
- Modify `cloudfunctions/battle/index.js`: transaction-backed `submitAnswer` and `advanceTimeout`.
- Modify `tests/battle-cloud-function.test.js`: transaction and short business-error coverage.
- Create `miniprogram/utils/battle-countdown.js`: calculate remaining seconds from a cloud deadline.
- Create `tests/battle-countdown.test.js`: countdown boundary tests.
- Modify `miniprogram/services/battle-service.js`: add `advanceTimeout`.
- Modify `tests/battle-service.test.js`: verify answer and timeout action payloads.
- Modify `miniprogram/pages/battle-room/index.js`: shared question, local countdown, lock and submit state.
- Modify `miniprogram/pages/battle-room/index.wxml`: direct option answering and lock feedback.
- Modify `miniprogram/pages/battle-room/index.wxss`: timer and locked option styles.
- Modify `tests/battle-page.test.js`: static buzzer page coverage.
- Modify `README.md`: buzzer rules and redeployment instructions.

## Task 1: Shared Buzzer Rules

**Files:**
- Modify: `cloudfunctions/battle/battle-rules.js`
- Modify: `tests/battle-rules.test.js`

- [ ] **Step 1: Replace independent-answer tests with failing buzzer tests**

Add these cases to `tests/battle-rules.test.js` and remove assertions that expect both players to advance independently:

```js
test('开始房间后初始化共享题号和十秒截止时间', () => {
  const started = createStartedRoom();

  assert.equal(started.currentQuestionIndex, 0);
  assert.equal(started.questionStatus, 'open');
  assert.deepEqual(started.lockedOpenids, []);
  assert.equal(started.questionStartedAt, now());
  assert.equal(started.questionDeadlineAt, '2026-06-26T08:00:10.000Z');
});

test('答错扣五分并只锁定答错玩家', () => {
  const answered = submitBuzzerAnswer(createStartedRoom(), {
    openid: owner.openid,
    questionIndex: 0,
    selected: '错误答案',
    now,
  });

  assert.equal(answered.players[0].score, -5);
  assert.deepEqual(answered.lockedOpenids, [owner.openid]);
  assert.equal(answered.currentQuestionIndex, 0);
});

test('对手在一方答错后答对会得分并进入下一题', () => {
  const wrong = submitBuzzerAnswer(createStartedRoom(), {
    openid: owner.openid,
    questionIndex: 0,
    selected: '错误答案',
    now,
  });
  const correct = submitBuzzerAnswer(wrong, {
    openid: guest.openid,
    questionIndex: 0,
    selected: questions[0].correctOption,
    now,
  });

  assert.equal(correct.players[0].score, -5);
  assert.equal(correct.players[1].score, 10);
  assert.equal(correct.currentQuestionIndex, 1);
  assert.deepEqual(correct.lockedOpenids, []);
  assert.equal(correct.lastQuestionResult.result, 'correct');
});

test('双方都答错会自动进入下一题', () => {
  let room = submitBuzzerAnswer(createStartedRoom(), {
    openid: owner.openid,
    questionIndex: 0,
    selected: '错误答案',
    now,
  });
  room = submitBuzzerAnswer(room, {
    openid: guest.openid,
    questionIndex: 0,
    selected: '错误答案',
    now,
  });

  assert.equal(room.currentQuestionIndex, 1);
  assert.equal(room.lastQuestionResult.result, 'both-wrong');
});

test('超时请求只推进匹配的当前题', () => {
  const room = advanceTimedOutQuestion(createStartedRoom(), {
    questionIndex: 0,
    now: () => '2026-06-26T08:00:11.000Z',
  });
  const repeated = advanceTimedOutQuestion(room, {
    questionIndex: 0,
    now: () => '2026-06-26T08:00:12.000Z',
  });

  assert.equal(room.currentQuestionIndex, 1);
  assert.equal(room.lastQuestionResult.result, 'timeout');
  assert.deepEqual(repeated, room);
});
```

- [ ] **Step 2: Run the rule tests and confirm RED**

Run:

```powershell
node --test tests\battle-rules.test.js
```

Expected: FAIL because `submitBuzzerAnswer`, `advanceTimedOutQuestion` and shared question fields do not exist.

- [ ] **Step 3: Add shared question helpers**

In `cloudfunctions/battle/battle-rules.js`, add:

```js
const QUESTION_SECONDS = 10;

function addSeconds(timestamp, seconds) {
  return new Date(new Date(timestamp).getTime() + seconds * 1000).toISOString();
}

function resetQuestionState(room, questionIndex, now) {
  const timestamp = safeNow(now);
  return {
    ...room,
    currentQuestionIndex: questionIndex,
    questionStatus: 'open',
    lockedOpenids: [],
    questionWinnerOpenid: '',
    questionStartedAt: timestamp,
    questionDeadlineAt: addSeconds(timestamp, QUESTION_SECONDS),
    updatedAt: timestamp,
  };
}

function advanceQuestion(room, result, now) {
  const nextIndex = room.currentQuestionIndex + 1;
  const lastQuestionResult = {
    questionIndex: room.currentQuestionIndex,
    result: result.result,
    winnerOpenid: result.winnerOpenid || '',
  };
  if (nextIndex >= room.questions.length) {
    return settleBattleRoom({
      ...room,
      lastQuestionResult,
      questionStatus: 'resolved',
    }, now);
  }
  return resetQuestionState({
    ...room,
    lastQuestionResult,
  }, nextIndex, now);
}
```

- [ ] **Step 4: Replace start and answer transitions**

Replace `startBattleRoom` return logic and independent `submitBattleAnswer` with:

```js
function startBattleRoom(room, openid, now) {
  assertStatus(room, 'waiting');
  if (room.ownerOpenid !== openid) throw new Error('只有房主可以开始');
  if (room.players.length !== 2 || room.players.some((player) => !player.ready)) {
    throw new Error('双方准备后才能开始');
  }
  return resetQuestionState({
    ...room,
    status: 'playing',
    players: room.players.map((player) => ({ ...player, score: 0 })),
    answers: {},
    startedAt: safeNow(now),
  }, 0, now);
}

function submitBuzzerAnswer(room, { openid, questionIndex, selected, now }) {
  assertStatus(room, 'playing');
  if (questionIndex !== room.currentQuestionIndex || room.questionStatus !== 'open') {
    return room;
  }
  if (room.lockedOpenids.includes(openid)) return room;
  const question = room.questions[questionIndex];
  if (!question) throw new Error('题目不存在');
  const timestamp = safeNow(now);
  const isCorrect = selected === question.correctOption;
  const scoreDelta = isCorrect ? 10 : -5;
  const players = updatePlayer(room, openid, (player) => ({
    ...player,
    score: player.score + scoreDelta,
  }));
  const answers = {
    ...room.answers,
    [questionIndex]: [
      ...(room.answers[questionIndex] || []),
      { openid, selected, isCorrect, scoreDelta, answeredAt: timestamp },
    ],
  };
  const lockedOpenids = isCorrect
    ? room.lockedOpenids
    : [...room.lockedOpenids, openid];
  const nextRoom = { ...room, players, answers, lockedOpenids, updatedAt: timestamp };
  if (isCorrect) {
    return advanceQuestion(nextRoom, { result: 'correct', winnerOpenid: openid }, now);
  }
  if (lockedOpenids.length >= room.players.length) {
    return advanceQuestion(nextRoom, { result: 'both-wrong' }, now);
  }
  return nextRoom;
}

function advanceTimedOutQuestion(room, { questionIndex, now }) {
  if (
    room.status !== 'playing'
    || room.questionStatus !== 'open'
    || questionIndex !== room.currentQuestionIndex
    || new Date(safeNow(now)).getTime() < new Date(room.questionDeadlineAt).getTime()
  ) {
    return room;
  }
  return advanceQuestion(room, { result: 'timeout' }, now);
}
```

Export `submitBuzzerAnswer`, `advanceQuestion`, and `advanceTimedOutQuestion`; stop exporting `submitBattleAnswer`.

- [ ] **Step 5: Run rule tests and confirm GREEN**

Run:

```powershell
node --test tests\battle-rules.test.js
```

Expected: all buzzer rule tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add cloudfunctions/battle/battle-rules.js tests/battle-rules.test.js
git commit -m "feat: add buzzer battle rules"
```

## Task 2: Transaction-Backed Answer and Timeout Actions

**Files:**
- Modify: `cloudfunctions/battle/index.js`
- Modify: `tests/battle-cloud-function.test.js`

- [ ] **Step 1: Add failing cloud-function structure tests**

Append:

```js
test('抢答提交和超时推进使用云数据库事务', () => {
  const source = readBattleFunction();

  assert.match(source, /db\.runTransaction/);
  assert.match(source, /submitBuzzerAnswer/);
  assert.match(source, /advanceTimedOutQuestion/);
  assert.match(source, /action === 'advanceTimeout'/);
  assert.match(source, /questionIndex: event\.questionIndex/);
});

test('业务规则错误返回短消息而不是抛出函数堆栈', () => {
  const source = readBattleFunction();

  assert.match(source, /catch \(error\)/);
  assert.match(source, /success: false/);
  assert.match(source, /message: error\.message/);
});
```

- [ ] **Step 2: Run test and confirm RED**

```powershell
node --test tests\battle-cloud-function.test.js
```

Expected: FAIL because buzzer transaction functions and `advanceTimeout` are absent.

- [ ] **Step 3: Add a room transaction helper**

Add to `cloudfunctions/battle/index.js`:

```js
async function updateRoomInTransaction(roomId, updater) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.collection('battle_rooms').doc(roomId).get();
    if (!snapshot.data) throw new Error('房间不存在或已过期');
    const nextRoom = updater({ ...snapshot.data, _id: roomId });
    const { _id, ...data } = nextRoom;
    await transaction.collection('battle_rooms').doc(_id).set({ data });
    return nextRoom;
  });
}
```

- [ ] **Step 4: Route answer and timeout through transactions**

Replace the `submitAnswer` branch and add `advanceTimeout`:

```js
if (action === 'submitAnswer') {
  const nextRoom = await updateRoomInTransaction(event.roomId, (room) => (
    submitBuzzerAnswer(room, {
      openid: OPENID,
      questionIndex: event.questionIndex,
      selected: event.selected,
      now: () => new Date().toISOString(),
    })
  ));
  if (nextRoom.status === 'finished') await writeBattleRecords(nextRoom);
  return { success: true, room: nextRoom };
}

if (action === 'advanceTimeout') {
  const nextRoom = await updateRoomInTransaction(event.roomId, (room) => (
    advanceTimedOutQuestion(room, {
      questionIndex: event.questionIndex,
      now: () => new Date().toISOString(),
    })
  ));
  if (nextRoom.status === 'finished') await writeBattleRecords(nextRoom);
  return { success: true, room: nextRoom };
}
```

Import `submitBuzzerAnswer` and `advanceTimedOutQuestion`.

- [ ] **Step 5: Wrap the exported handler with short business errors**

Move current action routing into `handleEvent(event, openid)` and export:

```js
exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  try {
    return await handleEvent(event, OPENID);
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : '对战请求失败',
    };
  }
};
```

- [ ] **Step 6: Run cloud and rule tests**

```powershell
node --test tests\battle-rules.test.js tests\battle-cloud-function.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add cloudfunctions/battle/index.js tests/battle-cloud-function.test.js
git commit -m "feat: make buzzer answers transactional"
```

## Task 3: Countdown Utility and Battle Service

**Files:**
- Create: `miniprogram/utils/battle-countdown.js`
- Create: `tests/battle-countdown.test.js`
- Modify: `miniprogram/services/battle-service.js`
- Modify: `tests/battle-service.test.js`

- [ ] **Step 1: Write failing countdown and service tests**

Create `tests/battle-countdown.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getRemainingSeconds } = require('../miniprogram/utils/battle-countdown');

test('按云端截止时间向上取整剩余秒数', () => {
  assert.equal(getRemainingSeconds(
    '2026-06-28T10:00:10.000Z',
    '2026-06-28T10:00:01.200Z',
  ), 9);
});

test('截止后剩余秒数固定为零', () => {
  assert.equal(getRemainingSeconds(
    '2026-06-28T10:00:10.000Z',
    '2026-06-28T10:00:11.000Z',
  ), 0);
});
```

Append to `tests/battle-service.test.js`:

```js
test('超时推进调用 advanceTimeout action', async () => {
  const calls = [];
  const { advanceTimeout } = reloadService({
    cloud: {
      callFunction: async (payload) => {
        calls.push(payload);
        return { result: { success: true, room: { _id: '123456' } } };
      },
    },
  });

  await advanceTimeout('123456', 3);
  assert.deepEqual(calls[0].data, {
    action: 'advanceTimeout',
    roomId: '123456',
    questionIndex: 3,
  });
});
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test tests\battle-countdown.test.js tests\battle-service.test.js
```

Expected: FAIL because the countdown module and `advanceTimeout` export are absent.

- [ ] **Step 3: Implement countdown**

Create `miniprogram/utils/battle-countdown.js`:

```js
function getRemainingSeconds(deadline, now = new Date().toISOString()) {
  const remaining = new Date(deadline).getTime() - new Date(now).getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

module.exports = {
  getRemainingSeconds,
};
```

- [ ] **Step 4: Add timeout service action**

Add to `battle-service.js`:

```js
function advanceTimeout(roomId, questionIndex) {
  return callBattle('advanceTimeout', { roomId, questionIndex });
}
```

Export `advanceTimeout`.

- [ ] **Step 5: Run tests and commit**

```powershell
node --test tests\battle-countdown.test.js tests\battle-service.test.js
git add miniprogram/utils/battle-countdown.js miniprogram/services/battle-service.js tests/battle-countdown.test.js tests/battle-service.test.js
git commit -m "feat: add buzzer countdown service"
```

Expected: PASS before commit.

## Task 4: Shared Question Battle Room UI

**Files:**
- Modify: `miniprogram/pages/battle-room/index.js`
- Modify: `miniprogram/pages/battle-room/index.wxml`
- Modify: `miniprogram/pages/battle-room/index.wxss`
- Modify: `tests/battle-page.test.js`

- [ ] **Step 1: Add failing page assertions**

Add:

```js
test('抢答房间展示统一题目、倒计时和锁定反馈', () => {
  const js = readPage('battle-room', 'js');
  const wxml = readPage('battle-room', 'wxml');
  const wxss = readPage('battle-room', 'wxss');

  assert.match(js, /getRemainingSeconds/);
  assert.match(js, /advanceTimeout/);
  assert.match(js, /currentQuestionIndex/);
  assert.match(js, /lockedOpenids/);
  assert.match(wxml, /剩余 {{remainingSeconds}} 秒/);
  assert.match(wxml, /答错 -5，等待好友作答/);
  assert.match(wxml, /disabled="{{myLocked \|\| submitting}}"/);
  assert.match(wxss, /\.timer/);
  assert.match(wxss, /\.option-locked/);
});
```

- [ ] **Step 2: Run page test and confirm RED**

```powershell
node --test tests\battle-page.test.js
```

Expected: FAIL because the page still uses per-player `answeredCount`.

- [ ] **Step 3: Change page state and room projection**

In `index.js`, import `advanceTimeout` and `getRemainingSeconds`; add:

```js
data: {
  remainingSeconds: 10,
  myLocked: false,
  submitting: false,
}
```

Replace `applyRoom` question selection with:

```js
applyRoom(room) {
  const myOpenid = this.data.myOpenid;
  const questionIndex = room.currentQuestionIndex || 0;
  this.setData({
    room,
    myPlayer: findPlayer(room, myOpenid),
    currentQuestion: room.questions ? room.questions[questionIndex] : null,
    myLocked: (room.lockedOpenids || []).includes(myOpenid),
    selected: '',
  });
  this.restartCountdown(room);
}
```

- [ ] **Step 4: Add countdown lifecycle**

Add:

```js
restartCountdown(room) {
  if (this.countdownTimer) clearInterval(this.countdownTimer);
  if (room.status !== 'playing') return;
  const update = () => {
    const remainingSeconds = getRemainingSeconds(room.questionDeadlineAt);
    this.setData({ remainingSeconds });
    if (remainingSeconds === 0) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      advanceTimeout(this.data.roomId, room.currentQuestionIndex);
    }
  };
  update();
  this.countdownTimer = setInterval(update, 250);
}
```

Clear `countdownTimer` in `onUnload`.

- [ ] **Step 5: Replace answer submission**

Use the shared question index:

```js
async chooseOption(event) {
  if (this.data.myLocked || this.data.submitting || !this.data.currentQuestion) return;
  const selected = event.currentTarget.dataset.value;
  this.setData({ selected, submitting: true });
  const result = await submitAnswer({
    roomId: this.data.roomId,
    questionIndex: this.data.room.currentQuestionIndex,
    selected,
  });
  this.setData({ submitting: false });
  if (!result.success) {
    wx.showToast({ title: result.message || '提交失败', icon: 'none' });
  }
}
```

- [ ] **Step 6: Update WXML and styles**

The playing section must contain:

```xml
<text class="question-progress">第 {{room.currentQuestionIndex + 1}} / 10 题</text>
<text class="timer">剩余 {{remainingSeconds}} 秒</text>
<text class="word">{{currentQuestion.word}}</text>
<button
  wx:for="{{currentQuestion.options}}"
  wx:key="*this"
  class="option-button {{myLocked ? 'option-locked' : ''}}"
  disabled="{{myLocked || submitting}}"
  data-value="{{item}}"
  bindtap="chooseOption"
>{{item}}</button>
<text wx:if="{{myLocked}}" class="locked-message">答错 -5，等待好友作答</text>
```

Add `.timer`, `.question-progress`, `.option-locked`, `.locked-message` styles.

- [ ] **Step 7: Run tests and commit**

```powershell
node --test tests\battle-page.test.js tests\battle-countdown.test.js tests\battle-service.test.js
git add miniprogram/pages/battle-room tests/battle-page.test.js
git commit -m "feat: add buzzer battle room ui"
```

Expected: PASS before commit.

## Task 5: Documentation, Full Verification and Deployment

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README rules**

Document:

```text
- 抢答模式每局 10 题，每题 10 秒。
- 双方直接选择答案；答对 +10，答错 -5 并锁定当前题。
- 双方都答错或超时会自动进入下一题。
- 抢答提交使用云数据库事务，避免同时答对重复计分。
```

Add deployment note:

```text
修改抢答规则后必须重新部署 cloudfunctions/battle。
```

- [ ] **Step 2: Run full tests**

```powershell
node --test
```

Expected: 0 failures.

- [ ] **Step 3: Run syntax and JSON checks**

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

- [ ] **Step 4: Commit README and push**

```powershell
git add README.md
git commit -m "docs: describe buzzer battle"
git push
```

- [ ] **Step 5: Manual CloudBase verification**

In WeChat DevTools:

```text
1. Right-click cloudfunctions/battle.
2. Choose 创建并部署：云端安装依赖（不上传 node_modules）.
3. Recompile the Mini Program.
4. Join with two different WeChat accounts.
5. Verify wrong answer -5, opponent continues, correct answer advances, and timeout advances after 10 seconds.
```

## Self-Review Notes

- Spec coverage: shared options, +10/-5, player lock, both-wrong advance, 10-second timeout, transaction ordering, short errors, watch UI and settlement are assigned to tasks.
- Scope: quick matching, chat, spectator mode and strong anti-cheat remain excluded.
- Naming: `currentQuestionIndex`, `questionDeadlineAt`, `lockedOpenids`, `submitBuzzerAnswer`, `advanceTimedOutQuestion` and `advanceTimeout` are consistent across rules, cloud function, service and page.
