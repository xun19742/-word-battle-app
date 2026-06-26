function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function buildOptions(current, words, random = Math.random) {
  const meanings = [
    ...new Set(
      words
        .filter((word) => word.id !== current.id)
        .map((word) => word.meaning)
        .filter(Boolean),
    ),
  ];
  if (meanings.length < 3) {
    throw new Error('对战题目数量不足');
  }
  // 每道题固定一个正确释义和三个干扰项，选项顺序再打乱。
  return shuffle([current.meaning, ...shuffle(meanings, random).slice(0, 3)], random);
}

function buildBattleQuestions(words, random = Math.random) {
  const validWords = (words || []).filter((word) => (
    word && word.id && word.word && word.meaning
  ));
  if (validWords.length < 10) {
    throw new Error('对战题目数量不足');
  }
  return shuffle(validWords, random).slice(0, 10).map((word) => ({
    wordId: word.id,
    word: word.word,
    meaning: word.meaning,
    options: buildOptions(word, validWords, random),
    correctOption: word.meaning,
  }));
}

module.exports = {
  buildBattleQuestions,
};
