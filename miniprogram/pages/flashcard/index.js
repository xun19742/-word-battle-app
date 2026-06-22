const {
  answerCurrent,
  nextQuestion,
} = require('../../utils/round-engine');
const {
  loadRound,
  saveRound,
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
    const {
      round,
      currentWord,
      revealed,
    } = this.data;
    // 只允许有效且尚未作答的当前词进入释义状态。
    if (!round || !currentWord || revealed || round.answeredCurrent) {
      return;
    }
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
    // 保留活动轮次给总结页做幂等聚合，再由总结页清理。
    saveRound(round);
    wx.redirectTo({ url: '/pages/summary/index' });
  },
});
