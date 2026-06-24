const { createWxQueue } = require('./sync-queue');
const { recordKey } = require('./study-plan-service');

const LEARNING_KEY = 'wordrush.learningRecords';
const LEGACY_WORDBOOK_ID = 'cet4-core-100';

function emptyDaily(date = '') {
  return {
    date,
    completed: 0,
    newCompleted: 0,
    reviewCompleted: 0,
    score: 0,
  };
}

function emptyState() {
  return {
    processedRoundIds: [],
    records: {},
    daily: emptyDaily(),
  };
}

function normalizeRecords(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const records = {};
  Object.entries(value).forEach(([storedKey, storedRecord]) => {
    const record = storedRecord && typeof storedRecord === 'object'
      ? storedRecord
      : {};
    const separator = storedKey.indexOf(':');
    const wordbookId = record.wordbookId
      || (separator >= 0 ? storedKey.slice(0, separator) : LEGACY_WORDBOOK_ID);
    const wordId = record.wordId
      || (separator >= 0 ? storedKey.slice(separator + 1) : storedKey);
    records[recordKey(wordbookId, wordId)] = {
      ...record,
      wordbookId,
      wordId,
    };
  });
  return records;
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
    records: normalizeRecords(value.records),
    daily: value.daily && typeof value.daily === 'object'
      ? { ...fallback.daily, ...value.daily }
      : fallback.daily,
  };
}

function createLearningRepository(
  read,
  write,
  queue,
  now = () => new Date().toISOString(),
) {
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
      const wordbookId = summary.wordbookId || LEGACY_WORDBOOK_ID;
      const studyType = ['new', 'review'].includes(summary.studyType)
        ? summary.studyType
        : 'new';
      const records = { ...state.records };
      summary.answers.forEach((answer) => {
        const key = recordKey(wordbookId, answer.wordId);
        const current = records[key] || {
          correctCount: 0,
          wrongCount: 0,
        };
        records[key] = {
          ...current,
          wordbookId,
          wordId: answer.wordId,
          studyType,
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
        : emptyDaily(date);
      const nextState = {
        processedRoundIds: [...state.processedRoundIds, summary.roundId],
        records,
        daily: {
          ...currentDaily,
          date,
          completed: currentDaily.completed + summary.total,
          newCompleted: currentDaily.newCompleted
            + (studyType === 'new' ? summary.total : 0),
          reviewCompleted: currentDaily.reviewCompleted
            + (studyType === 'review' ? summary.total : 0),
          score: currentDaily.score + summary.score,
        },
      };
      write(nextState);
      queue.enqueue({
        ...summary,
        wordbookId,
        studyType,
        completedAt: timestamp,
      });
      return { applied: true };
    },

    getRecord(wordbookId, wordId) {
      if (wordId === undefined) {
        wordId = wordbookId;
        wordbookId = LEGACY_WORDBOOK_ID;
      }
      return readState().records[recordKey(wordbookId, wordId)] || null;
    },

    listRecords(wordbookId) {
      return Object.fromEntries(
        Object.entries(readState().records)
          .filter(([, record]) => record.wordbookId === wordbookId),
      );
    },

    listWrongWordIds(wordbookId = LEGACY_WORDBOOK_ID) {
      return Object.values(readState().records)
        .filter((record) => (
          record.wordbookId === wordbookId && record.isWrongWord
        ))
        .map((record) => record.wordId);
    },

    getTodaySummary() {
      const state = readState();
      const today = now().slice(0, 10);
      if (state.daily.date !== today) {
        const { date, ...summary } = emptyDaily(today);
        return summary;
      }
      return {
        completed: state.daily.completed,
        newCompleted: state.daily.newCompleted,
        reviewCompleted: state.daily.reviewCompleted,
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
