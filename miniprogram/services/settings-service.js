const { isValidWordbookId } = require('./wordbook-service');

const SETTINGS_KEY = 'wordrush.settings';

function normalizeDailyNewWords(value) {
  const number = Number(value);
  const safeValue = Number.isFinite(number) ? number : 25;
  return Math.min(500, Math.max(5, Math.round(safeValue / 5) * 5));
}

function normalizeSettings(input = {}) {
  return {
    defaultMode: ['flashcard', 'quiz'].includes(input.defaultMode)
      ? input.defaultMode
      : 'flashcard',
    selectedWordbookId: isValidWordbookId(input.selectedWordbookId)
      ? input.selectedWordbookId
      : 'cet4',
    dailyNewWords: normalizeDailyNewWords(input.dailyNewWords),
    reviewRatio: [1, 2, 3].includes(Number(input.reviewRatio))
      ? Number(input.reviewRatio)
      : 2,
  };
}

function loadSettings() {
  return normalizeSettings(wx.getStorageSync(SETTINGS_KEY));
}

function saveSettings(input) {
  // 写入前统一校验，防止旧缓存或页面参数污染设置。
  const settings = normalizeSettings(input);
  wx.setStorageSync(SETTINGS_KEY, settings);
  return settings;
}

module.exports = {
  normalizeDailyNewWords,
  normalizeSettings,
  loadSettings,
  saveSettings,
};
