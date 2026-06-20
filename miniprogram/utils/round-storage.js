const ACTIVE_ROUND_KEY = 'wordrush.activeRound';

function saveRound(round) {
  // 每题后保存完整轮次，异常退出时可以从当前题继续。
  wx.setStorageSync(ACTIVE_ROUND_KEY, round);
}

function loadRound() {
  return wx.getStorageSync(ACTIVE_ROUND_KEY) || null;
}

function clearRound() {
  wx.removeStorageSync(ACTIVE_ROUND_KEY);
}

module.exports = {
  saveRound,
  loadRound,
  clearRound,
};
