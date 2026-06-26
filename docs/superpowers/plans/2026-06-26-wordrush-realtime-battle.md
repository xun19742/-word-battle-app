# WordRush Realtime Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable 1v1 friend-invite battle MVP with CloudBase room state, database `watch` sync, polling fallback, scoring, and ranking stat updates.

**Architecture:** The client creates a fixed 10-question set from the selected local wordbook, then all room mutations go through a new `battle` cloud function. Pure battle rules live in `cloudfunctions/battle/battle-rules.js` for deterministic tests; Mini Program pages call `miniprogram/services/battle-service.js`, which wraps cloud function calls and `battle_rooms` document watching with polling fallback.

**Tech Stack:** WeChat Mini Program, CloudBase `wx-server-sdk`, CommonJS modules, `node:test`, local storage-free room state, existing wordbook and profile services.

---

## File Structure

- Create `miniprogram/utils/battle-question-builder.js`: builds 10 four-option questions from a wordbook for a battle room.
- Create `tests/battle-question-builder.test.js`: verifies question count, option uniqueness, correct option, and insufficient distractors.
- Create `cloudfunctions/battle/battle-rules.js`: pure room state transitions, scoring, settlement, and stat delta helpers.
- Create `cloudfunctions/battle/index.js`: CloudBase entrypoint with `createRoom`, `joinRoom`, `setReady`, `startRoom`, `submitAnswer`, `getRoom`, and `finishRoom`.
- Create `cloudfunctions/battle/package.json`: cloud function dependency manifest.
- Create `tests/battle-rules.test.js`: verifies the pure battle state machine.
- Create `tests/battle-cloud-function.test.js`: static coverage for cloud function actions, trusted OpenID use, and target collections.
- Create `miniprogram/services/battle-service.js`: cloud call wrapper plus `watchRoom` with polling fallback.
- Create `tests/battle-service.test.js`: verifies no-cloud degradation, action payloads, watch close, and fallback polling.
- Create `miniprogram/pages/battle/index.js`: battle lobby page for creating and joining rooms.
- Create `miniprogram/pages/battle/index.json`: battle lobby navigation title.
- Create `miniprogram/pages/battle/index.wxml`: battle lobby UI.
- Create `miniprogram/pages/battle/index.wxss`: battle lobby styles.
- Create `miniprogram/pages/battle-room/index.js`: room waiting, ready, playing, and finished states.
- Create `miniprogram/pages/battle-room/index.json`: battle room navigation title.
- Create `miniprogram/pages/battle-room/index.wxml`: battle room UI.
- Create `miniprogram/pages/battle-room/index.wxss`: battle room styles.
- Create `tests/battle-page.test.js`: static page registration and UI structure tests.
- Modify `miniprogram/app.json`: register battle pages.
- Modify `miniprogram/pages/home/index.js`: add `openBattle()`.
- Modify `miniprogram/pages/home/index.wxml`: add “好友对战” entry.
- Modify `miniprogram/pages/home/index.wxss`: style battle entry.
- Modify `tests/home-page.test.js`: cover home battle entry.
- Modify `tests/project-structure.test.js`: cover battle page registration.
- Modify `README.md`: add battle cloud function, collections, and acceptance checks.

## Task 1: Battle Question Builder

**Files:**
- Create: `miniprogram/utils/battle-question-builder.js`
- Test: `tests/battle-question-builder.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/battle-question-builder.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBattleQuestions } = require('../miniprogram/utils/battle-question-builder');

const words = Array.from({ length: 12 }, (_, index) => ({
  id: `word-${index}`,
  word: `word${index}`,
  meaning: `释义${index}`,
}));

function fixedRandom() {
  return 0.01;
}

test('生成十道对战题且每题包含四个不重复选项', () => {
  const questions = buildBattleQuestions(words, fixedRandom);

  assert.equal(questions.length, 10);
  questions.forEach((question) => {
    assert.equal(typeof question.wordId, 'string');
    assert.equal(typeof question.word, 'string');
    assert.equal(typeof question.meaning, 'string');
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options.includes(question.correctOption), true);
    assert.equal(question.correctOption, question.meaning);
  });
});

test('词书干扰项不足时拒绝生成对战题', () => {
  assert.throws(
    () => buildBattleQuestions(words.slice(0, 3), fixedRandom),
    /对战题目数量不足/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests\battle-question-builder.test.js
```

Expected: FAIL with `Cannot find module '../miniprogram/utils/battle-question-builder'`.

- [ ] **Step 3: Implement the minimal question builder**

Create `miniprogram/utils/battle-question-builder.js`:

```js
function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function buildOptions(current, words, random = Math.random) {
  const meanings = [
    ...new Set(
      words
        .filter((word) => word.id !== current.id)
        .map((word) => word.meaning)
        .filter(Boolean),
    ),
  ];
  if (meanings.length < 3) {
    throw new Error('对战题目数量不足');
  }
  return shuffle([current.meaning, ...shuffle(meanings, random).slice(0, 3)], random);
}

function buildBattleQuestions(words, random = Math.random) {
  const validWords = (words || []).filter((word) => (
    word && word.id && word.word && word.meaning
  ));
  if (validWords.length < 10) {
    throw new Error('对战题目数量不足');
  }
  return shuffle(validWords, random).slice(0, 10).map((word) => ({
    wordId: word.id,
    word: word.word,
    meaning: word.meaning,
    options: buildOptions(word, validWords, random),
    correctOption: word.meaning,
  }));
}

module.exports = {
  buildBattleQuestions,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test tests\battle-question-builder.test.js
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```powershell
git add miniprogram/utils/battle-question-builder.js tests/battle-question-builder.test.js
git commit -m "feat: build battle questions"
```

## Task 2: Battle Rules State Machine

**Files:**
- Create: `cloudfunctions/battle/battle-rules.js`
- Test: `tests/battle-rules.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/battle-rules.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createBattleRoom,
  joinBattleRoom,
  setPlayerReady,
  startBattleRoom,
  submitBattleAnswer,
  settleBattleRoom,
  getBattleStatDelta,
} = require('../cloudfunctions/battle/battle-rules');

