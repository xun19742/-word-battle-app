const ROUND_LIMIT = 10;

function recordKey(wordbookId, wordId) {
  return `${wordbookId}:${wordId}`;
}

function buildStudyPlan({
  book,
  records = {},
  today = {},
  settings,
  studyType,
}) {
  if (!['new', 'review'].includes(studyType)) {
    throw new Error('学习类型无效');
  }
  const target = studyType === 'review'
    ? settings.dailyNewWords * settings.reviewRatio
    : settings.dailyNewWords;
  const completed = studyType === 'review'
    ? (today.reviewCompleted || 0)
    : (today.newCompleted || 0);
  const remaining = Math.max(0, target - completed);
  if (!remaining) {
    return { words: [], remaining: 0, reason: 'goal-complete' };
  }

  const candidates = book.words.filter((word) => {
    const record = records[recordKey(book.id, word.id)];
    return studyType === 'review' ? Boolean(record) : !record;
  });
  if (studyType === 'review') {
    candidates.sort((left, right) => {
      const leftRecord = records[recordKey(book.id, left.id)];
      const rightRecord = records[recordKey(book.id, right.id)];
      return Number(rightRecord.isWrongWord) - Number(leftRecord.isWrongWord)
        || String(leftRecord.lastStudiedAt || '').localeCompare(
          String(rightRecord.lastStudiedAt || ''),
        );
    });
  }
  if (!candidates.length) {
    return { words: [], remaining, reason: 'no-words' };
  }
  return {
    words: candidates.slice(0, Math.min(ROUND_LIMIT, remaining)),
    remaining,
    reason: 'ready',
  };
}

module.exports = {
  ROUND_LIMIT,
  buildStudyPlan,
  recordKey,
};
