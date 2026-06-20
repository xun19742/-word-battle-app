const { login, syncLearning } = require('./services/cloud-api');
const { createWxQueue } = require('./services/sync-queue');
const {
  loadSettings,
  saveSettings,
} = require('./services/settings-service');

App({
  globalData: {
    cloudAvailable: false,
    openid: '',
    syncPending: false,
    cloudMessage: '',
  },

  async onLaunch() {
    // 游客 AppID 可以预览界面，使用真实 AppID 时再启用云开发能力。
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
    await this.initializeCloud();
    wx.onNetworkStatusChange((status) => {
      if (status.isConnected) {
        this.retrySync();
      }
    });
  },

  async initializeCloud() {
    try {
      const session = await login(loadSettings());
      this.globalData.cloudAvailable = session.cloudAvailable;
      this.globalData.openid = session.openid;
      if (session.settings) {
        saveSettings(session.settings);
      }
      this.globalData.cloudMessage = session.cloudAvailable
        ? ''
        : '当前为本地体验模式，学习记录尚未同步云端';
      await this.retrySync();
    } catch (error) {
      this.globalData.cloudAvailable = false;
      this.globalData.cloudMessage = '云端登录失败，学习记录会保存在本机';
    }
    this.notifyCloudState();
  },

  async retrySync() {
    const queue = createWxQueue();
    if (!this.globalData.cloudAvailable) {
      this.globalData.syncPending = queue.list().length > 0;
      return;
    }
    const remaining = await queue.flush(syncLearning);
    this.globalData.syncPending = remaining.length > 0;
    this.notifyCloudState();
  },

  notifyCloudState() {
    // 登录或同步完成后，若首页已显示则立即刷新状态提示。
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    if (current && current.route === 'pages/home/index') {
      current.setData({
        cloudMessage: this.globalData.cloudMessage,
        syncPending: this.globalData.syncPending,
      });
    }
  },
});
