const {
  loadSettings,
  saveSettings,
} = require('../../services/settings-service');

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

  persist(change) {
    // 每次选择立即保存，返回首页时无需额外确认按钮。
    const settings = saveSettings({ ...this.data.settings, ...change });
    this.setData({ settings });
    wx.showToast({ title: '设置已保存', icon: 'success' });
  },
});
