const { getBuiltinWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { createRound } = require('../../utils/round-engine');
const { saveRound, loadRound } = require('../../utils/round-storage');
const { createWxLearningRepository } = require('../../services/learning-repository');

Page({
  data: {
    bookName: '',
    wordCount: 0,
    settings: {},
    modeLabel: '',
    activeRound: null,
    todayCompleted: 0,
    todayScore: 0,
    progressPercent: 0,
  },

  onShow() {
    const book = getBuiltinWordbook();
    const settings = loadSettings();
    const today = createWxLearningRepository().getTodaySummary();
    this.setData({
      bookName: book.name,
      wordCount: book.words.length,
      settings,
      modeLabel: settings.defaultMode === 'flashcard' ? '单词卡片' : '四选一练习',
      activeRound: loadRound(),
      todayCompleted: today.completed,
      todayScore: today.score,
      progressPercent: Math.min(100, Math.round((today.completed / settings.roundSize) * 100)),
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

  openWrongWords() {
    wx.navigateTo({ url: '/pages/wrong-words/index' });
  },
});
