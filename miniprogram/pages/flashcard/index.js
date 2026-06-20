const {
  answerCurrent,
  nextQuestion,
} = require('../../utils/round-engine');
const {
  loadRound,
  saveRound,
  clearRound,
} = require('../../utils/round-storage');

Page({
  data: {
    round: null,
    currentWord: null,
    revealed: false,
    resultLabel: '',
  },

  onLoad() {
    this.refresh(loadRound());
  },

  refresh(round) {
    if (!round) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    this.setData({
      round,
      currentWord: round.items[round.currentIndex],
      revealed: round.answeredCurrent,
      resultLabel: '',
    });
  },

  revealCard() {
    this.setData({ revealed: true });
  },

  markKnown() {
    this.record(true);
  },

  markUnknown() {
    this.record(false);
  },

  record(isCorrect) {
    const round = answerCurrent(this.data.round, isCorrect);
    saveRound(round);
    this.setData({
      round,
      revealed: true,
      resultLabel: isCorrect ? '已掌握' : '加入错词',
    });
  },

  next() {
    const round = nextQuestion(this.data.round);
    saveRound(round);
    if (round.completed) {
      this.finishRound(round);
      return;
    }
    this.refresh(round);
  },

  finishRound(round) {
    // 总结页接入前也保证卡片轮次能够完整结束。
    wx.showModal({
      title: '本轮完成',
      content: `答对 ${round.correctCount} 个，需复习 ${round.wrongCount} 个`,
      showCancel: false,
      success: () => {
        clearRound();
        wx.reLaunch({ url: '/pages/home/index' });
      },
    });
  },
});
