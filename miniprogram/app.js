App({
  onLaunch() {
    // 游客 AppID 可以预览界面，使用真实 AppID 时再启用云开发能力。
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
  },
});
