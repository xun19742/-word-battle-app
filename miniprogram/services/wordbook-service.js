const wordbook = require('../data/cet4-core-100');

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

function getBuiltinWordbook() {
  // 返回深一层副本，避免页面状态修改污染内置词书。
  return {
    ...wordbook,
    words: wordbook.words.map((item) => ({ ...item })),
  };
}

function validateWordbook(book) {
  const errors = [];
  if (!book || !Array.isArray(book.words)) {
    return ['词书格式错误'];
  }

  if (book.words.length !== 100) {
    errors.push('词书必须包含 100 个单词');
  }

  const seen = new Set();
  book.words.forEach((item, index) => {
    REQUIRED_FIELDS.forEach((field) => {
      if (item[field] === undefined || item[field] === '') {
        errors.push(`第 ${index + 1} 个单词缺少 ${field}`);
      }
    });

    if (seen.has(item.word)) {
      errors.push(`单词重复：${item.word}`);
    }
    seen.add(item.word);
  });

  return errors;
}

module.exports = {
  getBuiltinWordbook,
  validateWordbook,
};
