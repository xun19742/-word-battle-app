const { createWxQueue } = require('./sync-queue');

const LEARNING_KEY = 'wordrush.learningRecords';

function emptyState() {
  return {
    processedRoundIds: [],
    records: {},
    daily: { date: '', completed: 0, score: 0 },
  };
}

function normalizeState(value) {
  const fallback = emptyState();
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  return {
    processedRoundIds: Array.isArray(value.processedRoundIds)
      ? [...value.processedRoundIds]
      : [],
    records: value.records && typeof value.records === 'object'
      ? { ...value.records }
      : {},
    daily: value.daily && typeof value.daily === 'object'
      ? { ...fallback.daily, ...value.daily }
      : fallback.daily,
  };
}

function createLearningRepository(read, write, queue, now = () => new Date().toISOString()) {
  function readState() {
    return normalizeState(read());
  }

  return {
    applySummary(summary) {
      const state = readState();
      if (state.processedRoundIds.includes(summary.roundId)) {
        return { applied: false };
      }

      const timestamp = now();
      const date = timestamp.slice(0, 10);
      const records = { ...state.records };
      summary.answers.forEach((answer) => {
        const current = records[answer.wordId] || {
          correctCount: 0,
          wrongCount: 0,
        };
        records[answer.wordId] = {
          ...current,
          wordId: answer.wordId,
          correctCount: current.correctCount + (answer.isCorrect ? 1 : 0),
          wrongCount: current.wrongCount + (answer.isCorrect ? 0 : 1),
          lastResult: answer.isCorrect ? 'correct' : 'wrong',
          isWrongWord: !answer.isCorrect,
          lastMode: answer.mode,
          lastStudiedAt: timestamp,
        };
      });

      const currentDaily = state.daily.date === date
        ? state.daily
        : { date, completed: 0, score: 0 };
      const nextState = {
        processedRoundIds: [...state.processedRoundIds, summary.roundId],
        records,
        daily: {
          date,
          completed: currentDaily.completed + summary.total,
          score: currentDaily.score + summary.score,
        },
      };
      write(nextState);
      queue.enqueue({ ...summary, completedAt: timestamp });
      return { applied: true };
    },

    getRecord(wordId) {
      return readState().records[wordId] || null;
    },

    listWrongWordIds() {
      return Object.values(readState().records)
        .filter((record) => record.isWrongWord)
        .map((record) => record.wordId);
    },

    getTodaySummary() {
      const state = readState();
      const today = now().slice(0, 10);
      if (state.daily.date !== today) {
        return { completed: 0, score: 0 };
      }
      return {
        completed: state.daily.completed,
        score: state.daily.score,
      };
    },
  };
}

function createWxLearningRepository() {
  return createLearningRepository(
    () => wx.getStorageSync(LEARNING_KEY),
    (value) => wx.setStorageSync(LEARNING_KEY, value),
    createWxQueue(),
  );
}

module.exports = {
  createLearningRepository,
  createWxLearningRepository,
};
