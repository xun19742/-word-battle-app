const {
  loadSettings,
  saveSettings,
} = require('../../services/settings-service');
const { saveSettingsToCloud } = require('../../services/cloud-api');

Page({
  data: {
    settings: {
      defaultMode: 'flashcard',
      roundSize: 10,
    },
  },

  onLoad() {
    this.setData({ settings: loadSettings() });
  },

  changeMode(event) {
    this.persist({ defaultMode: event.detail.value });
  },

  changeRoundSize(event) {
    this.persist({ roundSize: Number(event.detail.value) });
  },

  async persist(change) {
    // 每次选择立即保存，返回首页时无需额外确认按钮。
    const settings = saveSettings({ ...this.data.settings, ...change });
    this.setData({ settings });
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
