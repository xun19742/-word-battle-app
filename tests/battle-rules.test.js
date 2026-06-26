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

function createJoinedRoom() {
  return joinBattleRoom(createBattleRoom({
    roomId: '123456',
    owner,
    wordbookId: 'cet4',
    questions,
    now,
  }), guest, now);
}

function createStartedRoom() {
  const room = createJoinedRoom();
  const readyOwner = setPlayerReady(room, owner.openid, true, now);
  const readyGuest = setPlayerReady(readyOwner, guest.openid, true, now);
  return startBattleRoom(readyGuest, owner.openid, now);
}

test('创建房间并加入好友后保持等待状态', () => {
  const joined = createJoinedRoom();

  assert.equal(joined.status, 'waiting');
  assert.equal(joined.players.length, 2);
  assert.equal(joined.players[0].ready, false);
  assert.equal(joined.players[1].nickname, '好友');
});

test('双方准备后房主可以开始房间', () => {
  const started = createStartedRoom();

  assert.equal(started.status, 'playing');
  assert.equal(started.startedAt, now());
});

test('提交答案会计分并拒绝同一题重复提交', () => {
  const room = createStartedRoom();
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
  let room = createStartedRoom();
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
