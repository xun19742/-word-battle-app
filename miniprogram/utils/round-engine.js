function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function createRound(words, size, mode, random = Math.random) {
  if (!['flashcard', 'quiz'].includes(mode)) {
    throw new Error('学习模式无效');
  }
  // 普通设置使用 10/20，错词复习允许按实际数量创建较短轮次。
  if (!Number.isInteger(size) || size < 1 || size > 20) {
    throw new Error('每轮单词数无效');
  }
  if (words.length < size) {
    throw new Error('可用单词数量不足');
  }

  return {
    roundId: `round-${Date.now()}-${Math.floor(random() * 1000000)}`,
    mode,
    size,
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    answeredCurrent: false,
    completed: false,
    items: shuffle(words, random).slice(0, size),
    answers: [],
  };
}

function createQuizOptions(current, allWords, random = Math.random) {
  const distractors = [
    ...new Set(
      allWords
        .filter((item) => item.id !== current.id)
        .map((item) => item.meaning),
    ),
  ];

  if (distractors.length < 3) {
    throw new Error('四选一干扰项不足');
  }

  const selected = shuffle(distractors, random).slice(0, 3);
  return shuffle([current.meaning, ...selected], random);
}

function answerCurrent(round, isCorrect) {
  // 首次作答后锁定当前题，防止快速连点造成重复计分。
  if (round.completed || round.answeredCurrent) {
    return round;
  }

  const word = round.items[round.currentIndex];
  return {
    ...round,
    answeredCurrent: true,
    correctCount: round.correctCount + (isCorrect ? 1 : 0),
    wrongCount: round.wrongCount + (isCorrect ? 0 : 1),
    answers: [
      ...round.answers,
      {
        wordId: word.id,
        isCorrect,
        mode: round.mode,
      },
    ],
  };
}

function nextQuestion(round) {
  if (!round.answeredCurrent) {
    return round;
  }

  const completed = round.currentIndex + 1 >= round.items.length;
  return {
    ...round,
    currentIndex: completed ? round.currentIndex : round.currentIndex + 1,
    answeredCurrent: false,
    completed,
  };
}

function getSummary(round) {
  const answered = round.correctCount + round.wrongCount;
  return {
    roundId: round.roundId,
    mode: round.mode,
    total: round.size,
    correctCount: round.correctCount,
    wrongCount: round.wrongCount,
    accuracy: answered
      ? Math.round((round.correctCount / answered) * 100)
      : 0,
    score: round.correctCount * 10,
    answers: round.answers,
  };
}

module.exports = {
  shuffle,
  createRound,
  createQuizOptions,
  answerCurrent,
  nextQuestion,
  getSummary,
};
