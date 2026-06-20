function validateCloudSettings(settings) {
  if (
    !settings
    || !['flashcard', 'quiz'].includes(settings.defaultMode)
    || ![10, 20].includes(settings.roundSize)
  ) {
    throw new Error('设置参数无效');
  }
  return {
    defaultMode: settings.defaultMode,
    roundSize: settings.roundSize,
  };
}

function createDefaultUser(openid, settings = {}) {
  let normalized = { defaultMode: 'flashcard', roundSize: 10 };
  if (settings.defaultMode !== undefined || settings.roundSize !== undefined) {
    normalized = validateCloudSettings(settings);
  }
  return {
    _openid: openid,
    nickname: 'WordRush 用户',
    avatarUrl: '',
    ...normalized,
    totalScore: 0,
  };
}

module.exports = {
  createDefaultUser,
  validateCloudSettings,
};
