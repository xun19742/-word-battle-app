const {
  loadProfile,
  saveProfile: persistProfile,
} = require('../../services/profile-service');

Page({
  data: {
    profile: {
      nickname: 'WordRush 用户',
      avatarUrl: '',
      battleScore: 0,
      battleWins: 0,
      battleLosses: 0,
      battleDraws: 0,
      battlePlayed: 0,
    },
    saving: false,
  },

  onShow() {
    this.setData({ profile: loadProfile() });
  },

  chooseAvatar(event) {
    // 微信头像选择按钮只返回临时头像地址，用户点击保存后再写入本地和云端。
    this.setData({
      profile: {
        ...this.data.profile,
        avatarUrl: event.detail.avatarUrl,
      },
    });
  },

  inputNickname(event) {
    this.setData({
      profile: {
        ...this.data.profile,
        nickname: event.detail.value,
      },
    });
  },

  async saveProfile() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const profile = await persistProfile(this.data.profile);
      this.setData({ profile });
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
