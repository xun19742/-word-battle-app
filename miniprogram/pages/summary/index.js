const { getSummary, createRound } = require('../../utils/round-engine');
const { loadRound, saveRound, clearRound } = require('../../utils/round-storage');
const { getBuiltinWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { createWxLearningRepository } = require('../../services/learning-repository');

Page({
  data: {
    summary: null,
  },

  onLoad() {
    const round = loadRound();
    if (!round || !round.completed) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    const summary = getSummary(round);
    createWxLearningRepository().applySummary(summary);
    clearRound();
    this.setData({ summary });
  },

  restart() {
    const book = getBuiltinWordbook();
    const settings = loadSettings();
    const round = createRound(book.words, settings.roundSize, settings.defaultMode);
    saveRound(round);
    this.openRound(round);
  },

  reviewWrongWords() {
    const repository = createWxLearningRepository();
    const ids = new Set(repository.listWrongWordIds());
    const words = getBuiltinWordbook().words.filter((word) => ids.has(word.id));
    if (!words.length) {
      wx.showToast({ title: '暂时没有错词', icon: 'none' });
      return;
    }
    const mode = words.length >= 4 ? 'quiz' : 'flashcard';
    const round = createRound(words, Math.min(10, words.length), mode);
    saveRound(round);
    this.openRound(round);
  },

  openRound(round) {
    const url = round.mode === 'quiz' ? '/pages/quiz/index' : '/pages/flashcard/index';
    wx.redirectTo({ url });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
