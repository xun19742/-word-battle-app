const { getSummary, createRound } = require('../../utils/round-engine');
const { loadRound, saveRound, clearRound } = require('../../utils/round-storage');
const { getWordbook } = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { buildStudyPlan } = require('../../services/study-plan-service');
const { createWxLearningRepository } = require('../../services/learning-repository');
const { createWxCheckinStore } = require('../../services/checkin-service');

Page({
  data: {
    summary: null,
    checkinMessage: '',
  },

  onLoad() {
    const round = loadRound();
    if (!round || !round.completed) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    const summary = getSummary(round);
    createWxLearningRepository().applySummary(summary);
    const checkin = createWxCheckinStore().applyCheckinSummary(summary);
    clearRound();
    this.setData({
      summary,
      checkinMessage: checkin.applied ? '今日打卡已记录' : '',
    });
  },

  restart() {
    const summary = this.data.summary || {};
    this.startPlannedRound(summary.studyType || 'new');
  },

  startPlannedRound(studyType) {
    const summary = this.data.summary || {};
    const settings = loadSettings();
    const book = getWordbook(summary.wordbookId || settings.selectedWordbookId);
    const repository = createWxLearningRepository();
    const plan = buildStudyPlan({
      book,
      records: repository.listRecords(book.id),
      today: repository.getTodaySummary(),
      settings,
      studyType,
    });
    if (plan.reason !== 'ready') {
      wx.showToast({
        title: plan.reason === 'goal-complete' ? '今日目标已完成' : '暂无可学习单词',
        icon: 'none',
      });
      setTimeout(() => wx.reLaunch({ url: '/pages/home/index' }), 700);
      return;
    }
    const mode = settings.defaultMode === 'quiz' && plan.words.length < 4
      ? 'flashcard'
      : settings.defaultMode;
    const round = createRound(plan.words, plan.words.length, mode, Math.random, {
      wordbookId: book.id,
      studyType,
    });
    saveRound(round);
    this.openRound(round);
  },

  reviewWrongWords() {
    const summary = this.data.summary || {};
    const settings = loadSettings();
    const book = getWordbook(summary.wordbookId || settings.selectedWordbookId);
    const repository = createWxLearningRepository();
    const ids = new Set(repository.listWrongWordIds(book.id));
    const words = book.words.filter((word) => ids.has(word.id));
    if (!words.length) {
      wx.showToast({ title: '暂时没有错词', icon: 'none' });
      return;
    }
    const mode = words.length >= 4 ? 'quiz' : 'flashcard';
    const round = createRound(words, Math.min(10, words.length), mode, Math.random, {
      wordbookId: book.id,
      studyType: 'review',
    });
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
