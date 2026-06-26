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
  const timestamp = safeNow(now);
  const isCorrect = selected === question.correctOption;
  const nextAnswers = [
    ...currentAnswers,
    { questionIndex, selected, isCorrect, answeredAt: timestamp },
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
    updatedAt: timestamp,
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
