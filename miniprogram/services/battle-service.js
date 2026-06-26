function hasCloud() {
  return typeof wx !== 'undefined' && wx.cloud;
}

function noCloudResult() {
  return { success: false, message: '对战需要云服务', room: null };
}

async function callBattle(action, data = {}) {
  if (!hasCloud()) {
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
    const detail = error && (error.errMsg || error.message || error.toString());
    return {
      success: false,
      message: detail ? `对战请求失败：${detail}` : '对战请求失败',
      room: null,
    };
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
  if (!hasCloud()) {
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
    // 开发者工具或权限未配置时，自动退回云函数轮询，保证 MVP 可用。
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
