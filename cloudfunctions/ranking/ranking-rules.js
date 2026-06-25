const DEFAULT_PROFILE = {
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battlePlayed: 0,
};

const RANKING_SORT_FIELDS = {
  battleScore: 'battleScore',
  battleWins: 'battleWins',
};

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isValidRankingType(type) {
  return Object.hasOwn(RANKING_SORT_FIELDS, type);
}

function getRankingSortField(type) {
  if (!isValidRankingType(type)) {
    throw new Error('排行榜类型无效');
  }
  return RANKING_SORT_FIELDS[type];
}

function normalizeRankingItem(user = {}, index = 0) {
  return {
    rank: index + 1,
    nickname: user.nickname || DEFAULT_PROFILE.nickname,
    avatarUrl: user.avatarUrl || DEFAULT_PROFILE.avatarUrl,
    battleScore: safeNumber(user.battleScore),
    battleWins: safeNumber(user.battleWins),
    battlePlayed: safeNumber(user.battlePlayed),
  };
}

function buildRankingList(users = [], type = 'battleScore') {
  const sortField = getRankingSortField(type);
  return [...users]
    .sort((left, right) => safeNumber(right[sortField]) - safeNumber(left[sortField]))
    .slice(0, 50)
    .map(normalizeRankingItem);
}

module.exports = {
  buildRankingList,
  getRankingSortField,
  isValidRankingType,
  normalizeRankingItem,
};
