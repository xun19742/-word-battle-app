const {
  loadSettings,
  normalizeDailyNewWords,
  saveSettings,
} = require('../../services/settings-service');
const { saveSettingsToCloud } = require('../../services/cloud-api');

function getReviewTarget(settings) {
  return settings.dailyNewWords * settings.reviewRatio;
}

Page({
  data: {
    settings: {
      defaultMode: 'flashcard',
      selectedWordbookId: 'cet4',
      dailyNewWords: 25,
      reviewRatio: 2,
    },
    reviewTarget: 50,
  },

  onLoad() {
    const settings = loadSettings();
    this.setData({
      settings,
      reviewTarget: getReviewTarget(settings),
    });
  },

  changeMode(event) {
    this.persist({ defaultMode: event.detail.value });
  },

  changeDailyNewWords(event) {
    this.persist({ dailyNewWords: normalizeDailyNewWords(event.detail.value) });
  },

  inputDailyNewWords(event) {
    this.persist({ dailyNewWords: normalizeDailyNewWords(event.detail.value) });
  },

  changeReviewRatio(event) {
    this.persist({ reviewRatio: Number(event.detail.value) });
  },

  async persist(change) {
    // 每次修改都先落本地缓存，云端失败也不影响用户继续学习。
    const settings = saveSettings({ ...this.data.settings, ...change });
    this.setData({
      settings,
      reviewTarget: getReviewTarget(settings),
    });
    try {
      const synced = await saveSettingsToCloud(settings);
      wx.showToast({
        title: synced ? '设置已保存' : '已保存到本机',
        icon: synced ? 'success' : 'none',
      });
    } catch (error) {
      wx.showToast({ title: '已保存到本机', icon: 'none' });
    }
  },
});
