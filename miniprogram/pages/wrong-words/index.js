const { getWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { createWxLearningRepository } = require('../../services/learning-repository');
const { createRound } = require('../../utils/round-engine');
const { saveRound } = require('../../utils/round-storage');

Page({
  data: {
    words: [],
    bookId: 'cet4',
  },

  onShow() {
    const settings = loadSettings();
    const book = getWordbook(settings.selectedWordbookId);
    const repository = createWxLearningRepository();
    const ids = new Set(repository.listWrongWordIds(book.id));
    const words = book.words
      .filter((word) => ids.has(word.id))
      .map((word) => {
        const record = repository.getRecord(book.id, word.id) || {};
        return { ...word, wrongCount: record.wrongCount || 0 };
      });
    this.setData({ words, bookId: book.id });
  },

  startReview() {
    const words = this.data.words;
    if (!words.length) {
      return;
    }
    const mode = words.length >= 4 ? 'quiz' : 'flashcard';
    const round = createRound(words, Math.min(10, words.length), mode, Math.random, {
      wordbookId: this.data.bookId,
      studyType: 'review',
    });
    saveRound(round);
    wx.navigateTo({ url: mode === 'quiz' ? '/pages/quiz/index' : '/pages/flashcard/index' });
  },
});
