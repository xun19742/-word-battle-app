const SETTINGS_KEY = 'wordrush.settings';

function normalizeSettings(input = {}) {
  return {
    defaultMode: ['flashcard', 'quiz'].includes(input.defaultMode)
      ? input.defaultMode
      : 'flashcard',
    roundSize: [10, 20].includes(input.roundSize) ? input.roundSize : 10,
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
  normalizeSettings,
  loadSettings,
  saveSettings,
};
