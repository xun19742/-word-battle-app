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

function createDefaultUser(openid, settings) {
  const normalized = settings
    ? validateCloudSettings(settings)
    : { ...DEFAULT_SETTINGS };
  return {
    _openid: openid,
    nickname: 'WordRush 用户',
    avatarUrl: '',
    ...normalized,
    totalScore: 0,
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  WORDBOOK_IDS,
  createDefaultUser,
  validateCloudSettings,
};
