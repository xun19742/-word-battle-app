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
