const WORDBOOK_IDS = [
  'cet4',
  'cet6',
  'postgraduate',
  'ielts',
  'cet4-core-100',
];

function mergeLearningRecord(current = {}, answer) {
  return {
    correctCount: (current.correctCount || 0) + (answer.isCorrect ? 1 : 0),
    wrongCount: (current.wrongCount || 0) + (answer.isCorrect ? 0 : 1),
    lastResult: answer.isCorrect ? 'correct' : 'wrong',
    isWrongWord: !answer.isCorrect,
    lastMode: answer.mode,
  };
}

function validateSummary(summary) {
  if (!summary || typeof summary.roundId !== 'string' || !summary.roundId) {
    throw new Error('roundId 不能为空');
  }
  if (!Number.isInteger(summary.total) || summary.total < 1) {
    throw new Error('total 必须是正整数');
  }
  if (!Number.isFinite(summary.score) || summary.score < 0) {
    throw new Error('score 必须是非负数');
  }
  if (!Array.isArray(summary.answers) || summary.answers.length !== summary.total) {
    throw new Error('answers 数量必须与 total 一致');
  }

  const wordbookId = summary.wordbookId || 'cet4-core-100';
  if (!WORDBOOK_IDS.includes(wordbookId)) {
    throw new Error('词书无效');
  }
  const studyType = summary.studyType || 'new';
  if (!['new', 'review'].includes(studyType)) {
    throw new Error('学习类型无效');
  }

  const answers = summary.answers.map((answer) => {
    if (!answer.wordId || typeof answer.isCorrect !== 'boolean') {
      throw new Error('答案字段不完整');
    }
    if (!['flashcard', 'quiz'].includes(answer.mode)) {
      throw new Error('学习模式无效');
    }
    return {
      wordId: answer.wordId,
      isCorrect: answer.isCorrect,
      mode: answer.mode,
    };
  });

  return {
    roundId: summary.roundId,
    wordbookId,
    studyType,
    total: summary.total,
    score: summary.score,
    completedAt: summary.completedAt,
    answers,
  };
}

module.exports = {
  mergeLearningRecord,
  validateSummary,
};
