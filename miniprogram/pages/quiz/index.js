const {
  createQuizOptions,
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
    options: [],
    selected: '',
    isCorrect: false,
  },

  onLoad() {
    this.refresh(loadRound());
  },

  refresh(round) {
    if (!round) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    const currentWord = round.items[round.currentIndex];
    this.setData({
      round,
      currentWord,
      options: createQuizOptions(currentWord, round.items),
      selected: '',
      isCorrect: false,
    });
  },

  chooseOption(event) {
    if (this.data.round.answeredCurrent) {
      return;
    }
    const selected = event.currentTarget.dataset.value;
    const isCorrect = selected === this.data.currentWord.meaning;
    const round = answerCurrent(this.data.round, isCorrect);
    saveRound(round);
    this.setData({ round, selected, isCorrect });
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
    // 总结页统一记录两种模式的学习结果。
    saveRound(round);
    wx.redirectTo({ url: '/pages/summary/index' });
  },
});
