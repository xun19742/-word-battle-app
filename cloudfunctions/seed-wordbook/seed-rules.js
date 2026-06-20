const REQUIRED_FIELDS = [
  'id',
  'word',
  'phonetic',
  'meaning',
  'example',
  'exampleTranslation',
  'difficulty',
  'order',
];

function validateSeedData(wordbook) {
  if (!wordbook || wordbook.id !== 'cet4-core-100') {
    throw new Error('词书 ID 必须是 cet4-core-100');
  }
  if (!Array.isArray(wordbook.words) || wordbook.words.length !== 100) {
    throw new Error('词书种子必须包含 100 个单词');
  }
  const ids = new Set();
  const words = new Set();
  wordbook.words.forEach((item) => {
    REQUIRED_FIELDS.forEach((field) => {
      if (item[field] === undefined || item[field] === '') {
        throw new Error(`单词 ${item.id || '未知'} 缺少 ${field}`);
      }
    });
    if (ids.has(item.id) || words.has(item.word)) {
      throw new Error(`词书种子存在重复项：${item.word}`);
    }
    ids.add(item.id);
    words.add(item.word);
  });
  return wordbook;
}

function buildWordDocuments(wordbook) {
  validateSeedData(wordbook);
  return wordbook.words.map((word) => ({
    ...word,
    _id: word.id,
    wordbookId: wordbook.id,
  }));
}

module.exports = {
  validateSeedData,
  buildWordDocuments,
};
