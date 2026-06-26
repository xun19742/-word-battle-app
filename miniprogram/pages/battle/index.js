const { getWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { buildBattleQuestions } = require('../../utils/battle-question-builder');
const { createRoom, joinRoom } = require('../../services/battle-service');

Page({
  data: {
    roomId: '',
    loading: false,
  },

  onRoomInput(event) {
    this.setData({ roomId: event.detail.value.trim() });
  },

  async createBattleRoom() {
    // 首版题目从本地词书生成，云函数只负责房间和战绩流转。
    const settings = loadSettings();
    const book = getWordbook(settings.selectedWordbookId);
    const questions = buildBattleQuestions(book.words);
    this.setData({ loading: true });
    const result = await createRoom({ wordbookId: book.id, questions });
    this.setData({ loading: false });
    if (!result.success) {
      wx.showToast({ title: result.message || '创建房间失败', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/battle-room/index?roomId=${result.room._id}` });
  },

  async joinBattleRoom() {
    // 输入房间号加入好友房间，分享链接进入时会直接打开房间页。
    if (!this.data.roomId) {
      wx.showToast({ title: '请输入房间号', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    const result = await joinRoom(this.data.roomId);
    this.setData({ loading: false });
    if (!result.success) {
      wx.showToast({ title: result.message || '加入房间失败', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/battle-room/index?roomId=${result.room._id}` });
  },
});
