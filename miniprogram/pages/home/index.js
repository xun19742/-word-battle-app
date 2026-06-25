const {
  getWordbook,
} = require('../../services/wordbook-service');
const { loadSettings } = require('../../services/settings-service');
const { buildStudyPlan } = require('../../services/study-plan-service');
const { createRound } = require('../../utils/round-engine');
const { saveRound, loadRound } = require('../../utils/round-storage');
const {
  createWxLearningRepository,
} = require('../../services/learning-repository');
const { createWxCheckinStore } = require('../../services/checkin-service');

Page({
  data: {
    bookName: '',
    wordCount: 0,
    settings: {},
    modeLabel: '',
    activeRound: null,
    activeBookName: '',
    todayCompleted: 0,
    todayScore: 0,
    newCompleted: 0,
    reviewCompleted: 0,
    reviewTarget: 0,
    newProgressPercent: 0,
    reviewProgressPercent: 0,
    checkinStats: {
      checkedToday: false,
      streak: 0,
      todayCompleted: 0,
      todayScore: 0,
      totalDays: 0,
    },
    cloudMessage: '',
    syncPending: false,
  },

  onShow() {
    const settings = loadSettings();
    const book = getWordbook(settings.selectedWordbookId);
    const today = createWxLearningRepository().getTodaySummary();
    const activeRound = loadRound();
    const app = getApp();
    const reviewTarget = settings.dailyNewWords * settings.reviewRatio;
    const checkinStats = createWxCheckinStore().loadCheckinStats();
    this.setData({
      bookName: book.name,
      wordCount: book.words.length,
      settings,
      modeLabel: settings.defaultMode === 'flashcard'
        ? '单词卡片'
        : '四选一练习',
      activeRound,
      activeBookName: activeRound
        ? getWordbook(activeRound.wordbookId).name
        : '',
      todayCompleted: today.completed,
      todayScore: today.score,
      newCompleted: today.newCompleted,
      reviewCompleted: today.reviewCompleted,
      reviewTarget,
      newProgressPercent: Math.min(
        100,
        Math.round((today.newCompleted / settings.dailyNewWords) * 100),
      ),
      reviewProgressPercent: Math.min(
        100,
        Math.round((today.reviewCompleted / reviewTarget) * 100),
      ),
      checkinStats,
      cloudMessage: app.globalData.cloudMessage,
      syncPending: app.globalData.syncPending,
    });
  },

  startNewWords() {
    this.startStudyType('new');
  },

  startReview() {
    this.startStudyType('review');
  },

  startLearning() {
    // 兼容旧入口名称，默认继续学习新词。
    this.startNewWords();
  },

  startStudyType(studyType) {
    const settings = this.data.settings;
    const book = getWordbook(settings.selectedWordbookId);
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
        title: plan.reason === 'goal-complete'
          ? '今日目标已完成'
          : '暂无可学习单词',
        icon: 'none',
      });
      return;
    }
    const mode = settings.defaultMode === 'quiz' && plan.words.length < 4
      ? 'flashcard'
      : settings.defaultMode;
    const round = createRound(
      plan.words,
      plan.words.length,
      mode,
      Math.random,
      { wordbookId: book.id, studyType },
    );
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

  openProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  openCheckins() {
    wx.navigateTo({ url: '/pages/checkin/index' });
  },

  openWordbooks() {
    wx.navigateTo({ url: '/pages/wordbooks/index' });
  },

  openWrongWords() {
    wx.navigateTo({ url: '/pages/wrong-words/index' });
  },
});
