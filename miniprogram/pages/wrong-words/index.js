const { getBuiltinWordbook } = require('../../services/wordbook-service');
const { createWxLearningRepository } = require('../../services/learning-repository');
const { createRound } = require('../../utils/round-engine');
const { saveRound } = require('../../utils/round-storage');

Page({
  data: {
    words: [],
  },

  onShow() {
    const repository = createWxLearningRepository();
    const ids = new Set(repository.listWrongWordIds());
    const words = getBuiltinWordbook().words
      .filter((word) => ids.has(word.id))
      .map((word) => ({ ...word, wrongCount: repository.getRecord(word.id).wrongCount }));
    this.setData({ words });
  },

  startReview() {
    const words = this.data.words;
    if (!words.length) {
      return;
    }
    const mode = words.length >= 4 ? 'quiz' : 'flashcard';
    const round = createRound(words, Math.min(10, words.length), mode);
    saveRound(round);
    wx.navigateTo({ url: mode === 'quiz' ? '/pages/quiz/index' : '/pages/flashcard/index' });
  },
});
