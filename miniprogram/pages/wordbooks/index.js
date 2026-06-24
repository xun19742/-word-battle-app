const {
  listWordbooks,
} = require('../../services/wordbook-service');
const {
  loadSettings,
  saveSettings,
} = require('../../services/settings-service');
const { saveSettingsToCloud } = require('../../services/cloud-api');

Page({
  data: {
    books: [],
    selectedWordbookId: 'cet4',
  },

  onShow() {
    const settings = loadSettings();
    this.setData({
      books: listWordbooks(),
      selectedWordbookId: settings.selectedWordbookId,
    });
  },

  async selectWordbook(event) {
    const selectedWordbookId = event.currentTarget.dataset.id;
    const settings = saveSettings({
      ...loadSettings(),
      selectedWordbookId,
    });
    this.setData({ selectedWordbookId });
    try {
      await saveSettingsToCloud(settings);
    } catch (error) {
      // 离线时本地选择已经生效，云同步失败不阻塞返回首页。
    }
    wx.navigateBack();
  },
});