const questions = Array.from({ length: 10 }, (_, index) => ({
  wordId: `word-${index}`,
  word: `word${index}`,
  meaning: `释义${index}`,
  options: [`释义${index}`, `干扰${index}-1`, `干扰${index}-2`, `干扰${index}-3`],
  correctOption: `释义${index}`,
}));

const owner = { openid: 'owner-openid', nickname: '房主', avatarUrl: '' };
const guest = { openid: 'guest-openid', nickname: '好友', avatarUrl: '' };
const now = () => '2026-06-26T08:00:00.000Z';

test('创建房间并加入好友后保持等待状态', () => {
  const room = createBattleRoom({
    roomId: '123456',
    owner,
    wordbookId: 'cet4',
    questions,
    now,
  });
  const joined = joinBattleRoom(room, guest, now);

  assert.equal(joined.status, 'waiting');
  assert.equal(joined.players.length, 2);
  assert.equal(joined.players[0].ready, false);
  assert.equal(joined.players[1].nickname, '好友');
});

test('双方准备后房主可以开始房间', () => {
  const room = joinBattleRoom(createBattleRoom({
    roomId: '123456',
    owner,
    wordbookId: 'cet4',
    questions,
    now,
  }), guest, now);
  const readyOwner = setPlayerReady(room, owner.openid, true, now);
  const readyGuest = setPlayerReady(readyOwner, guest.openid, true, now);
  const started = startBattleRoom(readyGuest, owner.openid, now);

  assert.equal(started.status, 'playing');
  assert.equal(started.startedAt, now());
});

test('提交答案会计分并拒绝同一题重复提交', () => {
  const room = startBattleRoom(
    setPlayerReady(
      setPlayerReady(
        joinBattleRoom(createBattleRoom({
          roomId: '123456',
          owner,
          wordbookId: 'cet4',
          questions,
          now,
        }), guest, now),
        owner.openid,
        true,
        now,
      ),
      guest.openid,
      true,
      now,
    ),
    owner.openid,
    now,
  );
  const answered = submitBattleAnswer(room, {
    openid: owner.openid,
    questionIndex: 0,
    selected: questions[0].correctOption,
    now,
  });
  const repeated = submitBattleAnswer(answered, {
    openid: owner.openid,
    questionIndex: 0,
    selected: '错误答案',
    now,
  });

  assert.equal(repeated.players[0].score, 10);
  assert.equal(repeated.players[0].answeredCount, 1);
  assert.equal(repeated.answers[owner.openid].length, 1);
});

