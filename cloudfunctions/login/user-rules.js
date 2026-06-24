const WORDBOOK_IDS = [
  'cet4',
  'cet6',
  'postgraduate',
  'ielts',
  'cet4-core-100',
];

const DEFAULT_SETTINGS = {
  defaultMode: 'flashcard',
  selectedWordbookId: 'cet4',
  dailyNewWords: 25,
  reviewRatio: 2,
};

const DEFAULT_PROFILE = {
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
  battlePlayed: 0,
};

function validateCloudSettings(settings) {
  if (
    !settings
    || !['flashcard', 'quiz'].includes(settings.defaultMode)
    || !WORDBOOK_IDS.includes(settings.selectedWordbookId)
    || !Number.isInteger(settings.dailyNewWords)
    || settings.dailyNewWords < 5
    || settings.dailyNewWords > 500
    || settings.dailyNewWords % 5 !== 0
    || ![1, 2, 3].includes(settings.reviewRatio)
  ) {
    throw new Error('设置参数无效');
  }
  return {
    defaultMode: settings.defaultMode,
    selectedWordbookId: settings.selectedWordbookId,
    dailyNewWords: settings.dailyNewWords,
    reviewRatio: settings.reviewRatio,
  };
}

function normalizeProfileInput(profile = {}) {
  const nickname = String(profile.nickname || '').trim();
  const avatarUrl = String(profile.avatarUrl || '').trim();
  if (
    !nickname
    || nickname.length > 32
    || typeof profile.avatarUrl !== 'string'
    || avatarUrl.length > 300
  ) {
    throw new Error('用户资料无效');
  }
  return { nickname, avatarUrl };
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function getPublicUserProfile(user = {}) {
  return {
    nickname: user.nickname || DEFAULT_PROFILE.nickname,
    avatarUrl: user.avatarUrl || DEFAULT_PROFILE.avatarUrl,
    battleScore: safeNumber(user.battleScore),
    battleWins: safeNumber(user.battleWins),
    battleLosses: safeNumber(user.battleLosses),
    battleDraws: safeNumber(user.battleDraws),
    battlePlayed: safeNumber(user.battlePlayed),
  };
}

function createDefaultUser(openid, settings) {
  const normalized = settings
    ? validateCloudSettings(settings)
    : { ...DEFAULT_SETTINGS };
  return {
    _openid: openid,
    ...DEFAULT_PROFILE,
    ...normalized,
    totalScore: 0,
  };
}

module.exports = {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  WORDBOOK_IDS,
  createDefaultUser,
  getPublicUserProfile,
  normalizeProfileInput,
  validateCloudSettings,
};
