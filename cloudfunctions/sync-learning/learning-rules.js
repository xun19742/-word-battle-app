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
  summary.answers.forEach((answer) => {
    if (!answer.wordId || typeof answer.isCorrect !== 'boolean') {
      throw new Error('答案字段不完整');
    }
    if (!['flashcard', 'quiz'].includes(answer.mode)) {
      throw new Error('学习模式无效');
    }
  });
  return summary;
}

module.exports = {
  mergeLearningRecord,
  validateSummary,
};
