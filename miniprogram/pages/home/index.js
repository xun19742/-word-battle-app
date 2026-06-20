const { getBuiltinWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { createRound } = require('../../utils/round-engine');
const { saveRound, loadRound } = require('../../utils/round-storage');

Page({
  data: {
    bookName: '',
    wordCount: 0,
    settings: {},
    modeLabel: '',
    activeRound: null,
  },

  onShow() {
    const book = getBuiltinWordbook();
    const settings = loadSettings();
    this.setData({
      bookName: book.name,
      wordCount: book.words.length,
      settings,
      modeLabel: settings.defaultMode === 'flashcard' ? '单词卡片' : '四选一练习',
      activeRound: loadRound(),
    });
  },

  startLearning() {
    const book = getBuiltinWordbook();
    const { defaultMode, roundSize } = this.data.settings;
    const round = createRound(book.words, roundSize, defaultMode);
    saveRound(round);
    this.openRound(round);
  },

  resumeLearning() {
    const round = loadRound();
    if (round) {
      this.openRound(round);
    }
  },

  openRound(round) {
    // 两种模式各自拥有页面，但共享同一个轮次结构。
    const url = round.mode === 'flashcard'
      ? '/pages/flashcard/index'
      : '/pages/quiz/index';
    wx.navigateTo({ url });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },
});