test('双方完成后结算胜负和战绩增量', () => {
  let room = startBattleRoom(
    setPlayerReady(
      setPlayerReady(
        joinBattleRoom(createBattleRoom({
          roomId: '123456',
          owner,
          wordbookId: 'cet4',
          questions,
          now,
        }), guest, now),
        owner.openid,
        true,
        now,
      ),
      guest.openid,
      true,
      now,
    ),
    owner.openid,
    now,
  );
  questions.forEach((question, index) => {
    room = submitBattleAnswer(room, {
      openid: owner.openid,
      questionIndex: index,
      selected: question.correctOption,
      now,
    });
    room = submitBattleAnswer(room, {
      openid: guest.openid,
      questionIndex: index,
      selected: index < 8 ? question.correctOption : '错误答案',
      now,
    });
  });
  const settled = settleBattleRoom(room, now);

  assert.equal(settled.status, 'finished');
  assert.equal(settled.winnerOpenid, owner.openid);
  assert.deepEqual(getBattleStatDelta('win'), {
    battleScore: 30,
    battleWins: 1,
    battleLosses: 0,
    battleDraws: 0,
    battlePlayed: 1,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests\battle-rules.test.js
```

Expected: FAIL with `Cannot find module '../cloudfunctions/battle/battle-rules'`.

- [ ] **Step 3: Implement the pure rules module**

Create `cloudfunctions/battle/battle-rules.js` with these exported functions:

```js
const ROOM_STATUSES = ['waiting', 'playing', 'finished', 'cancelled'];
const QUESTION_COUNT = 10;

function safeNow(now) {
  return typeof now === 'function' ? now() : new Date().toISOString();
}

function normalizeProfile(profile = {}) {
  return {
    openid: profile.openid,
    nickname: profile.nickname || 'WordRush 用户',
    avatarUrl: profile.avatarUrl || '',
    ready: false,
    score: 0,
    answeredCount: 0,
    finished: false,
  };
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length !== QUESTION_COUNT) {
    throw new Error('对战题目无效');
  }
  questions.forEach((question) => {
    if (
      !question
      || !question.wordId
      || !question.word
      || !question.meaning
      || !Array.isArray(question.options)
      || question.options.length !== 4
      || new Set(question.options).size !== 4
      || !question.options.includes(question.correctOption)
    ) {
      throw new Error('对战题目无效');
    }
  });
}

function createBattleRoom({ roomId, owner, wordbookId, questions, now }) {
  validateQuestions(questions);
  const timestamp = safeNow(now);
  return {
    _id: roomId,
    ownerOpenid: owner.openid,
    status: 'waiting',
    wordbookId,
    players: [normalizeProfile(owner)],
    questions,
    answers: {},
    winnerOpenid: '',
    result: '',
    createdAt: timestamp,
    startedAt: '',
    finishedAt: '',
    updatedAt: timestamp,
  };
}

function assertStatus(room, status) {
  if (!room || !ROOM_STATUSES.includes(room.status) || room.status !== status) {
    throw new Error('房间状态无效');
  }
}

function joinBattleRoom(room, player, now) {
  assertStatus(room, 'waiting');
  if (room.players.some((item) => item.openid === player.openid)) {
    return room;
  }
  if (room.players.length >= 2) {
    throw new Error('房间已满');
  }
  return {
    ...room,
    players: [...room.players, normalizeProfile(player)],
    updatedAt: safeNow(now),
  };
}

function updatePlayer(room, openid, updater) {
  if (!room.players.some((player) => player.openid === openid)) {
    throw new Error('玩家不在房间中');
  }
  return room.players.map((player) => (
    player.openid === openid ? updater(player) : player
  ));
}

function setPlayerReady(room, openid, ready, now) {
  assertStatus(room, 'waiting');
  return {
    ...room,
    players: updatePlayer(room, openid, (player) => ({ ...player, ready: Boolean(ready) })),
    updatedAt: safeNow(now),
  };
}

function startBattleRoom(room, openid, now) {
  assertStatus(room, 'waiting');
  if (room.ownerOpenid !== openid) {
    throw new Error('只有房主可以开始');
  }
  if (room.players.length !== 2 || room.players.some((player) => !player.ready)) {
    throw new Error('双方准备后才能开始');
  }
  const timestamp = safeNow(now);
  return {
    ...room,
    status: 'playing',
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

function submitBattleAnswer(room, { openid, questionIndex, selected, now }) {
  assertStatus(room, 'playing');
  const question = room.questions[questionIndex];
  if (!question) {
    throw new Error('题目不存在');
  }
  const currentAnswers = room.answers[openid] || [];
  if (currentAnswers.some((answer) => answer.questionIndex === questionIndex)) {
    return room;
  }
  const isCorrect = selected === question.correctOption;
  const nextAnswers = [
    ...currentAnswers,
    { questionIndex, selected, isCorrect, answeredAt: safeNow(now) },
  ];
  const players = updatePlayer(room, openid, (player) => ({
    ...player,
    score: player.score + (isCorrect ? 10 : 0),
    answeredCount: player.answeredCount + 1,
    finished: nextAnswers.length >= QUESTION_COUNT,
  }));
  const nextRoom = {
    ...room,
    players,
    answers: { ...room.answers, [openid]: nextAnswers },
    updatedAt: safeNow(now),
  };
  return players.length === 2 && players.every((player) => player.finished)
    ? settleBattleRoom(nextRoom, now)
    : nextRoom;
}

function getPlayerResult(player, opponent) {
  if (player.score > opponent.score) return 'win';
  if (player.score < opponent.score) return 'lose';
  return 'draw';
}

function settleBattleRoom(room, now) {
  if (room.status === 'finished') return room;
  const [owner, guest] = room.players;
  const timestamp = safeNow(now);
  let result = 'draw';
  let winnerOpenid = '';
  if (owner.score > guest.score) {
    result = 'owner';
    winnerOpenid = owner.openid;
  } else if (guest.score > owner.score) {
    result = 'guest';
    winnerOpenid = guest.openid;
  }
  return {
    ...room,
    status: 'finished',
    result,
    winnerOpenid,
    finishedAt: timestamp,
    updatedAt: timestamp,
  };
}

function getBattleStatDelta(result) {
  return {
    battleScore: result === 'win' ? 30 : result === 'draw' ? 10 : 0,
    battleWins: result === 'win' ? 1 : 0,
    battleLosses: result === 'lose' ? 1 : 0,
    battleDraws: result === 'draw' ? 1 : 0,
    battlePlayed: 1,
  };
}

module.exports = {
  createBattleRoom,
  getBattleStatDelta,
  getPlayerResult,
  joinBattleRoom,
  setPlayerReady,
  settleBattleRoom,
  startBattleRoom,
  submitBattleAnswer,
  validateQuestions,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test tests\battle-rules.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```powershell
git add cloudfunctions/battle/battle-rules.js tests/battle-rules.test.js
git commit -m "feat: add battle room rules"
```

## Task 3: Battle Cloud Function

**Files:**
- Create: `cloudfunctions/battle/index.js`
- Create: `cloudfunctions/battle/package.json`
- Test: `tests/battle-cloud-function.test.js`

- [ ] **Step 1: Write the failing static test**

Create `tests/battle-cloud-function.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readBattleFunction() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'battle', 'index.js'),
    'utf8',
  );
}

test('对战云函数提供房间全流程 action 并使用可信 OpenID', () => {
  const source = readBattleFunction();

  assert.match(source, /cloud\.getWXContext\(\)/);
  assert.match(source, /OPENID/);
  assert.match(source, /createRoom/);
  assert.match(source, /joinRoom/);
  assert.match(source, /setReady/);
  assert.match(source, /startRoom/);
  assert.match(source, /submitAnswer/);
  assert.match(source, /finishRoom/);
  assert.match(source, /collection\('battle_rooms'\)/);
  assert.match(source, /collection\('battle_records'\)/);
  assert.match(source, /collection\('users'\)/);
  assert.match(source, /getBattleStatDelta/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests\battle-cloud-function.test.js
```

Expected: FAIL because `cloudfunctions/battle/index.js` does not exist.

- [ ] **Step 3: Implement the cloud function entrypoint**

Create `cloudfunctions/battle/package.json`:

```json
{
  "name": "battle",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Create `cloudfunctions/battle/index.js` with this shape:

```js
const cloud = require('wx-server-sdk');
const {
  createBattleRoom,
  getBattleStatDelta,
  getPlayerResult,
  joinBattleRoom,
  setPlayerReady,
  startBattleRoom,
  submitBattleAnswer,
  settleBattleRoom,
} = require('./battle-rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function createRoomId() {
  return `${Date.now()}`.slice(-6);
}

function publicProfile(openid, user = {}) {
  return {
    openid,
    nickname: user.nickname || 'WordRush 用户',
    avatarUrl: user.avatarUrl || '',
  };
}

async function loadUser(openid) {
  const result = await db.collection('users').where({ _id: openid }).limit(1).get();
  return result.data[0] || {};
}

async function getRoom(roomId) {
  const snapshot = await db.collection('battle_rooms').doc(roomId).get();
  return snapshot.data || null;
}

async function saveRoom(room) {
  await db.collection('battle_rooms').doc(room._id).set({ data: room });
  return room;
}

async function updateUserStats(openid, result) {
  const delta = getBattleStatDelta(result);
  const user = await loadUser(openid);
  await db.collection('users').doc(openid).set({
    data: {
      ...user,
      _openid: openid,
      nickname: user.nickname || 'WordRush 用户',
      avatarUrl: user.avatarUrl || '',
      battleScore: (user.battleScore || 0) + delta.battleScore,
      battleWins: (user.battleWins || 0) + delta.battleWins,
      battleLosses: (user.battleLosses || 0) + delta.battleLosses,
      battleDraws: (user.battleDraws || 0) + delta.battleDraws,
      battlePlayed: (user.battlePlayed || 0) + delta.battlePlayed,
      updatedAt: db.serverDate(),
    },
  });
  return delta;
}

async function writeBattleRecords(room) {
  const [left, right] = room.players;
  for (const player of room.players) {
    const opponent = player.openid === left.openid ? right : left;
    const result = getPlayerResult(player, opponent);
    const delta = await updateUserStats(player.openid, result);
    await db.collection('battle_records').doc(`${room._id}_${player.openid}`).set({
      data: {
        roomId: room._id,
        openid: player.openid,
        opponentOpenid: opponent.openid,
        result,
        score: player.score,
        opponentScore: opponent.score,
        battleScoreDelta: delta.battleScore,
        createdAt: db.serverDate(),
      },
    });
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || '';
  const user = await loadUser(OPENID);

  if (action === 'createRoom') {
    const room = createBattleRoom({
      roomId: createRoomId(),
      owner: publicProfile(OPENID, user),
      wordbookId: event.wordbookId,
      questions: event.questions,
      now: () => new Date().toISOString(),
    });
    await saveRoom(room);
    return { success: true, room };
  }

  if (action === 'getRoom') {
    const room = await getRoom(event.roomId);
    return room ? { success: true, room } : { success: false, message: '房间不存在或已过期' };
  }

  if (action === 'joinRoom') {
    const room = await getRoom(event.roomId);
    if (!room) return { success: false, message: '房间不存在或已过期' };
    const nextRoom = joinBattleRoom(room, publicProfile(OPENID, user), () => new Date().toISOString());
    await saveRoom(nextRoom);
    return { success: true, room: nextRoom };
  }

  if (action === 'setReady') {
    const room = await getRoom(event.roomId);
    if (!room) return { success: false, message: '房间不存在或已过期' };
    const nextRoom = setPlayerReady(room, OPENID, Boolean(event.ready), () => new Date().toISOString());
    await saveRoom(nextRoom);
    return { success: true, room: nextRoom };
  }

  if (action === 'startRoom') {
    const room = await getRoom(event.roomId);
    if (!room) return { success: false, message: '房间不存在或已过期' };
    const nextRoom = startBattleRoom(room, OPENID, () => new Date().toISOString());
    await saveRoom(nextRoom);
    return { success: true, room: nextRoom };
  }

  if (action === 'submitAnswer') {
    const room = await getRoom(event.roomId);
    if (!room) return { success: false, message: '房间不存在或已过期' };
    const nextRoom = submitBattleAnswer(room, {
      openid: OPENID,
      questionIndex: event.questionIndex,
      selected: event.selected,
      now: () => new Date().toISOString(),
    });
    await saveRoom(nextRoom);
    if (nextRoom.status === 'finished') {
      await writeBattleRecords(nextRoom);
    }
    return { success: true, room: nextRoom };
  }

  if (action === 'finishRoom') {
    const room = await getRoom(event.roomId);
    if (!room) return { success: false, message: '房间不存在或已过期' };
    const nextRoom = settleBattleRoom(room, () => new Date().toISOString());
    await saveRoom(nextRoom);
    await writeBattleRecords(nextRoom);
    return { success: true, room: nextRoom };
  }

  return { success: false, message: '对战操作无效' };
};
```

- [ ] **Step 4: Run cloud function static test**

Run:

```powershell
node --test tests\battle-cloud-function.test.js
```

Expected: PASS, 1 test.

- [ ] **Step 5: Run battle rules tests again**

Run:

```powershell
node --test tests\battle-rules.test.js tests\battle-cloud-function.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cloudfunctions/battle/index.js cloudfunctions/battle/package.json tests/battle-cloud-function.test.js
git commit -m "feat: add battle cloud function"
```

## Task 4: Battle Service and Watch Fallback

**Files:**
- Create: `miniprogram/services/battle-service.js`
- Test: `tests/battle-service.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/battle-service.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

function reloadService(wxMock) {
  delete require.cache[require.resolve('../miniprogram/services/battle-service')];
  global.wx = wxMock;
  return require('../miniprogram/services/battle-service');
}

test('没有云能力时创建房间安全降级', async () => {
  const { createRoom } = reloadService({});
  const result = await createRoom({ wordbookId: 'cet4', questions: [] });

  assert.deepEqual(result, {
    success: false,
    message: '对战需要云服务',
    room: null,
  });
});

test('创建房间调用 battle 云函数并传入 action', async () => {
  const calls = [];
  const { createRoom } = reloadService({
    cloud: {
      callFunction: async (payload) => {
        calls.push(payload);
        return { result: { success: true, room: { _id: '123456' } } };
      },
    },
  });
  const result = await createRoom({ wordbookId: 'cet4', questions: [{ wordId: 'a' }] });

  assert.equal(result.success, true);
  assert.equal(result.room._id, '123456');
  assert.equal(calls[0].name, 'battle');
  assert.deepEqual(calls[0].data, {
    action: 'createRoom',
    wordbookId: 'cet4',
    questions: [{ wordId: 'a' }],
  });
});

test('watchRoom 优先使用数据库 watch 并返回关闭函数', () => {
  let closed = false;
  const { watchRoom } = reloadService({
    cloud: {
      database: () => ({
        collection: () => ({
          doc: () => ({
            watch: ({ onChange }) => {
              onChange({ docs: [{ _id: '123456', status: 'waiting' }] });
              return { close: () => { closed = true; } };
            },
          }),
        }),
      }),
    },
  });
  const states = [];
  const watcher = watchRoom('123456', { onChange: (room) => states.push(room) });
  watcher.close();

  assert.equal(states[0].status, 'waiting');
  assert.equal(closed, true);
});

test('watchRoom 在 watch 不可用时降级轮询 getRoom', () => {
  const intervals = [];
  const cleared = [];
  const calls = [];
  const { watchRoom } = reloadService({
    cloud: {
      callFunction: async (payload) => {
        calls.push(payload);
        return { result: { success: true, room: { _id: '123456', status: 'playing' } } };
      },
      database: () => ({
        collection: () => ({
          doc: () => ({
            watch: () => {
              throw new Error('watch disabled');
            },
          }),
        }),
      }),
    },
  });
  const states = [];
  const watcher = watchRoom('123456', {
    onChange: (room) => states.push(room),
    setInterval: (callback) => {
      intervals.push(callback);
      callback();
      return 7;
    },
    clearInterval: (id) => cleared.push(id),
  });
  watcher.close();

  assert.equal(calls[0].data.action, 'getRoom');
  assert.equal(cleared[0], 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests\battle-service.test.js
```

Expected: FAIL with `Cannot find module '../miniprogram/services/battle-service'`.

- [ ] **Step 3: Implement battle service**

Create `miniprogram/services/battle-service.js`:

```js
function noCloudResult() {
  return { success: false, message: '对战需要云服务', room: null };
}

async function callBattle(action, data = {}) {
  if (!wx.cloud) {
    return noCloudResult();
  }
  try {
    const response = await wx.cloud.callFunction({
      name: 'battle',
      data: { action, ...data },
    });
    const result = response.result || {};
    return {
      success: Boolean(result.success),
      message: result.message || '',
      room: result.room || null,
    };
  } catch (error) {
    return { success: false, message: '对战请求失败', room: null };
  }
}

function createRoom({ wordbookId, questions }) {
  return callBattle('createRoom', { wordbookId, questions });
}

function joinRoom(roomId) {
  return callBattle('joinRoom', { roomId });
}

function setReady(roomId, ready) {
  return callBattle('setReady', { roomId, ready });
}

function startRoom(roomId) {
  return callBattle('startRoom', { roomId });
}

function submitAnswer({ roomId, questionIndex, selected }) {
  return callBattle('submitAnswer', { roomId, questionIndex, selected });
}

function getRoom(roomId) {
  return callBattle('getRoom', { roomId });
}

function watchRoom(roomId, handlers = {}) {
  const onChange = handlers.onChange || function noop() {};
  const onError = handlers.onError || function noop() {};
  const setTimer = handlers.setInterval || setInterval;
  const clearTimer = handlers.clearInterval || clearInterval;
  if (!wx.cloud) {
    onError(new Error('对战需要云服务'));
    return { close() {} };
  }

  function startPolling() {
    const tick = async () => {
      const result = await getRoom(roomId);
      if (result.success && result.room) onChange(result.room);
    };
    const timer = setTimer(tick, 2000);
    tick();
    return { close: () => clearTimer(timer) };
  }

  try {
    const watcher = wx.cloud
      .database()
      .collection('battle_rooms')
      .doc(roomId)
      .watch({
        onChange(snapshot) {
          const room = snapshot.docs && snapshot.docs[0];
          if (room) onChange(room);
        },
        onError(error) {
          onError(error);
        },
      });
    return { close: () => watcher.close() };
  } catch (error) {
    onError(error);
    return startPolling();
  }
}

module.exports = {
  createRoom,
  getRoom,
  joinRoom,
  setReady,
  startRoom,
  submitAnswer,
  watchRoom,
};
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
node --test tests\battle-service.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add miniprogram/services/battle-service.js tests/battle-service.test.js
git commit -m "feat: add battle service"
```

## Task 5: Battle Pages

**Files:**
- Create: `miniprogram/pages/battle/index.js`
- Create: `miniprogram/pages/battle/index.json`
- Create: `miniprogram/pages/battle/index.wxml`
- Create: `miniprogram/pages/battle/index.wxss`
- Create: `miniprogram/pages/battle-room/index.js`
- Create: `miniprogram/pages/battle-room/index.json`
- Create: `miniprogram/pages/battle-room/index.wxml`
- Create: `miniprogram/pages/battle-room/index.wxss`
- Modify: `miniprogram/app.json`
- Test: `tests/battle-page.test.js`
- Test: `tests/project-structure.test.js`

- [ ] **Step 1: Write failing page structure tests**

Create `tests/battle-page.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readPage(page, extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', page, `index.${extension}`),
    'utf8',
  );
}

test('对战首页提供创建房间、输入房间号和玩法说明', () => {
  const js = readPage('battle', 'js');
  const wxml = readPage('battle', 'wxml');
  const wxss = readPage('battle', 'wxss');

  assert.match(js, /battle-question-builder/);
  assert.match(js, /createRoom/);
  assert.match(js, /joinRoom/);
  assert.match(wxml, /创建好友房间/);
  assert.match(wxml, /输入房间号/);
  assert.match(wxml, /好友邀请/);
  assert.match(wxss, /\.battle-card/);
});

test('对战房间页提供等待、答题、结算和分享能力', () => {
  const js = readPage('battle-room', 'js');
  const wxml = readPage('battle-room', 'wxml');
  const wxss = readPage('battle-room', 'wxss');

  assert.match(js, /watchRoom/);
  assert.match(js, /setReady/);
  assert.match(js, /startRoom/);
  assert.match(js, /submitAnswer/);
  assert.match(js, /onShareAppMessage/);
  assert.match(wxml, /等待好友/);
  assert.match(wxml, /开始对战/);
  assert.match(wxml, /等待好友完成/);
  assert.match(wxml, /查看排行榜/);
  assert.match(wxss, /\.score-board/);
});
```

Append to `tests/project-structure.test.js`:

```js
test('应用注册好友对战页面', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/battle/index'), true);
  assert.equal(app.pages.includes('pages/battle-room/index'), true);
});
```

- [ ] **Step 2: Run page tests to verify they fail**

Run:

```powershell
node --test tests\battle-page.test.js tests\project-structure.test.js
```

Expected: FAIL because battle pages are missing and app pages are not registered.

- [ ] **Step 3: Register pages and create page shells**

Modify `miniprogram/app.json` by adding these routes after `pages/ranking/index`:

```json
"pages/battle/index",
"pages/battle-room/index",
```

Create `miniprogram/pages/battle/index.json`:

```json
{
  "navigationBarTitleText": "好友对战"
}
```

Create `miniprogram/pages/battle-room/index.json`:

```json
{
  "navigationBarTitleText": "对战房间"
}
```

- [ ] **Step 4: Implement battle lobby**

Create `miniprogram/pages/battle/index.js`:

```js
const { getWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { buildBattleQuestions } = require('../../utils/battle-question-builder');
const { createRoom, joinRoom } = require('../../services/battle-service');

Page({
  data: {
    roomId: '',
    loading: false,
  },

  onRoomInput(event) {
    this.setData({ roomId: event.detail.value.trim() });
  },

  async createBattleRoom() {
    const settings = loadSettings();
    const book = getWordbook(settings.selectedWordbookId);
    const questions = buildBattleQuestions(book.words);
    this.setData({ loading: true });
    const result = await createRoom({ wordbookId: book.id, questions });
    this.setData({ loading: false });
    if (!result.success) {
      wx.showToast({ title: result.message || '创建房间失败', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/battle-room/index?roomId=${result.room._id}` });
  },

  async joinBattleRoom() {
    if (!this.data.roomId) {
      wx.showToast({ title: '请输入房间号', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    const result = await joinRoom(this.data.roomId);
    this.setData({ loading: false });
    if (!result.success) {
      wx.showToast({ title: result.message || '加入房间失败', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/battle-room/index?roomId=${result.room._id}` });
  },
});
```

Create `miniprogram/pages/battle/index.wxml`:

```xml
<!-- 好友对战首页负责创建房间和通过房间号加入。 -->
<view class="page">
  <text class="page-title">好友对战</text>
  <text class="page-description">创建房间后分享给好友，双方准备后实时答题。</text>

  <view class="battle-card">
    <text class="card-title">好友邀请</text>
    <text class="muted">每局 10 题，答对 +10 分，胜利后计入排行榜。</text>
    <button class="primary-button" loading="{{loading}}" bindtap="createBattleRoom">创建好友房间</button>
  </view>

  <view class="battle-card">
    <text class="card-title">加入房间</text>
    <input class="room-input" placeholder="输入房间号" value="{{roomId}}" bindinput="onRoomInput" />
    <button class="secondary-button" loading="{{loading}}" bindtap="joinBattleRoom">加入对战</button>
  </view>
</view>
```

Create `miniprogram/pages/battle/index.wxss`:

```css
/* 对战首页沿用卡片式布局，突出创建和加入两个动作。 */
.page-title { display: block; margin-top: 24rpx; font-size: 48rpx; font-weight: 700; }
.page-description { display: block; margin: 10rpx 0 28rpx; color: #718096; font-size: 26rpx; }
.battle-card { padding: 32rpx; margin-bottom: 24rpx; background: #fff; border-radius: 28rpx; box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, 0.1); }
.card-title { display: block; margin-bottom: 10rpx; font-size: 34rpx; font-weight: 700; }
.muted { display: block; margin-bottom: 24rpx; color: #718096; font-size: 24rpx; }
.room-input { box-sizing: border-box; width: 100%; height: 84rpx; padding: 0 24rpx; margin: 18rpx 0; background: #f6f8ff; border-radius: 18rpx; }
.secondary-button { color: #176c52; background: #e5f8f1; border-radius: 999rpx; }
.secondary-button::after { border: 0; }
```

- [ ] **Step 5: Implement battle room page**

Create `miniprogram/pages/battle-room/index.js`:

```js
const {
  getRoom,
  setReady,
  startRoom,
  submitAnswer,
  watchRoom,
} = require('../../services/battle-service');

Page({
  data: {
    roomId: '',
    room: null,
    currentQuestion: null,
    selected: '',
    message: '',
  },

  onLoad(options = {}) {
    const roomId = options.roomId || '';
    this.setData({ roomId });
    this.loadRoom();
    this.startWatch();
  },

  onUnload() {
    if (this.watcher) this.watcher.close();
  },

  onShareAppMessage() {
    return {
      title: '来 WordRush 和我对战背单词',
      path: `/pages/battle-room/index?roomId=${this.data.roomId}`,
    };
  },

  async loadRoom() {
    const result = await getRoom(this.data.roomId);
    if (!result.success) {
      this.setData({ message: result.message || '房间不存在或已过期' });
      return;
    }
    this.applyRoom(result.room);
  },

  startWatch() {
    this.watcher = watchRoom(this.data.roomId, {
      onChange: (room) => this.applyRoom(room),
      onError: () => this.setData({ message: '实时同步已降级，仍可继续对战' }),
    });
  },

  applyRoom(room) {
    const currentPlayer = (room.players || []).find((player) => !player.finished);
    const questionIndex = currentPlayer ? currentPlayer.answeredCount : 0;
    this.setData({
      room,
      currentQuestion: room.questions ? room.questions[questionIndex] : null,
      selected: '',
    });
  },

  async toggleReady() {
    const result = await setReady(this.data.roomId, true);
    if (!result.success) wx.showToast({ title: result.message || '准备失败', icon: 'none' });
  },

  async startBattle() {
    const result = await startRoom(this.data.roomId);
    if (!result.success) wx.showToast({ title: result.message || '开始失败', icon: 'none' });
  },

  async chooseOption(event) {
    if (!this.data.currentQuestion) return;
    const selected = event.currentTarget.dataset.value;
    const questionIndex = this.data.room.players[0].answeredCount;
    this.setData({ selected });
    const result = await submitAnswer({
      roomId: this.data.roomId,
      questionIndex,
      selected,
    });
    if (!result.success) wx.showToast({ title: result.message || '提交失败', icon: 'none' });
  },

  openRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
```

Create `miniprogram/pages/battle-room/index.wxml`:

```xml
<!-- 对战房间页用同一套房间状态展示等待、答题和结算。 -->
<view class="page">
  <text class="page-title">对战房间</text>
  <text class="page-description">房间号：{{roomId}}</text>
  <view wx:if="{{message}}" class="notice">{{message}}</view>

  <view wx:if="{{room.status === 'waiting'}}" class="battle-card">
    <text class="card-title">等待好友</text>
    <view wx:for="{{room.players}}" wx:key="openid" class="player-row">
      <text>{{item.nickname}}</text>
      <text>{{item.ready ? '已准备' : '未准备'}}</text>
    </view>
    <button class="secondary-button" bindtap="toggleReady">我准备好了</button>
    <button class="primary-button" open-type="share">邀请好友</button>
    <button class="primary-button" bindtap="startBattle">开始对战</button>
  </view>

  <view wx:elif="{{room.status === 'playing'}}" class="battle-card">
    <view class="score-board">
      <view wx:for="{{room.players}}" wx:key="openid" class="score-item">
        <text>{{item.nickname}}</text>
        <text>{{item.score}} 分 · {{item.answeredCount}} / 10</text>
      </view>
    </view>
    <view wx:if="{{currentQuestion}}">
      <text class="word">{{currentQuestion.word}}</text>
      <button wx:for="{{currentQuestion.options}}" wx:key="*this" data-value="{{item}}" bindtap="chooseOption">
        {{item}}
      </button>
    </view>
    <text wx:else class="muted">等待好友完成</text>
  </view>

  <view wx:elif="{{room.status === 'finished'}}" class="battle-card">
    <text class="card-title">对战结束</text>
    <view wx:for="{{room.players}}" wx:key="openid" class="player-row">
      <text>{{item.nickname}}</text>
      <text>{{item.score}} 分</text>
    </view>
    <button class="primary-button" bindtap="openRanking">查看排行榜</button>
    <button class="secondary-button" bindtap="goHome">回到首页</button>
  </view>
</view>
```

Create `miniprogram/pages/battle-room/index.wxss`:

```css
/* 房间页强调实时比分和当前题目，保持 MVP 信息密度低。 */
.page-title { display: block; margin-top: 24rpx; font-size: 44rpx; font-weight: 700; }
.page-description { display: block; margin: 8rpx 0 24rpx; color: #718096; font-size: 24rpx; }
.notice { padding: 18rpx 22rpx; margin-bottom: 20rpx; color: #8a5a10; background: #fff8e6; border-radius: 18rpx; }
.battle-card { padding: 30rpx; background: #fff; border-radius: 28rpx; box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, 0.1); }
.card-title { display: block; margin-bottom: 18rpx; font-size: 34rpx; font-weight: 700; }
.player-row, .score-item { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0; color: #1f2a44; }
.score-board { padding: 18rpx; margin-bottom: 22rpx; background: #eef0ff; border-radius: 20rpx; }
.word { display: block; margin: 22rpx 0; font-size: 52rpx; font-weight: 700; text-align: center; }
.muted { display: block; color: #718096; text-align: center; }
.secondary-button { color: #176c52; background: #e5f8f1; border-radius: 999rpx; }
.secondary-button::after { border: 0; }
```

- [ ] **Step 6: Run page tests**

Run:

```powershell
node --test tests\battle-page.test.js tests\project-structure.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add miniprogram/app.json miniprogram/pages/battle miniprogram/pages/battle-room tests/battle-page.test.js tests/project-structure.test.js
git commit -m "feat: add battle pages"
```

## Task 6: Home Entry and Documentation

**Files:**
- Modify: `miniprogram/pages/home/index.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Modify: `tests/home-page.test.js`
- Modify: `README.md`

- [ ] **Step 1: Add failing home entry test**

Append to `tests/home-page.test.js`:

```js
test('首页提供好友对战入口', () => {
  const js = readPage('home', 'js');
  const wxml = readPage('home', 'wxml');
  const wxss = readPage('home', 'wxss');

  assert.match(js, /openBattle\(\)/);
  assert.match(wxml, /bindtap="openBattle"/);
  assert.match(wxml, />好友对战</);
  assert.match(wxss, /\.battle-button/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests\home-page.test.js
```

Expected: FAIL because `openBattle()` and `.battle-button` do not exist.

- [ ] **Step 3: Implement home entry**

Add to `miniprogram/pages/home/index.js` after `openRanking()`:

```js
openBattle() {
  // 好友对战独立成页，避免影响单人背词主流程。
  wx.navigateTo({ url: '/pages/battle/index' });
},
```

Add to `miniprogram/pages/home/index.wxml` inside `.header-actions` before the ranking button:

```xml
<button class="battle-button" bindtap="openBattle">好友对战</button>
```

Add to `miniprogram/pages/home/index.wxss` near `.ranking-button`:

```css
.battle-button { width: 140rpx; height: 64rpx; padding: 0; color: #fff; background: #5968e8; border-radius: 999rpx; font-size: 24rpx; line-height: 64rpx; }
.battle-button::after { border: 0; }
```

- [ ] **Step 4: Update README**

Modify `README.md`:

- Add `好友实时对战` to the opening feature list.
- Add feature bullets:
  - `好友对战：通过房间号或微信分享邀请好友进行 1v1 对战。`
  - `对战房间优先使用云数据库 watch 实时同步，失败时降级轮询。`
- Add CloudBase collections:
  - `battle_rooms`
  - `battle_records`
- Add deploy step:
  - `右键 cloudfunctions/battle，选择“上传并部署：云端安装依赖”。`
- Add acceptance checks:
  - `[ ] 可以创建好友对战房间并看到房间号`
  - `[ ] 好友可以通过房间号或分享链接进入房间`
  - `[ ] 双方准备后可以开始 10 题对战`
  - `[ ] 对战结束后排行榜数据增加`

- [ ] **Step 5: Run home tests**

Run:

```powershell
node --test tests\home-page.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add README.md miniprogram/pages/home/index.js miniprogram/pages/home/index.wxml miniprogram/pages/home/index.wxss tests/home-page.test.js
git commit -m "feat: add battle home entry"
```

## Task 7: Full Verification and Push

**Files:**
- Verify all changed files.
- No new production file in this task.

- [ ] **Step 1: Run full test suite**

Run:

```powershell
node --test
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Run JavaScript and JSON checks**

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

Expected: exit code 0.

- [ ] **Step 3: Run diff check**

Run:

```powershell
git diff --check
```

Expected: exit code 0.

- [ ] **Step 4: Confirm local-only config files remain unstaged**

Run:

```powershell
git status --short --branch
```

Expected: production/test/doc files are clean or staged by commits, while `project.config.json` and `project.private.config.json` may remain local-only if WeChat DevTools changed them.

- [ ] **Step 5: Push**

Run:

```powershell
git push
```

Expected: current branch `codex/multi-wordbooks` is pushed to GitHub.

## Self-Review Notes

- Spec coverage: the plan covers question generation, battle rules, cloud function actions, watch fallback, pages, home entry, README, verification, and push.
- Scope control: the plan does not add quick matching, chat, spectator mode, speed scoring, or complex reconnection.
- Type consistency: room fields use `_id`, `ownerOpenid`, `status`, `wordbookId`, `players`, `questions`, `answers`, `winnerOpenid`, and `result` consistently across rules, cloud function, service, and pages.
