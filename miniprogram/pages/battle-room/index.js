const {
  getRoom,
  setReady,
  startRoom,
  submitAnswer,
  watchRoom,
} = require('../../services/battle-service');

function findPlayer(room, openid) {
  return (room.players || []).find((player) => player.openid === openid) || null;
}

Page({
  data: {
    roomId: '',
    room: null,
    currentQuestion: null,
    selected: '',
    message: '',
    myOpenid: '',
    myPlayer: null,
  },

  onLoad(options = {}) {
    const roomId = options.roomId || '';
    this.setData({
      roomId,
      myOpenid: getApp().globalData.openid,
    });
    this.loadRoom();
    this.startWatch();
  },

  onUnload() {
    if (this.watcher) this.watcher.close();
  },

  onShareAppMessage() {
    return {
      title: '来 WordRush 和我对战背单词',
      path: `/pages/battle-room/index?roomId=${this.data.roomId}`,
    };
  },

  async loadRoom() {
    const result = await getRoom(this.data.roomId);
    if (!result.success) {
      this.setData({ message: result.message || '房间不存在或已过期' });
      return;
    }
    this.applyRoom(result.room);
  },

  startWatch() {
    this.watcher = watchRoom(this.data.roomId, {
      onChange: (room) => this.applyRoom(room),
      onError: () => this.setData({ message: '实时同步已降级，仍可继续对战' }),
    });
  },

  applyRoom(room) {
    // 房间文档里有双方进度，页面用自己的 OpenID 找到本方当前题号。
    const myPlayer = findPlayer(room, this.data.myOpenid);
    const questionIndex = myPlayer ? myPlayer.answeredCount : 0;
    this.setData({
      room,
      myPlayer,
      currentQuestion: room.questions ? room.questions[questionIndex] : null,
      selected: '',
    });
  },

  async toggleReady() {
    const result = await setReady(this.data.roomId, true);
    if (!result.success) wx.showToast({ title: result.message || '准备失败', icon: 'none' });
  },

  async startBattle() {
    const result = await startRoom(this.data.roomId);
    if (!result.success) wx.showToast({ title: result.message || '开始失败', icon: 'none' });
  },

  async chooseOption(event) {
    // 每次只提交本方当前题，重复提交由云端规则兜底忽略。
    if (!this.data.currentQuestion || !this.data.myPlayer) return;
    const selected = event.currentTarget.dataset.value;
    const questionIndex = this.data.myPlayer.answeredCount;
    this.setData({ selected });
    const result = await submitAnswer({
      roomId: this.data.roomId,
      questionIndex,
      selected,
    });
    if (!result.success) wx.showToast({ title: result.message || '提交失败', icon: 'none' });
  },

  openRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
