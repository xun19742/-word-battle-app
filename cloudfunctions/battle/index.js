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
    const recordId = `${room._id}_${player.openid}`;
    const existing = await db.collection('battle_records').doc(recordId).get()
      .catch(() => ({ data: null }));
    if (existing.data) {
      continue;
    }
    const opponent = player.openid === left.openid ? right : left;
    const result = getPlayerResult(player, opponent);
    const delta = await updateUserStats(player.openid, result);
    // 对战记录一人一条，避免重复结算时再次累计用户战绩。
    await db.collection('battle_records').doc(recordId).set({
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

function roomNotFound() {
  return { success: false, message: '房间不存在或已过期' };
}

exports.main = async (event = {}) => {
  // OpenID 只从可信云上下文获取，客户端不能自报身份。
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
    return room ? { success: true, room } : roomNotFound();
  }

  if (action === 'joinRoom') {
    const room = await getRoom(event.roomId);
    if (!room) return roomNotFound();
    const nextRoom = joinBattleRoom(room, publicProfile(OPENID, user), () => new Date().toISOString());
    await saveRoom(nextRoom);
    return { success: true, room: nextRoom };
  }

  if (action === 'setReady') {
    const room = await getRoom(event.roomId);
    if (!room) return roomNotFound();
    const nextRoom = setPlayerReady(room, OPENID, Boolean(event.ready), () => new Date().toISOString());
    await saveRoom(nextRoom);
    return { success: true, room: nextRoom };
  }

  if (action === 'startRoom') {
    const room = await getRoom(event.roomId);
    if (!room) return roomNotFound();
    const nextRoom = startBattleRoom(room, OPENID, () => new Date().toISOString());
    await saveRoom(nextRoom);
    return { success: true, room: nextRoom };
  }

  if (action === 'submitAnswer') {
    const room = await getRoom(event.roomId);
    if (!room) return roomNotFound();
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
    if (!room) return roomNotFound();
    const nextRoom = settleBattleRoom(room, () => new Date().toISOString());
    await saveRoom(nextRoom);
    await writeBattleRecords(nextRoom);
    return { success: true, room: nextRoom };
  }

  return { success: false, message: '对战操作无效' };
};
